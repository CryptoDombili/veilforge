const BUILTIN_CALLS = new Set(['require', 'assert', 'revert', 'keccak256', 'sha256', 'ripemd160', 'ecrecover', 'addmod', 'mulmod', 'selfdestruct']);

export function unwrapCallExpression(expression) {
  let current = expression;
  while (current?.nodeType === 'FunctionCallOptions') current = current.expression;
  return current;
}

export function shouldSkipCall(call, context) {
  if (!call || call.kind === 'typeConversion' || call.kind === 'structConstructorCall') return true;
  const parent = context.astById.get(context.parentById.get(call.id));
  if (['EmitStatement', 'RevertStatement'].includes(parent?.nodeType)) return true;
  const expression = unwrapCallExpression(call.expression);
  return expression?.nodeType === 'Identifier' && BUILTIN_CALLS.has(expression.name);
}

export function resolveCall(call, caller, program, context) {
  const expression = unwrapCallExpression(call.expression);
  const location = context.resolveLocation(call.src);
  const unresolved = (callKind, reason, candidates = []) => ({
    callKind, resolutionStatus: 'unresolved', calleeCallableId: null, candidateTargetIds: candidates, reason, location,
  });
  const resolved = (callKind, target, reason) => ({
    callKind, resolutionStatus: 'resolved', calleeCallableId: target.id, candidateTargetIds: [target.id], reason, location,
  });
  if (!expression) return unresolved('dynamic/unresolved', 'call expression is missing');

  if (expression.nodeType === 'Identifier') {
    const target = context.declarationByAstId.get(expression.referencedDeclaration);
    if (target?.kind === 'function') {
      return resolved(target.contractContext === caller.contractContext ? 'internal' : 'inherited-internal', target, 'solc referencedDeclaration resolved exact overload');
    }
    return unresolved('dynamic/unresolved', `identifier ${expression.name ?? '<anonymous>'} does not reference a known callable`);
  }

  if (expression.nodeType === 'MemberAccess') {
    const memberName = expression.memberName;
    if (['call', 'callcode'].includes(memberName)) return unresolved('low-level-call', `address.${memberName} has no statically sound target`);
    if (memberName === 'delegatecall') return unresolved('delegatecall', 'delegatecall target depends on runtime address and code');
    if (memberName === 'staticcall') return unresolved('staticcall', 'staticcall target depends on runtime address and selector');

    const base = expression.expression;
    const target = context.declarationByAstId.get(expression.referencedDeclaration);
    const targetContract = target?.contractContext ? context.contractByName.get(target.contractContext) : null;
    if (base?.nodeType === 'Identifier' && base.name === 'super') {
      return target?.kind === 'function'
        ? resolved('super', target, 'solc referencedDeclaration selected the next linearized base implementation')
        : unresolved('super', 'super call target is not present in ProgramIR');
    }
    if (targetContract?.contractKind === 'library' || base?.typeDescriptions?.typeString?.startsWith('type(library ')) {
      return target?.kind === 'function'
        ? resolved('library', target, 'library member referencedDeclaration resolved')
        : unresolved('library', 'library member target is not present in ProgramIR');
    }
    if (base?.nodeType === 'Identifier' && base.name === 'this') {
      return target?.kind === 'function'
        ? resolved('external-self', target, 'explicit this call resolved to compiled external ABI member')
        : unresolved('external-self', 'explicit this call has no compiled callable target');
    }
    const baseType = base?.typeDescriptions?.typeString ?? '';
    if (baseType.startsWith('contract ') || targetContract) {
      return target?.kind === 'function'
        ? resolved('known-contract-external', target, 'contract-typed member referencedDeclaration resolved')
        : unresolved('known-contract-external', 'contract member target is absent from ProgramIR');
    }
    if (target?.kind === 'function') {
      return resolved(target.contractContext === caller.contractContext ? 'internal' : 'inherited-internal', target, 'member referencedDeclaration resolved callable');
    }
    return unresolved('dynamic/unresolved', `member ${memberName ?? '<anonymous>'} has no statically sound callable target`);
  }

  return unresolved('dynamic/unresolved', `${expression.nodeType} call target requires runtime resolution`);
}
