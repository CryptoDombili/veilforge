import { compareCodePoints } from '../frontend/standard-json.js';
import { IRInvariantError } from './errors.js';

const INHERITABLE_KINDS = ['state-variable', 'function', 'modifier', 'event', 'error', 'struct', 'enum'];

function detectCycles(contractByAstId, directBaseAstIds) {
  const visiting = new Set();
  const visited = new Set();
  function visit(astId, path = []) {
    if (visiting.has(astId)) throw new IRInvariantError('Inheritance cycle detected.', { astPath: [...path, astId] });
    if (visited.has(astId)) return;
    visiting.add(astId);
    for (const baseAstId of directBaseAstIds.get(astId) ?? []) {
      if (!contractByAstId.has(baseAstId)) throw new IRInvariantError('Inheritance references an unknown contract AST node.', { astId, baseAstId });
      visit(baseAstId, [...path, astId]);
    }
    visiting.delete(astId);
    visited.add(astId);
  }
  for (const astId of contractByAstId.keys()) visit(astId);
}

export function resolveInheritance({ contracts, contractAstById, declarations, scopeGraph }) {
  const contractByAstId = new Map(contracts.map((contract) => [contract.astNodeId, contract]));
  const declarationByAstId = new Map(declarations.filter((item) => Number.isInteger(item.astNodeId)).map((item) => [item.astNodeId, item]));
  const declarationsByContract = new Map(contracts.map((contract) => [contract.id, declarations.filter((item) => item.contractContext === contract.canonicalName)]));
  const directBaseAstIds = new Map();

  for (const contract of contracts) {
    const ast = contractAstById.get(contract.astNodeId);
    if (!ast || !Array.isArray(ast.linearizedBaseContracts) || ast.linearizedBaseContracts[0] !== contract.astNodeId) {
      throw new IRInvariantError('Contract AST has an invalid linearizedBaseContracts sequence.', { contract: contract.canonicalName });
    }
    const direct = (ast.baseContracts ?? []).map((base) => base.baseName?.referencedDeclaration);
    if (direct.some((astId) => !Number.isInteger(astId))) throw new IRInvariantError('Contract AST has an unresolved direct base.', { contract: contract.canonicalName });
    directBaseAstIds.set(contract.astNodeId, direct);
  }
  detectCycles(contractByAstId, directBaseAstIds);

  const result = [];
  for (const contract of [...contracts].sort((a, b) => compareCodePoints(a.canonicalName, b.canonicalName))) {
    const ast = contractAstById.get(contract.astNodeId);
    const linearizedContracts = ast.linearizedBaseContracts.map((astId) => contractByAstId.get(astId));
    if (linearizedContracts.some((item) => !item)) {
      throw new IRInvariantError('Linearized inheritance references an unknown contract.', { contract: contract.canonicalName, linearizedBaseContracts: ast.linearizedBaseContracts });
    }
    if (new Set(linearizedContracts.map((item) => item.id)).size !== linearizedContracts.length) {
      throw new IRInvariantError('Linearized inheritance contains duplicate contracts.', { contract: contract.canonicalName });
    }
    const directBases = (directBaseAstIds.get(contract.astNodeId) ?? []).map((astId) => contractByAstId.get(astId));
    const inherited = Object.fromEntries(INHERITABLE_KINDS.map((kind) => [kind, []]));
    for (const base of linearizedContracts.slice(1)) {
      const baseDeclarations = [...(declarationsByContract.get(base.id) ?? [])].sort((a, b) => compareCodePoints(a.id, b.id));
      for (const declaration of baseDeclarations) {
        if (inherited[declaration.kind]) inherited[declaration.kind].push(declaration.id);
      }
    }

    const overrides = [];
    for (const declaration of declarationsByContract.get(contract.id) ?? []) {
      const baseDeclarationIds = (declaration.baseFunctionAstIds ?? []).map((astId) => declarationByAstId.get(astId)?.id).filter(Boolean).sort(compareCodePoints);
      declaration.overrideDeclarationIds = baseDeclarationIds;
      if (baseDeclarationIds.length) overrides.push({ declarationId: declaration.id, baseDeclarationIds });
    }
    overrides.sort((a, b) => compareCodePoints(a.declarationId, b.declarationId));

    contract.directBaseContractIds = directBases.map((item) => item.id);
    contract.linearizedBaseContractIds = linearizedContracts.map((item) => item.id);
    contract.inheritedDeclarationIds = inherited;
    contract.overrideDeclarationIds = overrides;
    scopeGraph.setInheritedScopes(contract.scopeId, linearizedContracts.slice(1).map((item) => item.scopeId));
    result.push({
      contractId: contract.id,
      contract: contract.canonicalName,
      directBaseContractIds: contract.directBaseContractIds,
      linearizedBaseContractIds: contract.linearizedBaseContractIds,
      inheritedDeclarationIds: inherited,
      overrides,
    });
  }
  return result;
}
