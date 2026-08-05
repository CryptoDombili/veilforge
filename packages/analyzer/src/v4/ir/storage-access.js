import { compareCodePoints } from '../frontend/standard-json.js';
import { createStorageAccessId } from './ids.js';
import { StorageAccess } from './model.js';

function children(node) {
  const result = [];
  for (const value of Object.values(node ?? {})) {
    if (Array.isArray(value)) result.push(...value.filter((item) => item?.nodeType));
    else if (value?.nodeType) result.push(value);
  }
  return result;
}

function classifyIndex(baseExpression) {
  const type = baseExpression?.typeDescriptions?.typeString ?? '';
  return type.startsWith('mapping(') ? 'mapping-index' : 'array-index';
}

function resolvePath(node, symbolTable) {
  if (!node) return null;
  if (node.nodeType === 'Identifier') {
    const symbol = symbolTable.getByAstId(node.referencedDeclaration);
    if (!symbol || symbol.kind !== 'state-variable') return null;
    return { symbol, pathSegments: [{ kind: 'state-variable', name: symbol.name }] };
  }
  if (node.nodeType === 'IndexAccess') {
    const base = resolvePath(node.baseExpression, symbolTable);
    if (!base) return null;
    return {
      ...base,
      pathSegments: [...base.pathSegments, {
        kind: classifyIndex(node.baseExpression),
        typeDescription: node.indexExpression?.typeDescriptions?.typeString ?? null,
      }],
    };
  }
  if (node.nodeType === 'MemberAccess') {
    const base = resolvePath(node.expression, symbolTable);
    if (!base) return null;
    return { ...base, pathSegments: [...base.pathSegments, { kind: 'struct-member', name: node.memberName }] };
  }
  return null;
}

function accessForm(pathSegments) {
  if (pathSegments.some((segment) => segment.kind === 'struct-member')) return 'struct-member';
  if (pathSegments.some((segment) => segment.kind === 'mapping-index')) return 'mapping';
  if (pathSegments.some((segment) => segment.kind === 'array-index')) return 'array';
  return 'state-variable';
}

export function collectStorageAccesses({ contracts, declarations, callableContexts, symbolTable, resolveLocation }) {
  const contractByName = new Map(contracts.map((contract) => [contract.canonicalName, contract]));
  const accesses = [];

  function addAccess({ contract, callable = null, expression, symbol, pathSegments, accessKind, location = null }) {
    const resolvedLocation = location ?? resolveLocation(expression?.src);
    const accessId = createStorageAccessId({
      contractId: contract.id,
      callableId: callable?.id ?? null,
      symbolId: symbol.symbolId,
      accessKind,
      pathSegments,
      location: resolvedLocation,
    });
    accesses.push(new StorageAccess({
      accessId,
      contractId: contract.id,
      callableId: callable?.id ?? null,
      symbolId: symbol.symbolId,
      accessKind,
      accessForm: accessForm(pathSegments),
      pathSegments,
      location: resolvedLocation,
      sourcePath: resolvedLocation?.sourcePath ?? symbol.sourcePath,
      astNodeId: expression?.id ?? symbol.astNodeId,
      expressionAstId: expression?.id ?? null,
      parentId: callable?.id ?? contract.id,
      contractContext: contract.canonicalName,
      canonicalName: `${contract.canonicalName}:${symbol.name}:${accessKind}`,
      direct: symbol.contractContext === contract.canonicalName,
      derived: symbol.contractContext !== contract.canonicalName,
      publicGetter: accessKind === 'declaration' && symbol.visibility === 'public',
    }));
  }

  for (const declaration of declarations.filter((item) => item.kind === 'state-variable')) {
    const contract = contractByName.get(declaration.contractContext);
    const symbol = symbolTable.getByAstId(declaration.astNodeId);
    addAccess({
      contract,
      symbol,
      accessKind: 'declaration',
      pathSegments: [{ kind: 'state-variable', name: symbol.name }],
      location: declaration.location,
    });
  }

  for (const { contract, callable, ast } of callableContexts) {
    function addExpressionAccess(expression, accessKind) {
      const resolved = resolvePath(expression, symbolTable);
      if (!resolved) return false;
      addAccess({ contract, callable, expression, accessKind, ...resolved });
      return true;
    }

    function readIndexExpressions(expression) {
      if (!expression) return;
      if (expression.nodeType === 'IndexAccess') {
        collectReads(expression.indexExpression);
        readIndexExpressions(expression.baseExpression);
      } else if (expression.nodeType === 'MemberAccess') {
        readIndexExpressions(expression.expression);
      }
    }

    function collectReads(expression) {
      if (!expression) return;
      if (addExpressionAccess(expression, 'read')) {
        readIndexExpressions(expression);
        return;
      }
      if (expression.nodeType === 'FunctionCall') {
        const member = expression.expression;
        if (member?.nodeType === 'MemberAccess' && ['push', 'pop'].includes(member.memberName)) {
          const base = resolvePath(member.expression, symbolTable);
          if (base) addAccess({ contract, callable, expression: member.expression, accessKind: 'write', ...base });
        } else collectReads(expression.expression);
        for (const argument of expression.arguments ?? []) collectReads(argument);
        return;
      }
      for (const child of children(expression)) collectReads(child);
    }

    function walk(node) {
      if (!node) return;
      if (node.nodeType === 'Assignment') {
        addExpressionAccess(node.leftHandSide, node.operator === '=' ? 'write' : 'read-write');
        readIndexExpressions(node.leftHandSide);
        collectReads(node.rightHandSide);
        return;
      }
      if (node.nodeType === 'UnaryOperation' && ['++', '--', 'delete'].includes(node.operator)) {
        addExpressionAccess(node.subExpression, node.operator === 'delete' ? 'write' : 'read-write');
        readIndexExpressions(node.subExpression);
        return;
      }
      if (node.nodeType === 'FunctionCall') {
        collectReads(node);
        return;
      }
      if (['Identifier', 'MemberAccess', 'IndexAccess'].includes(node.nodeType)) {
        collectReads(node);
        return;
      }
      for (const child of children(node)) walk(child);
    }
    walk(ast.body);
  }

  accesses.sort((left, right) => compareCodePoints(left.sourcePath ?? '', right.sourcePath ?? '')
    || (left.location?.byteStart ?? -1) - (right.location?.byteStart ?? -1)
    || compareCodePoints(left.accessId, right.accessId));
  return accesses;
}
