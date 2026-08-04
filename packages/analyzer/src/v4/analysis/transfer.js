import { createFact } from './fact.js';
import { analysisId, locationAnchor, ValueFlowEdge, ValueNode } from './value-node.js';

function compare(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function unique(values) { return [...new Set(values)].sort(compare); }
function children(node) {
  const result = [];
  for (const value of Object.values(node ?? {})) {
    if (Array.isArray(value)) result.push(...value.filter((item) => item?.nodeType));
    else if (value?.nodeType) result.push(value);
  }
  return result;
}

function unwrapCallExpression(expression) {
  let current = expression;
  while (current?.nodeType === 'FunctionCallOptions') current = current.expression;
  return current;
}

function tupleArity(typeString) {
  if (!String(typeString).startsWith('tuple(')) return 0;
  const body = String(typeString).slice(6, -1);
  let depth = 0;
  let count = body ? 1 : 0;
  for (const character of body) {
    if (character === '(' || character === '[') depth += 1;
    else if (character === ')' || character === ']') depth -= 1;
    else if (character === ',' && depth === 0) count += 1;
  }
  return count;
}

const EXPRESSION_TYPES = new Set([
  'Identifier', 'Literal', 'BinaryOperation', 'UnaryOperation', 'Conditional', 'FunctionCall', 'MemberAccess',
  'IndexAccess', 'IndexRangeAccess', 'TupleExpression', 'Assignment', 'ElementaryTypeNameExpression', 'NewExpression',
]);

export function createTransferEngine({ program, callable, cfg, context, nodes, edges, incomplete }) {
  const declarationByAstId = context.declarationByAstId;
  const symbolById = new Map(program.symbols.map((item) => [item.symbolId, item]));
  const contractByName = new Map(program.contracts.map((item) => [item.canonicalName, item]));
  // Modifier-expanded CFGs contain AST nodes owned by the modifier callable.
  // Expression AST IDs are compiler-global, so include those accesses here and
  // re-anchor produced value nodes to the function currently being analyzed.
  const storageByExpression = new Map(program.storageAccesses
    .filter((item) => Number.isInteger(item.expressionAstId))
    .map((item) => [`${item.expressionAstId}:${item.accessKind}`, item]));

  function location(node) { return node?.src ? context.resolveLocation(node.src) : callable.location; }
  function symbolForAst(astId) {
    const declaration = declarationByAstId.get(astId);
    return declaration?.symbolId ? symbolById.get(declaration.symbolId) : null;
  }
  function bindingForSymbol(symbolId) { return `symbol:${symbolId}`; }
  function storageAccess(node, kind) {
    return storageByExpression.get(`${node?.id}:${kind}`)
      ?? (kind === 'read' ? storageByExpression.get(`${node?.id}:read-write`) : null);
  }
  function storageKey(access, node) {
    const dynamic = [];
    let current = node;
    while (current?.nodeType === 'MemberAccess' || current?.nodeType === 'IndexAccess') {
      if (current.nodeType === 'MemberAccess') dynamic.unshift({ kind: 'member', name: current.memberName });
      else dynamic.unshift({ kind: 'index', expressionAstId: current.indexExpression?.id ?? null });
      current = current.expression ?? current.baseExpression;
    }
    return `storage:${access.symbolId}:${JSON.stringify(dynamic)}`;
  }
  function pathConditionsFor(state) {
    const all = new Map();
    for (const fact of state.values()) for (const item of fact.pathConditions ?? []) all.set(JSON.stringify(item), item);
    return [...all.values()].sort((a, b) => compare(JSON.stringify(a), JSON.stringify(b)));
  }
  function makeNode({ node = null, block, valueKind, symbolId = null, storage = null, boundary = null, unknown = false, provenance = null, occurrence = null }) {
    const semantic = {
      callableId: callable.id, valueKind, symbolId, expressionAstId: node?.id ?? null,
      storageAccessId: storage?.accessId ?? null, blockId: block.blockId, occurrence,
      anchor: locationAnchor(node ? location(node) : block.location), boundary, unknown,
    };
    const valueNodeId = analysisId('value-node', semantic);
    if (!nodes.has(valueNodeId)) nodes.set(valueNodeId, new ValueNode({
      valueNodeId, callableId: callable.id, valueKind, symbolId, expressionAstId: node?.id ?? null,
      storageAccessId: storage?.accessId ?? null, storagePath: storage?.pathSegments ?? [],
      location: node ? location(node) : block.location, blockId: block.blockId, boundary, unknown, provenance,
    }));
    return valueNodeId;
  }
  function addEdge(from, to, flowKind, block, state, boundary = null) {
    if (!from || !to) return;
    const pathConditions = pathConditionsFor(state);
    const semantic = { callableId: callable.id, from, to, flowKind, blockId: block.blockId, pathConditions, boundary };
    const edgeId = analysisId('value-flow-edge', semantic);
    if (!edges.has(edgeId)) edges.set(edgeId, new ValueFlowEdge({
      edgeId, callableId: callable.id, fromValueNodeId: from, toValueNodeId: to, flowKind,
      location: block.location, blockId: block.blockId, pathConditions, boundary,
    }));
  }
  function markIncomplete(reason, node, block, details = null) {
    const item = {
      callableId: callable.id, reason, astNodeId: node?.id ?? null, blockId: block.blockId,
      location: node ? location(node) : block.location, details,
    };
    const id = analysisId('analysis-incomplete', { ...item, location: locationAnchor(item.location) });
    if (!incomplete.has(id)) incomplete.set(id, { incompleteId: id, ...item, recoverable: true });
  }
  function ref(nodeIds, valueKind = 'expression') { return { nodeIds: unique(nodeIds), elements: null, valueKind }; }
  function tuple(elements) { return { nodeIds: unique(elements.flatMap((item) => item?.nodeIds ?? [])), elements, valueKind: 'tuple-element' }; }
  function currentValue(state, key) { return state.get(key)?.originIds ?? []; }
  function setBinding(state, key, symbol, valueKind, originIds, node, block, provenance = 'assignment') {
    state.set(key, {
      bindingKey: key, symbolId: symbol?.symbolId ?? null, expressionIdentity: node?.id ?? null,
      valueKind, originIds: unique(originIds), currentLocation: node ? location(node) : block.location,
      pathConditions: pathConditionsFor(state), confidence: 'exact', provenance,
    });
  }

  function statePath(node, accessKind) {
    const access = storageAccess(node, accessKind);
    return access ? { access, key: storageKey(access, node) } : null;
  }

  function identifierValue(node, block, state) {
    const symbol = symbolForAst(node.referencedDeclaration);
    if (!symbol) {
      const unknownId = makeNode({ node, block, valueKind: 'unknown', unknown: true, provenance: 'unresolved-identifier' });
      markIncomplete('unresolved-identifier', node, block, { name: node.name ?? null });
      return ref([unknownId], 'unknown');
    }
    if (symbol.kind === 'state-variable') {
      const access = statePath(node, 'read');
      const key = access?.key ?? `storage:${symbol.symbolId}:[]`;
      const readId = makeNode({ node, block, valueKind: 'state-variable', symbolId: symbol.symbolId, storage: access?.access, provenance: 'state-read' });
      const prior = currentValue(state, key);
      for (const origin of prior) addEdge(origin, readId, 'state-read-after-write', block, state);
      return ref([readId], 'state-variable');
    }
    const key = bindingForSymbol(symbol.symbolId);
    const referenceId = makeNode({ node, block, valueKind: symbol.kind, symbolId: symbol.symbolId, provenance: 'reference' });
    const origins = currentValue(state, key);
    if (!origins.length) {
      const unknownId = makeNode({ node, block, valueKind: 'unknown', symbolId: symbol.symbolId, unknown: true, provenance: 'uninitialized-reference' });
      addEdge(unknownId, referenceId, 'unknown-reference', block, state);
      markIncomplete('uninitialized-or-unmodeled-value', node, block, { symbolId: symbol.symbolId });
    } else for (const origin of origins) addEdge(origin, referenceId, 'reference', block, state);
    return ref([referenceId], symbol.kind);
  }

  function evaluateCall(node, block, state, needResult) {
    if (node.kind === 'typeConversion') {
      const input = evaluate(node.arguments?.[0], block, state, true);
      const resultId = makeNode({ node, block, valueKind: 'expression', provenance: 'type-conversion' });
      for (const origin of input.nodeIds) addEdge(origin, resultId, 'type-conversion', block, state);
      return ref([resultId]);
    }
    const callExpression = unwrapCallExpression(node.expression);
    const calleeDeclaration = declarationByAstId.get(callExpression?.referencedDeclaration);
    if (callExpression?.nodeType === 'Identifier'
      && String(callExpression.typeDescriptions?.typeString ?? '').startsWith('function (')
      && !['function', 'modifier'].includes(calleeDeclaration?.kind)) {
      markIncomplete('unresolved-function-pointer', node, block, { referencedDeclaration: callExpression.referencedDeclaration ?? null });
    }
    if (callExpression?.nodeType === 'NewExpression') evaluate(callExpression, block, state, true);
    const targetContract = calleeDeclaration?.contractContext ? contractByName.get(calleeDeclaration.contractContext) : null;
    const receiver = callExpression?.nodeType === 'MemberAccess' ? callExpression.expression : null;
    if (targetContract?.contractKind === 'library'
      && receiver && !String(receiver.typeDescriptions?.typeString ?? '').startsWith('type(library ')) {
      const value = evaluate(receiver, block, state, true);
      const boundaryId = makeNode({ node: receiver, block, valueKind: 'expression', boundary: 'call-argument', provenance: 'call-argument:receiver', occurrence: `arg:receiver:call:${node.id}` });
      for (const origin of value.nodeIds) addEdge(origin, boundaryId, 'call-argument', block, state, 'call-argument');
    }
    for (let index = 0; index < (node.arguments ?? []).length; index += 1) {
      const argument = evaluate(node.arguments[index], block, state, true);
      const boundaryId = makeNode({ node: node.arguments[index], block, valueKind: 'expression', boundary: 'call-argument', provenance: `call-argument:${index}`, occurrence: `arg:${index}:call:${node.id}` });
      for (const origin of argument.nodeIds) addEdge(origin, boundaryId, 'call-argument', block, state, 'call-argument');
    }
    if (!needResult) return ref([]);
    const arity = tupleArity(node.typeDescriptions?.typeString);
    if (arity > 1) return tuple(Array.from({ length: arity }, (_, index) => ref([makeNode({
      node, block, valueKind: 'tuple-element', boundary: 'call-result', unknown: true,
      provenance: `call-result:${index}`, occurrence: `call-result:${node.id}:${index}`,
    })], 'tuple-element')));
    const resultId = makeNode({ node, block, valueKind: 'call-result', boundary: 'call-result', unknown: true, provenance: 'intraprocedural-call-boundary' });
    markIncomplete('call-result-not-propagated-interprocedurally', node, block);
    return ref([resultId], 'call-result');
  }

  function evaluateStatePath(node, block, state) {
    const path = statePath(node, 'read');
    if (!path) return null;
    if (node.nodeType === 'IndexAccess') {
      evaluate(node.indexExpression, block, state, true);
      if (node.indexExpression?.nodeType !== 'Literal') markIncomplete('dynamic-storage-alias-not-modeled', node, block, { storageAccessId: path.access.accessId });
    }
    const readId = makeNode({ node, block, valueKind: 'state-variable', symbolId: path.access.symbolId, storage: path.access, provenance: 'state-read' });
    for (const origin of currentValue(state, path.key)) addEdge(origin, readId, 'state-read-after-write', block, state);
    return ref([readId], 'state-variable');
  }

  function evaluate(node, block, state, needResult = true) {
    if (!node) return ref([]);
    if (node.nodeType === 'Identifier') return identifierValue(node, block, state);
    if (node.nodeType === 'Literal') return ref([makeNode({ node, block, valueKind: 'literal', provenance: 'literal' })], 'literal');
    if (node.nodeType === 'TupleExpression') return tuple((node.components ?? []).map((item, index) => {
      if (!item) return ref([], 'unknown');
      const value = evaluate(item, block, state, true);
      const elementId = makeNode({ node: item, block, valueKind: 'tuple-element', provenance: `tuple-element:${index}`, occurrence: `tuple:${node.id}:${index}` });
      for (const origin of value.nodeIds) addEdge(origin, elementId, 'tuple-element', block, state);
      return ref([elementId], 'tuple-element');
    }));
    if (node.nodeType === 'Assignment') return assign(node.leftHandSide, evaluate(node.rightHandSide, block, state, true), node, block, state, node.operator);
    if (node.nodeType === 'FunctionCall') return evaluateCall(node, block, state, needResult);
    if (['MemberAccess', 'IndexAccess', 'IndexRangeAccess'].includes(node.nodeType)) {
      const storage = evaluateStatePath(node, block, state);
      if (storage) return storage;
      const parts = node.nodeType === 'MemberAccess' ? [node.expression]
        : [node.baseExpression, node.indexExpression, node.startExpression, node.endExpression].filter(Boolean);
      const origins = parts.flatMap((item) => evaluate(item, block, state, true).nodeIds);
      const resultId = makeNode({ node, block, valueKind: 'expression', provenance: node.nodeType });
      for (const origin of origins) addEdge(origin, resultId, node.nodeType, block, state);
      return ref([resultId]);
    }
    if (node.nodeType === 'UnaryOperation') {
      const input = evaluate(node.subExpression, block, state, true);
      const resultId = makeNode({ node, block, valueKind: 'expression', provenance: `unary:${node.operator}` });
      for (const origin of input.nodeIds) addEdge(origin, resultId, 'unary-operation', block, state);
      if (['++', '--', 'delete'].includes(node.operator)) return assign(node.subExpression, ref([resultId]), node, block, state, node.operator);
      return ref([resultId]);
    }
    if (node.nodeType === 'BinaryOperation') {
      const left = evaluate(node.leftExpression, block, state, true);
      const right = evaluate(node.rightExpression, block, state, true);
      const resultId = makeNode({ node, block, valueKind: 'expression', provenance: `binary:${node.operator}` });
      for (const origin of [...left.nodeIds, ...right.nodeIds]) addEdge(origin, resultId, 'binary-operation', block, state);
      return ref([resultId]);
    }
    if (node.nodeType === 'Conditional') {
      evaluate(node.condition, block, state, true);
      const yes = evaluate(node.trueExpression, block, state, true);
      const no = evaluate(node.falseExpression, block, state, true);
      const resultId = makeNode({ node, block, valueKind: 'expression', provenance: 'conditional-expression' });
      for (const origin of yes.nodeIds) addEdge(origin, resultId, 'conditional-true', block, state);
      for (const origin of no.nodeIds) addEdge(origin, resultId, 'conditional-false', block, state);
      return ref([resultId]);
    }
    if (node.nodeType === 'ElementaryTypeNameExpression') return ref([makeNode({ node, block, valueKind: 'expression', provenance: 'type-expression' })]);
    if (node.nodeType === 'NewExpression') {
      const unknownId = makeNode({ node, block, valueKind: 'unknown', unknown: true, provenance: 'new-expression' });
      markIncomplete('unsupported-new-expression', node, block);
      return ref([unknownId], 'unknown');
    }
    const origins = children(node).filter((item) => EXPRESSION_TYPES.has(item.nodeType)).flatMap((item) => evaluate(item, block, state, true).nodeIds);
    const unknownId = makeNode({ node, block, valueKind: 'unknown', unknown: true, provenance: `unsupported:${node.nodeType}` });
    for (const origin of origins) addEdge(origin, unknownId, 'unsupported-expression', block, state);
    markIncomplete('unsupported-expression', node, block, { nodeType: node.nodeType });
    return ref([unknownId], 'unknown');
  }

  function assignOne(target, value, assignmentNode, block, state, operator, index = null) {
    if (!target) return value;
    const sourceIds = [...value.nodeIds];
    const compound = operator !== '=' && operator !== 'delete';
    const storage = statePath(target, compound ? 'read-write' : 'write');
    if (storage) {
      if (target.nodeType === 'IndexAccess') {
        evaluate(target.indexExpression, block, state, true);
        if (target.indexExpression?.nodeType !== 'Literal') markIncomplete('dynamic-storage-alias-not-modeled', target, block, { storageAccessId: storage.access.accessId });
      }
      if (compound) sourceIds.push(...currentValue(state, storage.key));
      const writeId = makeNode({ node: target, block, valueKind: 'state-variable', symbolId: storage.access.symbolId, storage: storage.access, provenance: `state-write:${operator}`, occurrence: `assign:${assignmentNode.id}:${index ?? 0}` });
      for (const origin of unique(sourceIds)) addEdge(origin, writeId, compound ? 'compound-state-write' : 'state-write', block, state);
      setBinding(state, storage.key, symbolById.get(storage.access.symbolId), 'state-variable', [writeId], target, block, 'state-write');
      return ref([writeId], 'state-variable');
    }
    if (target.nodeType === 'Identifier') {
      const symbol = symbolForAst(target.referencedDeclaration);
      if (!symbol) {
        markIncomplete('unresolved-assignment-target', target, block);
        return value;
      }
      const key = bindingForSymbol(symbol.symbolId);
      if (compound) sourceIds.push(...currentValue(state, key));
      const assignedId = makeNode({ node: target, block, valueKind: symbol.kind, symbolId: symbol.symbolId, provenance: `assignment:${operator}`, occurrence: `assign:${assignmentNode.id}:${index ?? 0}` });
      for (const origin of unique(sourceIds)) addEdge(origin, assignedId, compound ? 'compound-assignment' : 'assignment', block, state);
      setBinding(state, key, symbol, symbol.kind, [assignedId], target, block);
      return ref([assignedId], symbol.kind);
    }
    markIncomplete('unsupported-assignment-target', target, block, { nodeType: target.nodeType });
    return value;
  }

  function assign(target, value, assignmentNode, block, state, operator = '=') {
    if (target?.nodeType === 'TupleExpression') {
      const components = target.components ?? [];
      const values = value.elements ?? components.map(() => value);
      const assigned = components.map((item, index) => assignOne(item, values[index] ?? ref([], 'unknown'), assignmentNode, block, state, operator, index));
      return tuple(assigned);
    }
    return assignOne(target, value, assignmentNode, block, state, operator);
  }

  function declare(node, block, state) {
    const initial = node.initialValue ? evaluate(node.initialValue, block, state, true) : ref([]);
    const declarations = node.declarations ?? [];
    const values = initial.elements ?? declarations.map(() => initial);
    for (let index = 0; index < declarations.length; index += 1) {
      const declarationNode = declarations[index];
      if (!declarationNode) continue;
      const symbol = symbolForAst(declarationNode.id);
      if (!symbol) continue;
      const declaredId = makeNode({ node: declarationNode, block, valueKind: 'local-variable', symbolId: symbol.symbolId, provenance: 'declaration', occurrence: `declaration:${node.id}:${index}` });
      for (const origin of values[index]?.nodeIds ?? []) addEdge(origin, declaredId, 'declaration-initializer', block, state);
      setBinding(state, bindingForSymbol(symbol.symbolId), symbol, 'local-variable', [declaredId], declarationNode, block, 'declaration');
    }
  }

  function boundaryArguments(node, kind, block, state) {
    const call = node.eventCall ?? node.errorCall ?? node.expression ?? null;
    const argumentsList = call?.arguments ?? [];
    for (let index = 0; index < argumentsList.length; index += 1) {
      const value = evaluate(argumentsList[index], block, state, true);
      const boundaryId = makeNode({ node: argumentsList[index], block, valueKind: 'expression', boundary: kind, provenance: `${kind}:${index}`, occurrence: `${kind}:${node.id}:${index}` });
      for (const origin of value.nodeIds) addEdge(origin, boundaryId, kind, block, state, kind);
    }
  }

  function transferAst(node, block, state) {
    if (!node) return;
    if (node.nodeType === 'VariableDeclarationStatement') { declare(node, block, state); return; }
    if (node.nodeType === 'ExpressionStatement') { evaluate(node.expression, block, state, false); return; }
    if (node.nodeType === 'Return') {
      const value = evaluate(node.expression, block, state, true);
      const returnSymbols = (callable.returnParameterIds ?? []).map((id) => symbolById.get(program.declarations.find((item) => item.id === id)?.symbolId)).filter(Boolean);
      if (!returnSymbols.length) {
        const boundaryId = makeNode({ node, block, valueKind: 'return-parameter', boundary: 'return', provenance: 'return' });
        for (const origin of value.nodeIds) addEdge(origin, boundaryId, 'return', block, state, 'return');
      } else for (let index = 0; index < returnSymbols.length; index += 1) {
        const symbol = returnSymbols[index];
        const origins = value.elements?.[index]?.nodeIds ?? value.nodeIds;
        const returnId = makeNode({ node, block, valueKind: 'return-parameter', symbolId: symbol.symbolId, boundary: 'return', provenance: `return:${index}`, occurrence: `return:${index}` });
        for (const origin of origins) addEdge(origin, returnId, 'return', block, state, 'return');
        setBinding(state, bindingForSymbol(symbol.symbolId), symbol, 'return-parameter', [returnId], node, block, 'return');
      }
      return;
    }
    if (node.nodeType === 'EmitStatement') { boundaryArguments(node, 'emit-argument', block, state); return; }
    if (node.nodeType === 'RevertStatement') { boundaryArguments(node, 'revert-argument', block, state); return; }
    if (node.nodeType === 'InlineAssembly') {
      const unknownId = makeNode({ node, block, valueKind: 'unknown', unknown: true, boundary: 'inline-assembly', provenance: 'inline-assembly' });
      markIncomplete('inline-assembly-not-modeled', node, block, { unknownValueNodeId: unknownId });
      return;
    }
    if (['IfStatement', 'ForStatement', 'WhileStatement', 'DoWhileStatement'].includes(node.nodeType)) {
      if (node.condition) evaluate(node.condition, block, state, true);
      if (node.initializationExpression && block.kind === 'loop-initializer') transferAst(node.initializationExpression, block, state);
      if (node.loopExpression && block.kind === 'loop-iteration') transferAst(node.loopExpression, block, state);
      return;
    }
    if (node.nodeType === 'TryStatement') { markIncomplete('try-catch-not-modeled', node, block); return; }
    if (EXPRESSION_TYPES.has(node.nodeType)) { evaluate(node, block, state, false); return; }
    if (!['Block', 'UncheckedBlock', 'Break', 'Continue', 'PlaceholderStatement'].includes(node.nodeType)) {
      markIncomplete('unsupported-statement', node, block, { nodeType: node.nodeType });
    }
  }

  function initializeEntry(block, state) {
    for (const declarationId of callable.parameterIds ?? []) {
      const declaration = program.declarations.find((item) => item.id === declarationId);
      const symbol = declaration?.symbolId ? symbolById.get(declaration.symbolId) : null;
      if (!symbol) continue;
      const parameterId = makeNode({ node: context.astById.get(declaration.astNodeId), block, valueKind: 'parameter', symbolId: symbol.symbolId, provenance: 'parameter-initialization' });
      setBinding(state, bindingForSymbol(symbol.symbolId), symbol, 'parameter', [parameterId], context.astById.get(declaration.astNodeId), block, 'parameter');
    }
    for (const declarationId of callable.returnParameterIds ?? []) {
      const declaration = program.declarations.find((item) => item.id === declarationId);
      const symbol = declaration?.symbolId ? symbolById.get(declaration.symbolId) : null;
      if (!symbol) continue;
      const unknownId = makeNode({ node: context.astById.get(declaration.astNodeId), block, valueKind: 'unknown', symbolId: symbol.symbolId, unknown: true, provenance: 'default-return-value' });
      setBinding(state, bindingForSymbol(symbol.symbolId), symbol, 'return-parameter', [unknownId], context.astById.get(declaration.astNodeId), block, 'default-return-value');
    }
  }

  function materializeNormalReturns(block, state) {
    for (let index = 0; index < (callable.returnParameterIds ?? []).length; index += 1) {
      const declaration = program.declarations.find((item) => item.id === callable.returnParameterIds[index]);
      const symbol = declaration?.symbolId ? symbolById.get(declaration.symbolId) : null;
      if (!symbol) continue;
      const origins = currentValue(state, bindingForSymbol(symbol.symbolId));
      const returnId = makeNode({
        node: context.astById.get(declaration.astNodeId), block, valueKind: 'return-parameter', symbolId: symbol.symbolId,
        boundary: 'return', provenance: `return:${index}`, occurrence: `normal-exit:return:${index}`,
      });
      for (const origin of origins) addEdge(origin, returnId, 'return', block, state, 'return');
      setBinding(state, bindingForSymbol(symbol.symbolId), symbol, 'return-parameter', [returnId], context.astById.get(declaration.astNodeId), block, 'return');
    }
  }

  function transferBlock(block, inputState) {
    const state = new Map([...inputState].map(([key, value]) => [key, { ...value, originIds: [...value.originIds], pathConditions: [...value.pathConditions] }]));
    if (block.blockId === cfg.entryBlockId) initializeEntry(block, state);
    for (const astId of block.statementAstIds) transferAst(context.astById.get(astId), block, state);
    if (block.blockId === cfg.normalExitBlockId) materializeNormalReturns(block, state);
    return state;
  }

  function factsFromStates(states) {
    const facts = [];
    for (const [blockId, state] of [...states].sort(([a], [b]) => compare(a, b))) {
      for (const [bindingKey, value] of [...state].sort(([a], [b]) => compare(a, b))) facts.push(createFact({ ...value, callableId: callable.id, blockId, bindingKey }));
    }
    return facts.sort((a, b) => compare(a.factId, b.factId));
  }

  return { transferBlock, factsFromStates };
}
