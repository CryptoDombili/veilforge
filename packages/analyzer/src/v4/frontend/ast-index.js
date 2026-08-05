import { compareCodePoints } from './standard-json.js';
import { resolveSourceLocation } from './source-locations.js';

export const INDEXED_NODE_TYPES = new Set([
  'SourceUnit', 'ContractDefinition', 'FunctionDefinition', 'ModifierDefinition', 'EventDefinition', 'ErrorDefinition',
  'StructDefinition', 'EnumDefinition', 'VariableDeclaration', 'ImportDirective', 'InheritanceSpecifier',
]);

function canonicalType(parameter) {
  const raw = parameter?.typeDescriptions?.typeString ?? parameter?.typeName?.name ?? '';
  return raw
    .replace(/\s+(?:memory|storage|calldata)(?:\s+ref)?$/u, '')
    .replace(/^contract\s+/u, '')
    .replace(/^struct\s+/u, '')
    .replace(/^enum\s+/u, '');
}

function functionSignature(node) {
  if (node.nodeType !== 'FunctionDefinition') return null;
  const name = node.kind === 'constructor' ? 'constructor' : node.name;
  return `${name}(${(node.parameters?.parameters ?? []).map(canonicalType).join(',')})`;
}

export class AstIndex {
  constructor(records) {
    this.records = records;
    this.byId = new Map(records.map((record) => [record.nodeId, record]));
  }

  getById(nodeId) { return this.byId.get(nodeId) ?? null; }
  getByType(nodeType) { return this.records.filter((record) => record.nodeType === nodeType); }
  getBySourcePath(sourcePath) { return this.records.filter((record) => record.sourcePath === sourcePath); }
  getByContract(fullyQualifiedContract) { return this.records.filter((record) => record.fullyQualifiedContract === fullyQualifiedContract); }
  getByFunctionSignature(signature) { return this.records.filter((record) => record.functionSignature === signature); }
  getParent(nodeId) {
    const record = this.getById(nodeId);
    return record?.parentId === null || record?.parentId === undefined ? null : this.getById(record.parentId);
  }
  getChildren(parentId) { return this.records.filter((record) => record.parentId === parentId); }
  getBySourceRange(sourcePath, byteStart, byteEnd) {
    return this.records.filter((record) => record.sourcePath === sourcePath && record.location
      && record.location.byteStart >= byteStart && record.location.byteEnd <= byteEnd);
  }

  summary() {
    const byType = {};
    for (const record of this.records) byType[record.nodeType] = (byType[record.nodeType] ?? 0) + 1;
    return { totalNodes: this.records.length, byType: Object.fromEntries(Object.entries(byType).sort(([a], [b]) => compareCodePoints(a, b))) };
  }
}

export function createAstIndex(output, sources) {
  const sourcesByPath = new Map(sources.map((source) => [source.path, source]));
  const sourceById = new Map();
  for (const [sourcePath, sourceOutput] of Object.entries(output?.sources ?? {})) {
    sourceById.set(sourceOutput.id, { path: sourcePath, content: sourcesByPath.get(sourcePath)?.content ?? '' });
  }
  const records = [];
  function visit(node, context) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return;
    const contract = node.nodeType === 'ContractDefinition' ? `${context.sourcePath}:${node.name}` : context.contract;
    if (INDEXED_NODE_TYPES.has(node.nodeType)) {
      records.push({
        nodeId: node.id,
        nodeType: node.nodeType,
        name: node.name ?? null,
        sourcePath: context.sourcePath,
        fullyQualifiedContract: contract,
        functionSignature: functionSignature(node),
        parentId: context.parentId,
        location: resolveSourceLocation(node.src, sourceById),
      });
    }
    const childContext = {
      sourcePath: context.sourcePath,
      contract,
      parentId: INDEXED_NODE_TYPES.has(node.nodeType) && Number.isInteger(node.id) ? node.id : context.parentId,
    };
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        for (const child of value) if (child?.nodeType) visit(child, childContext);
      } else if (value?.nodeType) {
        visit(value, childContext);
      }
    }
  }
  for (const sourcePath of Object.keys(output?.sources ?? {}).sort(compareCodePoints)) {
    visit(output.sources[sourcePath].ast, { sourcePath, contract: null, parentId: null });
  }
  records.sort((left, right) => left.nodeId - right.nodeId);
  return new AstIndex(records);
}
