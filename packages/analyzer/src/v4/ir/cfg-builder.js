import { compareCodePoints } from '../frontend/standard-json.js';
import { deterministicId, locationAnchor } from './ids.js';
import { BasicBlock, ControlFlowEdge, ControlFlowGraph, Terminator } from './cfg.js';
import { createGraphContext } from './graph-context.js';

function flowFromAst(node, path, placeholderReplacement = null) {
  if (!node) return null;
  const flow = { node, path, kind: node.nodeType };
  if (['Block', 'UncheckedBlock'].includes(node.nodeType)) {
    flow.statements = (node.statements ?? []).map((statement, index) => flowFromAst(statement, `${path}/s${index}`, placeholderReplacement));
  } else if (node.nodeType === 'IfStatement') {
    flow.trueBody = flowFromAst(node.trueBody, `${path}/true`, placeholderReplacement);
    flow.falseBody = flowFromAst(node.falseBody, `${path}/false`, placeholderReplacement);
  } else if (['ForStatement', 'WhileStatement', 'DoWhileStatement'].includes(node.nodeType)) {
    flow.body = flowFromAst(node.body, `${path}/body`, placeholderReplacement);
  } else if (node.nodeType === 'PlaceholderStatement') {
    flow.replacement = placeholderReplacement;
  }
  return flow;
}

function countPlaceholders(node) {
  let count = 0;
  const worklist = [node];
  while (worklist.length) {
    const current = worklist.pop();
    if (!current?.nodeType) continue;
    if (current.nodeType === 'PlaceholderStatement') count += 1;
    for (const value of Object.values(current)) {
      if (Array.isArray(value)) worklist.push(...value.filter((item) => item?.nodeType));
      else if (value?.nodeType) worklist.push(value);
    }
  }
  return count;
}

function callName(call) {
  const expression = call?.expression;
  if (expression?.nodeType === 'Identifier') return expression.name;
  if (expression?.nodeType === 'MemberAccess') return expression.memberName;
  return null;
}

class CFGBuilder {
  constructor(callable, context, flow, unsupportedControlFlow, modifierOrder) {
    this.callable = callable;
    this.context = context;
    this.flow = flow;
    this.cfgId = deterministicId('cfg', { callableId: callable.id, canonicalName: callable.canonicalName });
    this.blocks = [];
    this.blockById = new Map();
    this.edges = [];
    this.edgeById = new Map();
    this.unsupportedControlFlow = unsupportedControlFlow;
    this.modifierOrder = modifierOrder;
    this.entry = this.makeBlock('entry', null, 'entry', true, []);
    this.normalExit = this.makeBlock('normal-exit', null, 'normal-exit', false, []);
    this.revertExit = this.makeBlock('revert-exit', null, 'revert-exit', false, []);
  }

  makeBlock(kind, node, occurrence, reachable, statementAstIds = null) {
    const location = node?.src ? this.context.resolveLocation(node.src) : this.callable.location;
    const blockId = deterministicId('cfg-block', {
      cfgId: this.cfgId, kind, occurrence, sourcePath: location?.sourcePath ?? this.callable.sourcePath,
      anchor: locationAnchor(location),
    });
    if (this.blockById.has(blockId)) return this.blockById.get(blockId);
    const block = new BasicBlock({
      blockId, callableId: this.callable.id, kind,
      statementAstIds: statementAstIds ?? (Number.isInteger(node?.id) ? [node.id] : []),
      location, unreachable: !reachable,
    });
    this.blocks.push(block);
    this.blockById.set(blockId, block);
    return block;
  }

  addEdge(from, to, edgeKind, conditionAstId = null, reachable = true) {
    const fromId = typeof from === 'string' ? from : from.blockId;
    const toId = typeof to === 'string' ? to : to.blockId;
    const edgeId = deterministicId('cfg-edge', { cfgId: this.cfgId, fromBlockId: fromId, toBlockId: toId, edgeKind, conditionAstId });
    if (this.edgeById.has(edgeId)) return this.edgeById.get(edgeId);
    const edge = new ControlFlowEdge({ edgeId, cfgId: this.cfgId, fromBlockId: fromId, toBlockId: toId, edgeKind, conditionAstId, reachable });
    this.edges.push(edge);
    this.edgeById.set(edgeId, edge);
    const fromBlock = this.blockById.get(fromId);
    const toBlock = this.blockById.get(toId);
    fromBlock.successorIds.push(toId);
    toBlock.predecessorIds.push(fromId);
    if (reachable) toBlock.unreachable = false;
    return edge;
  }

  connectIncoming(incoming, block, edgeKind = 'next', conditionAstId = null) {
    for (const item of incoming) this.addEdge(item.blockId, block, edgeKind, conditionAstId, item.reachable);
  }

  tail(block, reachable = !block.unreachable) { return { blockId: block.blockId, reachable }; }

  buildSequence(statements, incoming, path, loopContext = null, firstEdgeKind = 'next', firstConditionAstId = null) {
    let tails = incoming;
    let entryId = null;
    for (let index = 0; index < statements.length; index += 1) {
      const result = this.buildStatement(statements[index], tails, `${path}/${index}`, loopContext, index === 0 ? firstEdgeKind : 'next', index === 0 ? firstConditionAstId : null);
      if (!entryId) entryId = result.entryId;
      tails = result.tails;
    }
    return { entryId, tails };
  }

  buildStatement(flow, incoming, occurrence, loopContext, incomingKind = 'next', incomingConditionAstId = null) {
    if (!flow) return { entryId: null, tails: incoming };
    const node = flow.node;
    const reachable = incoming.some((item) => item.reachable);

    if (node.nodeType === 'Block') {
      return this.buildSequence(flow.statements, incoming, `${occurrence}/block`, loopContext, incomingKind, incomingConditionAstId);
    }
    if (node.nodeType === 'UncheckedBlock') {
      const marker = this.makeBlock('unchecked', node, `${occurrence}/unchecked`, reachable);
      this.connectIncoming(incoming, marker, incomingKind, incomingConditionAstId);
      const nested = this.buildSequence(flow.statements, [this.tail(marker, reachable)], `${occurrence}/unchecked-body`, loopContext);
      return { entryId: marker.blockId, tails: nested.tails };
    }
    if (node.nodeType === 'PlaceholderStatement') {
      if (flow.replacement) {
        return this.buildStatement(flow.replacement, incoming, `${occurrence}/placeholder:${node.id}`, loopContext, incomingKind, incomingConditionAstId);
      }
      const placeholder = this.makeBlock('modifier-placeholder', node, `${occurrence}/placeholder`, reachable);
      this.connectIncoming(incoming, placeholder, incomingKind, incomingConditionAstId);
      placeholder.terminator = new Terminator({ kind: 'placeholder', astNodeId: node.id, location: placeholder.location });
      return { entryId: placeholder.blockId, tails: [this.tail(placeholder, reachable)] };
    }

    if (node.nodeType === 'IfStatement') return this.buildIf(flow, incoming, occurrence, loopContext, incomingKind, incomingConditionAstId);
    if (node.nodeType === 'ForStatement') return this.buildFor(flow, incoming, occurrence, loopContext, incomingKind, incomingConditionAstId);
    if (node.nodeType === 'WhileStatement') return this.buildWhile(flow, incoming, occurrence, loopContext, incomingKind, incomingConditionAstId, false);
    if (node.nodeType === 'DoWhileStatement') return this.buildWhile(flow, incoming, occurrence, loopContext, incomingKind, incomingConditionAstId, true);
    if (node.nodeType === 'TryStatement') {
      const block = this.makeBlock('unsupported-try', node, occurrence, reachable);
      this.connectIncoming(incoming, block, incomingKind, incomingConditionAstId);
      this.unsupportedControlFlow.push({ nodeType: 'TryStatement', astNodeId: node.id, location: block.location, reason: 'try/catch CFG is not modeled in Phase 2B-2' });
      return { entryId: block.blockId, tails: [this.tail(block, reachable)] };
    }

    const blockKind = {
      Return: 'return', RevertStatement: 'revert', Break: 'break', Continue: 'continue', EmitStatement: 'emit',
    }[node.nodeType] ?? 'statement';
    const block = this.makeBlock(blockKind, node, occurrence, reachable);
    this.connectIncoming(incoming, block, incomingKind, incomingConditionAstId);

    if (node.nodeType === 'Return') {
      block.terminator = new Terminator({ kind: 'return', astNodeId: node.id, location: block.location, targetBlockIds: [this.normalExit.blockId] });
      this.addEdge(block, this.normalExit, 'return', null, reachable);
      return { entryId: block.blockId, tails: [] };
    }
    if (node.nodeType === 'RevertStatement') {
      block.terminator = new Terminator({ kind: 'revert', astNodeId: node.id, location: block.location, targetBlockIds: [this.revertExit.blockId] });
      this.addEdge(block, this.revertExit, 'revert', null, reachable);
      return { entryId: block.blockId, tails: [] };
    }
    if (node.nodeType === 'Break') {
      if (!loopContext?.breakTarget) this.unsupportedControlFlow.push({ nodeType: 'Break', astNodeId: node.id, location: block.location, reason: 'break outside modeled loop' });
      else this.addEdge(block, loopContext.breakTarget, 'break', null, reachable);
      block.terminator = new Terminator({ kind: 'break', astNodeId: node.id, location: block.location, targetBlockIds: loopContext?.breakTarget ? [loopContext.breakTarget.blockId] : [] });
      return { entryId: block.blockId, tails: [] };
    }
    if (node.nodeType === 'Continue') {
      if (!loopContext?.continueTarget) this.unsupportedControlFlow.push({ nodeType: 'Continue', astNodeId: node.id, location: block.location, reason: 'continue outside modeled loop' });
      else this.addEdge(block, loopContext.continueTarget, 'continue', null, reachable);
      block.terminator = new Terminator({ kind: 'continue', astNodeId: node.id, location: block.location, targetBlockIds: loopContext?.continueTarget ? [loopContext.continueTarget.blockId] : [] });
      return { entryId: block.blockId, tails: [] };
    }

    const call = node.nodeType === 'ExpressionStatement' ? node.expression : null;
    const name = call?.nodeType === 'FunctionCall' ? callName(call) : null;
    if (['require', 'assert'].includes(name)) {
      block.kind = name;
      block.terminator = new Terminator({ kind: 'conditional-revert', astNodeId: node.id, location: block.location, targetBlockIds: [this.revertExit.blockId], conditionAstId: call.arguments?.[0]?.id ?? null });
      this.addEdge(block, this.revertExit, `${name}-failure`, call.arguments?.[0]?.id ?? null, reachable);
    } else if (name === 'revert') {
      block.kind = 'revert';
      block.terminator = new Terminator({ kind: 'revert', astNodeId: node.id, location: block.location, targetBlockIds: [this.revertExit.blockId] });
      this.addEdge(block, this.revertExit, 'revert', null, reachable);
      return { entryId: block.blockId, tails: [] };
    }
    return { entryId: block.blockId, tails: [this.tail(block, reachable)] };
  }

  buildIf(flow, incoming, occurrence, loopContext, incomingKind, incomingConditionAstId) {
    const node = flow.node;
    const reachable = incoming.some((item) => item.reachable);
    const condition = this.makeBlock('branch', node, `${occurrence}/condition`, reachable);
    this.connectIncoming(incoming, condition, incomingKind, incomingConditionAstId);
    const conditionAstId = node.condition?.id ?? null;
    const trueResult = this.buildStatement(flow.trueBody, [this.tail(condition, reachable)], `${occurrence}/true`, loopContext, 'true', conditionAstId);
    const falseResult = flow.falseBody
      ? this.buildStatement(flow.falseBody, [this.tail(condition, reachable)], `${occurrence}/false`, loopContext, 'false', conditionAstId)
      : { entryId: null, tails: [this.tail(condition, reachable)] };
    const mergeReachable = [...trueResult.tails, ...falseResult.tails].some((item) => item.reachable);
    const merge = this.makeBlock('branch-merge', node, `${occurrence}/merge`, mergeReachable, []);
    for (const tail of trueResult.tails) this.addEdge(tail.blockId, merge, trueResult.entryId ? 'merge' : 'true', trueResult.entryId ? null : conditionAstId, tail.reachable);
    if (flow.falseBody) for (const tail of falseResult.tails) this.addEdge(tail.blockId, merge, falseResult.entryId ? 'merge' : 'false', falseResult.entryId ? null : conditionAstId, tail.reachable);
    else this.addEdge(condition, merge, 'false', conditionAstId, reachable);
    condition.terminator = new Terminator({
      kind: 'branch', astNodeId: node.id, location: condition.location, conditionAstId,
      targetBlockIds: [trueResult.entryId, flow.falseBody ? falseResult.entryId : merge.blockId].filter(Boolean),
    });
    return { entryId: condition.blockId, tails: [this.tail(merge, mergeReachable)] };
  }

  buildFor(flow, incoming, occurrence, outerLoop, incomingKind, incomingConditionAstId) {
    const node = flow.node;
    const reachable = incoming.some((item) => item.reachable);
    let tails = incoming;
    let entryId = null;
    if (node.initializationExpression) {
      const initializer = this.makeBlock('loop-initializer', node.initializationExpression, `${occurrence}/initializer`, reachable);
      this.connectIncoming(tails, initializer, incomingKind, incomingConditionAstId);
      tails = [this.tail(initializer, reachable)];
      entryId = initializer.blockId;
      incomingKind = 'next';
      incomingConditionAstId = null;
    }
    const condition = this.makeBlock('loop-condition', node.condition ?? node, `${occurrence}/condition`, tails.some((item) => item.reachable));
    this.connectIncoming(tails, condition, incomingKind, incomingConditionAstId);
    entryId ??= condition.blockId;
    const after = this.makeBlock('loop-exit', node, `${occurrence}/exit`, Boolean(node.condition) && !condition.unreachable, []);
    const iteration = node.loopExpression
      ? this.makeBlock('loop-iteration', node.loopExpression, `${occurrence}/iteration`, false)
      : condition;
    const bodyEntry = this.makeBlock('loop-body-entry', node.body, `${occurrence}/body-entry`, !condition.unreachable, []);
    this.addEdge(condition, bodyEntry, 'loop-true', node.condition?.id ?? null, !condition.unreachable);
    if (node.condition) this.addEdge(condition, after, 'loop-false', node.condition.id, !condition.unreachable);
    const loopContext = { breakTarget: after, continueTarget: iteration };
    const body = this.buildStatement(flow.body, [this.tail(bodyEntry, !bodyEntry.unreachable)], `${occurrence}/body`, loopContext);
    for (const tail of body.tails) this.addEdge(tail.blockId, iteration, 'loop-continue', null, tail.reachable);
    if (iteration !== condition) this.addEdge(iteration, condition, 'loop-back', null, !iteration.unreachable);
    condition.terminator = new Terminator({ kind: 'loop-condition', astNodeId: node.id, location: condition.location, conditionAstId: node.condition?.id ?? null, targetBlockIds: [bodyEntry.blockId, ...(node.condition ? [after.blockId] : [])] });
    if (iteration !== condition) iteration.terminator = new Terminator({ kind: 'loop-iteration', astNodeId: node.loopExpression.id, location: iteration.location, targetBlockIds: [condition.blockId] });
    return { entryId, tails: [this.tail(after, !after.unreachable)] };
  }

  buildWhile(flow, incoming, occurrence, outerLoop, incomingKind, incomingConditionAstId, doWhile) {
    const node = flow.node;
    const reachable = incoming.some((item) => item.reachable);
    const condition = this.makeBlock('loop-condition', node.condition, `${occurrence}/condition`, doWhile ? false : reachable);
    const after = this.makeBlock('loop-exit', node, `${occurrence}/exit`, doWhile ? false : reachable, []);
    const bodyEntry = this.makeBlock('loop-body-entry', node.body, `${occurrence}/body-entry`, reachable, []);
    if (doWhile) this.connectIncoming(incoming, bodyEntry, incomingKind, incomingConditionAstId);
    else this.connectIncoming(incoming, condition, incomingKind, incomingConditionAstId);
    if (!doWhile) {
      this.addEdge(condition, bodyEntry, 'loop-true', node.condition?.id ?? null, reachable);
      this.addEdge(condition, after, 'loop-false', node.condition?.id ?? null, reachable);
    }
    const loopContext = { breakTarget: after, continueTarget: condition };
    const body = this.buildStatement(flow.body, [this.tail(bodyEntry, reachable)], `${occurrence}/body`, loopContext);
    for (const tail of body.tails) this.addEdge(tail.blockId, condition, 'loop-back', null, tail.reachable);
    if (doWhile) {
      const conditionReachable = !condition.unreachable;
      this.addEdge(condition, bodyEntry, 'loop-true', node.condition?.id ?? null, conditionReachable);
      this.addEdge(condition, after, 'loop-false', node.condition?.id ?? null, conditionReachable);
    }
    condition.terminator = new Terminator({ kind: 'loop-condition', astNodeId: node.id, location: condition.location, conditionAstId: node.condition?.id ?? null, targetBlockIds: [bodyEntry.blockId, after.blockId] });
    return { entryId: doWhile ? bodyEntry.blockId : condition.blockId, tails: [this.tail(after, !after.unreachable)] };
  }

  build() {
    const result = this.buildStatement(this.flow, [this.tail(this.entry, true)], 'root', null);
    for (const tail of result.tails) this.addEdge(tail.blockId, this.normalExit, 'normal-exit', null, tail.reachable);
    if (!result.entryId) this.addEdge(this.entry, this.normalExit, 'normal-exit', null, true);
    for (const block of this.blocks) {
      block.predecessorIds = [...new Set(block.predecessorIds)].sort(compareCodePoints);
      block.successorIds = [...new Set(block.successorIds)].sort(compareCodePoints);
      if (block.terminator?.targetBlockIds) block.terminator.targetBlockIds = [...new Set(block.terminator.targetBlockIds)].sort(compareCodePoints);
      if (block.terminator?.kind === 'conditional-revert') block.terminator.targetBlockIds = [...block.successorIds];
    }
    this.blocks.sort((left, right) => compareCodePoints(left.blockId, right.blockId));
    this.edges.sort((left, right) => compareCodePoints(left.edgeId, right.edgeId));
    this.unsupportedControlFlow.sort((left, right) => compareCodePoints(left.location?.sourcePath ?? '', right.location?.sourcePath ?? '')
      || (left.location?.byteStart ?? -1) - (right.location?.byteStart ?? -1)
      || compareCodePoints(left.nodeType, right.nodeType));
    return new ControlFlowGraph({
      cfgId: this.cfgId, callableId: this.callable.id, callableCanonicalName: this.callable.canonicalName,
      entryBlockId: this.entry.blockId, normalExitBlockId: this.normalExit.blockId, revertExitBlockId: this.revertExit.blockId,
      blocks: this.blocks, edges: this.edges, unsupportedControlFlow: this.unsupportedControlFlow, modifierOrder: this.modifierOrder,
    });
  }
}

function expandedFlow(callable, ast, context) {
  const unsupported = [];
  const modifierOrder = [];
  let flow = flowFromAst(ast.body, `callable:${ast.id}`);
  if (callable.kind === 'function') {
    for (let index = (ast.modifiers ?? []).length - 1; index >= 0; index -= 1) {
      const invocation = ast.modifiers[index];
      const modifierAstId = invocation.modifierName?.referencedDeclaration;
      const modifierAst = context.astById.get(modifierAstId);
      const modifierIR = context.declarationByAstId.get(modifierAstId);
      if (!modifierAst?.body || modifierAst.nodeType !== 'ModifierDefinition') {
        unsupported.push({ nodeType: 'ModifierInvocation', astNodeId: invocation.id, location: context.resolveLocation(invocation.src), reason: 'modifier target could not be resolved' });
        continue;
      }
      modifierOrder.unshift(modifierIR?.id ?? null);
      const placeholders = countPlaceholders(modifierAst.body);
      if (placeholders > 1) unsupported.push({ nodeType: 'ModifierMultiplePlaceholder', astNodeId: modifierAst.id, location: context.resolveLocation(modifierAst.src), reason: `${placeholders} placeholders are expanded explicitly` });
      flow = flowFromAst(modifierAst.body, `modifier:${modifierAst.id}:${index}`, flow);
    }
  }
  return { flow, unsupported, modifierOrder: modifierOrder.filter(Boolean) };
}

export function buildControlFlowGraphs(program, graphContext = null) {
  const context = graphContext ?? createGraphContext(program);
  const cfgs = [];
  for (const callable of program.declarations.filter((item) => ['function', 'modifier'].includes(item.kind)).sort((a, b) => compareCodePoints(a.canonicalName, b.canonicalName))) {
    const ast = context.callableAstById.get(callable.astNodeId);
    if (!ast?.body) continue;
    const expanded = callable.kind === 'modifier'
      ? { flow: flowFromAst(ast.body, `modifier:${ast.id}`), unsupported: [], modifierOrder: [] }
      : expandedFlow(callable, ast, context);
    cfgs.push(new CFGBuilder(callable, context, expanded.flow, expanded.unsupported, expanded.modifierOrder).build());
  }
  return cfgs.sort((left, right) => compareCodePoints(left.cfgId, right.cfgId));
}
