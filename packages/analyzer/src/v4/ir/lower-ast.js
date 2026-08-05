import { compareCodePoints } from '../frontend/standard-json.js';
import { resolveSourceLocation } from '../frontend/source-locations.js';
import { IRInputError } from './errors.js';
import { createOperationId, createScopeId, declarationId, deterministicId } from './ids.js';
import { resolveInheritance } from './inheritance.js';
import {
  ContractIR, EnumIR, ErrorIR, EventIR, FunctionIR, IRNode, LocalVariableIR, ModifierIR, ParameterIR,
  ProgramIR, ReturnParameterIR, Scope, SourceUnitIR, StateVariableIR, StructIR,
} from './model.js';
import { ScopeGraph } from './scopes.js';
import { summarizeProgramIR } from './summary.js';
import { symbolFromDeclaration, SymbolTable } from './symbols.js';
import { collectStorageAccesses } from './storage-access.js';

const OPERATION_NODES = new Set([
  'VariableDeclarationStatement', 'Assignment', 'Identifier', 'MemberAccess', 'IndexAccess', 'FunctionCall',
  'Return', 'EmitStatement', 'RevertStatement',
]);
const STRUCTURAL_NODES = new Set([
  'SourceUnit', 'ContractDefinition', 'FunctionDefinition', 'ModifierDefinition', 'EventDefinition', 'ErrorDefinition',
  'StructDefinition', 'EnumDefinition', 'VariableDeclaration', 'ParameterList', 'Block', 'ExpressionStatement',
  'PlaceholderStatement', 'ModifierInvocation', 'InheritanceSpecifier', 'IdentifierPath', 'OverrideSpecifier', 'ElementaryTypeName',
  'UserDefinedTypeName', 'Mapping', 'ArrayTypeName', 'FunctionTypeName', 'EnumValue', 'StructuredDocumentation',
]);

function typeDescription(node) {
  return node?.typeDescriptions?.typeString ?? node?.typeName?.typeDescriptions?.typeString ?? null;
}

function canonicalType(node) {
  return String(typeDescription(node) ?? '')
    .replace(/\s+(?:memory|storage|calldata)(?:\s+ref)?$/u, '')
    .replace(/^(?:contract|struct|enum)\s+/u, '');
}

function signature(node) {
  const parameters = (node.parameters?.parameters ?? []).map(canonicalType).join(',');
  const name = node.nodeType === 'FunctionDefinition'
    ? (node.kind === 'constructor' ? 'constructor' : node.kind === 'fallback' ? 'fallback' : node.kind === 'receive' ? 'receive' : node.name)
    : node.name;
  return `${name}(${parameters})`;
}

function childNodes(node) {
  const result = [];
  for (const value of Object.values(node ?? {})) {
    if (Array.isArray(value)) result.push(...value.filter((item) => item?.nodeType));
    else if (value?.nodeType) result.push(value);
  }
  return result;
}

function sortByLocation(left, right) {
  return compareCodePoints(left.sourcePath ?? '', right.sourcePath ?? '')
    || (left.location?.byteStart ?? -1) - (right.location?.byteStart ?? -1)
    || compareCodePoints(left.id, right.id);
}

export function lowerCompilationToIR(compilation) {
  const snapshot = compilation?.result;
  if (!snapshot || snapshot.status !== 'compiled' || !compilation.output?.sources || !compilation.input?.sources) {
    throw new IRInputError('Core IR requires a successful CompilationSnapshot with Solidity AST output and normalized compiler input.');
  }

  const sourceById = new Map();
  const sourceAstByPath = new Map();
  for (const sourcePath of Object.keys(compilation.output.sources).sort(compareCodePoints)) {
    const sourceOutput = compilation.output.sources[sourcePath];
    const content = compilation.input.sources[sourcePath]?.content;
    if (!sourceOutput.ast || content === undefined) throw new IRInputError('Compilation source is missing AST or normalized content.', { sourcePath });
    sourceById.set(sourceOutput.id, { path: sourcePath, content });
    sourceAstByPath.set(sourcePath, sourceOutput.ast);
  }
  const resolveLocation = (src) => resolveSourceLocation(src, sourceById);
  const programId = deterministicId('program', {
    compilerInputHash: snapshot.compilerInputHash,
    canonicalSourceHash: snapshot.canonicalSourceHash,
    compilerVersion: snapshot.compilerVersion,
  });
  const program = new ProgramIR({
    id: programId,
    compilerVersion: snapshot.compilerVersion,
    compilerLongVersion: snapshot.compilerLongVersion,
    compilerInputHash: snapshot.compilerInputHash,
    canonicalSourceHash: snapshot.canonicalSourceHash,
  });
  const symbolTable = new SymbolTable();
  const scopeGraph = new ScopeGraph(symbolTable);
  const programScopeId = createScopeId({ scopeType: 'program', ownerId: program.id, parentScopeId: null, sourcePath: null, location: null });
  scopeGraph.add(new Scope({ scopeId: programScopeId, scopeType: 'program', ownerId: program.id, parentScopeId: null, canonicalName: 'program' }));
  program.scopeId = programScopeId;

  const contractAstById = new Map();
  const contractContextByAstId = new Map();
  const callableContexts = [];
  const declarationByAstId = new Map();

  function addSymbol(declaration, scopeId) {
    const symbol = symbolTable.add(symbolFromDeclaration(declaration, scopeId));
    scopeGraph.addSymbol(scopeId, symbol);
    declaration.symbolId = symbol.symbolId;
    declaration.scopeId = declaration.scopeId ?? scopeId;
    declarationByAstId.set(declaration.astNodeId, declaration);
    return symbol;
  }

  for (const sourcePath of [...sourceAstByPath.keys()].sort(compareCodePoints)) {
    const ast = sourceAstByPath.get(sourcePath);
    const location = resolveLocation(ast.src);
    const sourceId = declarationId({ kind: 'source-unit', sourcePath, contractContext: null, canonicalName: sourcePath, location });
    const sourceScopeId = createScopeId({ scopeType: 'source-unit', ownerId: sourceId, parentScopeId: programScopeId, sourcePath, location });
    const source = new SourceUnitIR({ id: sourceId, location, sourcePath, astNodeId: ast.id, parentId: program.id, canonicalName: sourcePath, scopeId: sourceScopeId, declarationIds: [] });
    program.sources.push(source);
    scopeGraph.add(new Scope({ scopeId: sourceScopeId, scopeType: 'source-unit', ownerId: sourceId, parentScopeId: programScopeId, location, sourcePath, parentId: programScopeId, canonicalName: sourcePath }));

    for (const node of (ast.nodes ?? []).filter((item) => item.nodeType === 'ContractDefinition')) {
      const contractLocation = resolveLocation(node.src);
      const fullyQualifiedName = `${sourcePath}:${node.name}`;
      const id = declarationId({ kind: 'contract', sourcePath, contractContext: fullyQualifiedName, canonicalName: fullyQualifiedName, location: contractLocation });
      const contractScopeId = createScopeId({ scopeType: 'contract', ownerId: id, parentScopeId: sourceScopeId, sourcePath, location: contractLocation });
      const contract = new ContractIR({
        id, name: node.name, location: contractLocation, sourcePath, astNodeId: node.id, parentId: sourceId,
        contractContext: fullyQualifiedName, canonicalName: fullyQualifiedName, scopeId: contractScopeId,
        contractKind: node.contractKind, abstract: Boolean(node.abstract), directBaseContractIds: [], linearizedBaseContractIds: [],
        inheritedDeclarationIds: {}, overrideDeclarationIds: [], declarationIds: [],
      });
      program.contracts.push(contract);
      program.declarations.push(contract);
      source.declarationIds.push(contract.id);
      contractAstById.set(node.id, node);
      contractContextByAstId.set(node.id, { contract, source, sourceScopeId });
      scopeGraph.add(new Scope({ scopeId: contractScopeId, scopeType: 'contract', ownerId: id, parentScopeId: sourceScopeId, location: contractLocation, sourcePath, parentId: sourceScopeId, contractContext: fullyQualifiedName, canonicalName: fullyQualifiedName }));
      addSymbol(contract, sourceScopeId);
    }
  }

  function declarationFields(node, kind, canonicalName, contract, parentId) {
    const location = resolveLocation(node.src);
    return {
      id: declarationId({ kind, sourcePath: contract.sourcePath, contractContext: contract.canonicalName, canonicalName, location }),
      name: node.name ?? '', location, sourcePath: contract.sourcePath, astNodeId: node.id, parentId,
      contractContext: contract.canonicalName, canonicalName,
      typeDescription: typeDescription(node), visibility: node.visibility ?? null,
      mutability: node.stateMutability ?? node.mutability ?? null, storageLocation: node.storageLocation ?? null,
    };
  }

  function addParameter(node, callable, scopeId, index, returnParameter = false) {
    const kind = returnParameter ? 'return-parameter' : 'parameter';
    const label = node.name || `${returnParameter ? 'return' : 'parameter'}${index}`;
    const canonicalName = `${callable.canonicalName}:${returnParameter ? 'return' : 'parameter'}:${index}:${label}`;
    const FieldsClass = returnParameter ? ReturnParameterIR : ParameterIR;
    const declaration = new FieldsClass({ ...declarationFields(node, kind, canonicalName, callable._contract, callable.id), index });
    program.declarations.push(declaration);
    callable[returnParameter ? 'returnParameterIds' : 'parameterIds'].push(declaration.id);
    addSymbol(declaration, scopeId);
    return declaration;
  }

  function addUnsupported(node, context, parentId) {
    const location = resolveLocation(node.src);
    const sourcePath = context.contract?.sourcePath ?? context.sourcePath ?? location?.sourcePath ?? null;
    const contractContext = context.contract?.canonicalName ?? null;
    program.unsupportedNodes.push(new IRNode({
      id: createOperationId({ nodeType: `unsupported:${node.nodeType}`, sourcePath, contractContext, callableId: context.callable?.id ?? null, location }),
      nodeType: node.nodeType, kind: 'unsupported-node', location, sourcePath,
      astNodeId: node.id, parentId, contractContext,
      canonicalName: `${node.nodeType}@${location?.byteStart ?? 'unknown'}`,
    }));
  }

  function addOperation(node, context, parentId) {
    const location = resolveLocation(node.src);
    const operation = new IRNode({
      id: createOperationId({ nodeType: node.nodeType, sourcePath: context.contract.sourcePath, contractContext: context.contract.canonicalName, callableId: context.callable?.id ?? null, location }),
      nodeType: 'OperationIR', kind: node.nodeType, astNodeType: node.nodeType, location,
      sourcePath: context.contract.sourcePath, astNodeId: node.id, parentId,
      contractContext: context.contract.canonicalName, callableId: context.callable?.id ?? null,
      canonicalName: `${context.callable?.canonicalName ?? context.contract.canonicalName}:${node.nodeType}@${location?.byteStart ?? 'unknown'}`,
    });
    program.operations.push(operation);
    return operation;
  }

  function lowerBody(node, context, currentScopeId, parentId) {
    if (!node) return;
    let scopeId = currentScopeId;
    let loweredParentId = parentId;
    if (node.nodeType === 'Block') {
      const location = resolveLocation(node.src);
      scopeId = createScopeId({ scopeType: 'block', ownerId: context.callable.id, parentScopeId: currentScopeId, sourcePath: context.contract.sourcePath, location });
      scopeGraph.add(new Scope({ scopeId, scopeType: 'block', ownerId: context.callable.id, parentScopeId: currentScopeId, location, sourcePath: context.contract.sourcePath, parentId: currentScopeId, contractContext: context.contract.canonicalName, canonicalName: `${context.callable.canonicalName}:block@${location.byteStart}` }));
    } else if (OPERATION_NODES.has(node.nodeType)) {
      loweredParentId = addOperation(node, context, parentId).id;
    }

    if (node.nodeType === 'VariableDeclarationStatement') {
      for (const declarationNode of node.declarations ?? []) {
        if (!declarationNode) continue;
        const location = resolveLocation(declarationNode.src);
        const label = declarationNode.name || `local@${location.byteStart}`;
        const canonicalName = `${context.callable.canonicalName}:local:${label}@${location.byteStart}`;
        const declaration = new LocalVariableIR({ ...declarationFields(declarationNode, 'local-variable', canonicalName, context.contract, context.callable.id) });
        program.declarations.push(declaration);
        context.callable.localVariableIds.push(declaration.id);
        addSymbol(declaration, scopeId);
      }
    }

    for (const child of childNodes(node)) {
      if (node.nodeType === 'VariableDeclarationStatement' && (node.declarations ?? []).includes(child)) continue;
      lowerBody(child, context, scopeId, loweredParentId);
    }
  }

  for (const contract of [...program.contracts].sort((a, b) => compareCodePoints(a.canonicalName, b.canonicalName))) {
    const ast = contractAstById.get(contract.astNodeId);
    for (const node of ast.nodes ?? []) {
      let declaration = null;
      if (node.nodeType === 'VariableDeclaration' && node.stateVariable) {
        const canonicalName = `${contract.canonicalName}.${node.name}`;
        declaration = new StateVariableIR({
          ...declarationFields(node, 'state-variable', canonicalName, contract, contract.id),
          constant: Boolean(node.constant), immutable: node.mutability === 'immutable', publicGetter: node.visibility === 'public',
        });
      } else if (node.nodeType === 'FunctionDefinition' || node.nodeType === 'ModifierDefinition') {
        const kind = node.nodeType === 'FunctionDefinition' ? 'function' : 'modifier';
        const canonicalSignature = signature(node);
        const canonicalName = `${contract.canonicalName}.${canonicalSignature}`;
        const CallableClass = kind === 'function' ? FunctionIR : ModifierIR;
        declaration = new CallableClass({
          ...declarationFields(node, kind, canonicalName, contract, contract.id), canonicalSignature,
          functionKind: node.kind ?? kind, virtual: Boolean(node.virtual), override: Boolean(node.overrides),
          baseFunctionAstIds: [...(node.baseFunctions ?? [])], overrideDeclarationIds: [],
          parameterIds: [], returnParameterIds: [], localVariableIds: [], modifierInvocations: (node.modifiers ?? []).map((item) => item.modifierName?.name ?? item.modifierName?.namePath ?? null).filter(Boolean),
        });
      } else if (['EventDefinition', 'ErrorDefinition'].includes(node.nodeType)) {
        const kind = node.nodeType === 'EventDefinition' ? 'event' : 'error';
        const canonicalSignature = signature(node);
        const canonicalName = `${contract.canonicalName}.${canonicalSignature}`;
        const CallableClass = kind === 'event' ? EventIR : ErrorIR;
        declaration = new CallableClass({ ...declarationFields(node, kind, canonicalName, contract, contract.id), canonicalSignature, parameterIds: [], returnParameterIds: [], localVariableIds: [] });
      } else if (node.nodeType === 'StructDefinition' || node.nodeType === 'EnumDefinition') {
        const kind = node.nodeType === 'StructDefinition' ? 'struct' : 'enum';
        const canonicalName = `${contract.canonicalName}.${node.name}`;
        const DeclarationClass = kind === 'struct' ? StructIR : EnumIR;
        declaration = new DeclarationClass({ ...declarationFields(node, kind, canonicalName, contract, contract.id), memberIds: [] });
      }
      if (!declaration) continue;
      Object.defineProperty(declaration, '_contract', { value: contract, enumerable: false });
      program.declarations.push(declaration);
      contract.declarationIds.push(declaration.id);

      const ownsScope = ['function', 'modifier', 'event', 'error', 'struct', 'enum'].includes(declaration.kind);
      let declarationScopeId = contract.scopeId;
      if (ownsScope) {
        const scopeType = ['function', 'modifier'].includes(declaration.kind) ? declaration.kind : 'declaration';
        declarationScopeId = createScopeId({ scopeType, ownerId: declaration.id, parentScopeId: contract.scopeId, sourcePath: contract.sourcePath, location: declaration.location });
        declaration.scopeId = declarationScopeId;
        scopeGraph.add(new Scope({ scopeId: declarationScopeId, scopeType, ownerId: declaration.id, parentScopeId: contract.scopeId, location: declaration.location, sourcePath: contract.sourcePath, parentId: contract.scopeId, contractContext: contract.canonicalName, canonicalName: declaration.canonicalName }));
      }
      addSymbol(declaration, contract.scopeId);

      if (['function', 'modifier', 'event', 'error'].includes(declaration.kind)) {
        for (const [index, parameter] of (node.parameters?.parameters ?? []).entries()) addParameter(parameter, declaration, declarationScopeId, index, false);
        for (const [index, parameter] of (node.returnParameters?.parameters ?? []).entries()) addParameter(parameter, declaration, declarationScopeId, index, true);
      }
      if (declaration.kind === 'struct') {
        for (const [index, member] of (node.members ?? []).entries()) {
          const location = resolveLocation(member.src);
          const canonicalName = `${declaration.canonicalName}.${member.name || `field${index}`}`;
          const field = new IRNode({ ...declarationFields(member, 'struct-field', canonicalName, contract, declaration.id), nodeType: 'StructFieldIR', kind: 'struct-field', index });
          program.declarations.push(field);
          declaration.memberIds.push(field.id);
          addSymbol(field, declarationScopeId);
        }
      }
      if (declaration.kind === 'enum') {
        for (const [index, member] of (node.members ?? []).entries()) {
          const location = resolveLocation(member.src);
          const canonicalName = `${declaration.canonicalName}.${member.name}`;
          const value = new IRNode({
            id: declarationId({ kind: 'enum-value', sourcePath: contract.sourcePath, contractContext: contract.canonicalName, canonicalName, location }),
            nodeType: 'EnumValueIR', kind: 'enum-value', name: member.name, location, sourcePath: contract.sourcePath,
            astNodeId: member.id, parentId: declaration.id, contractContext: contract.canonicalName, canonicalName, index,
          });
          program.declarations.push(value);
          declaration.memberIds.push(value.id);
          addSymbol(value, declarationScopeId);
        }
      }
      if (['function', 'modifier'].includes(declaration.kind)) {
        const context = { contract, callable: declaration };
        callableContexts.push({ ...context, ast: node });
        lowerBody(node.body, context, declarationScopeId, declaration.id);
      }
    }
  }

  const sourceIRByPath = new Map(program.sources.map((source) => [source.sourcePath, source]));
  function auditUnsupported(node, context) {
    if (!node?.nodeType) return;
    let next = context;
    if (node.nodeType === 'ContractDefinition') {
      const entry = contractContextByAstId.get(node.id);
      next = { ...context, contract: entry?.contract ?? null, callable: null, parentId: entry?.contract?.id ?? context.parentId };
    } else if (['FunctionDefinition', 'ModifierDefinition'].includes(node.nodeType)) {
      const callable = declarationByAstId.get(node.id) ?? null;
      next = { ...context, callable, parentId: callable?.id ?? context.parentId };
    }
    if (!OPERATION_NODES.has(node.nodeType) && !STRUCTURAL_NODES.has(node.nodeType)) {
      addUnsupported(node, next, next.parentId);
    }
    for (const child of childNodes(node)) auditUnsupported(child, next);
  }
  for (const [sourcePath, ast] of sourceAstByPath) {
    const source = sourceIRByPath.get(sourcePath);
    auditUnsupported(ast, { sourcePath, contract: null, callable: null, parentId: source.id });
  }

  program.inheritance = resolveInheritance({ contracts: program.contracts, contractAstById, declarations: program.declarations, scopeGraph });
  program.storageAccesses = collectStorageAccesses({ contracts: program.contracts, declarations: program.declarations, callableContexts, symbolTable, resolveLocation });
  program.declarations.sort(sortByLocation);
  program.operations.sort(sortByLocation);
  program.unsupportedNodes.sort(sortByLocation);
  program.symbols = symbolTable.finalize();
  program.scopes = scopeGraph.finalize();
  for (const source of program.sources) source.declarationIds.sort(compareCodePoints);
  for (const contract of program.contracts) contract.declarationIds.sort(compareCodePoints);
  program.summary = summarizeProgramIR(program);
  return program.attachScopeGraph(scopeGraph).attachCompilationContext(compilation);
}
