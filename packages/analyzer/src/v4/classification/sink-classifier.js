import { classificationId, compare, locationAnchor } from './common.js';
import { createEvidence, sortEvidence } from './evidence.js';
import { SinkCandidate } from './sink-model.js';

function astContext(program) {
  const byId = new Map(); const parent = new Map();
  function visit(node, owner = null) { if (!node?.nodeType) return; byId.set(node.id, node); if (owner) parent.set(node.id, owner); for (const value of Object.values(node)) {
    if (Array.isArray(value)) for (const item of value) visit(item, node); else if (value?.nodeType) visit(value, node);
  } }
  for (const item of Object.values(program._compilation?.output?.sources ?? {})) visit(item.ast);
  return { byId, parent };
}
function argumentIndex(node, parent) { return (parent?.arguments ?? []).findIndex((item) => item?.id === node?.id); }
function callName(call) {
  let expression = call?.expression; while (expression?.nodeType === 'FunctionCallOptions') expression = expression.expression;
  return expression?.memberName ?? expression?.name ?? '';
}
function callable(program, id) { return program.declarations.find((item) => item.id === id); }
function contract(program, canonicalName) { return program.contracts.find((item) => item.canonicalName === canonicalName); }
function containingCall(node, ast) { let current = node; while (current && current.nodeType !== 'FunctionCall') current = ast.parent.get(current.id); return current; }
function eventKey(node, ast, index) {
  const call = containingCall(node, ast); const expression = call?.expression;
  return expression ? `${expression.name ?? expression.memberName ?? 'event'}:${expression.typeDescriptions?.typeString ?? ''}:${index}` : null;
}

export function classifySinks(program, analysis) {
  const ast = astContext(program); const result = [];
  function add(sinkClass, node, fields = {}) {
    const owner = callable(program, node.callableId); const ownerContract = contract(program, owner?.contractContext);
    const payload = { sinkClass, valueNodeId: node.valueNodeId, callableId: node.callableId ?? null, contractId: ownerContract?.id ?? fields.contractId ?? null,
      location: locationAnchor(node.location ?? fields.location), argumentIndex: fields.argumentIndex ?? null, externalTarget: fields.externalTarget ?? null,
      semanticSinkKey: fields.semanticSinkKey ?? null,
      evidence: sortEvidence([createEvidence({ kind: fields.evidenceKind ?? 'dataflow-boundary', origin: fields.origin ?? 'compiler-ast-ir', detail: fields.detail ?? sinkClass, location: node.location ?? fields.location, strength: 'primary' })]),
      confidence: fields.confidence ?? 'high', complete: fields.complete !== false, reason: fields.reason ?? 'compiler-backed-sink' };
    result.push(new SinkCandidate({ ...payload, sinkCandidateId: classificationId('sink-candidate', { sinkClass, valueNodeId: node.valueNodeId, argumentIndex: payload.argumentIndex, semanticSinkKey: payload.semanticSinkKey, externalTarget: payload.externalTarget }) }));
  }
  const stateDeclarations = program.declarations.filter((item) => item.kind === 'state-variable' && item.visibility === 'public');
  for (const declaration of stateDeclarations) {
    const nodes = analysis.callableAnalyses.flatMap((item) => item.valueNodes).filter((item) => item.symbolId === declaration.symbolId);
    const occurrences = nodes.length ? nodes : [{ valueNodeId: classificationId('declaration-value', { declarationId: declaration.id }), callableId: null, location: declaration.location }];
    const ownerContract = contract(program, declaration.contractContext);
    for (const node of occurrences) {
      add('public-storage', node, { contractId: ownerContract?.id, location: declaration.location, evidenceKind: 'state-visibility', detail: declaration.canonicalName });
      add('public-getter', node, { contractId: ownerContract?.id, location: declaration.location, evidenceKind: 'compiler-generated-getter', detail: declaration.canonicalName });
    }
  }
  const functionById = new Map(program.declarations.filter((item) => item.kind === 'function').map((item) => [item.id, item]));
  for (const callableAnalysis of analysis.callableAnalyses) {
    const owner = functionById.get(callableAnalysis.callableId);
    for (const node of callableAnalysis.valueNodes) {
      const astNode = ast.byId.get(node.expressionAstId); const parent = ast.parent.get(node.expressionAstId);
      if (node.valueKind === 'parameter' && ['public', 'external'].includes(owner?.visibility)) add('calldata', node, { evidenceKind: 'abi-parameter', detail: owner.canonicalName });
      if (node.boundary === 'emit-argument') {
        const index = Number(String(node.provenance).split(':').at(-1));
        add('event', node, { argumentIndex: index, semanticSinkKey: eventKey(astNode, ast, index) });
      }
      if (node.boundary === 'return') {
        const index = Number(String(node.provenance).split(':').at(-1)) || 0;
        add('return', node, { argumentIndex: index, semanticSinkKey: `return:${owner?.canonicalName ?? node.callableId}:${index}` });
      }
      if (node.boundary === 'revert-argument') add('revert-custom-error', node, { argumentIndex: Number(String(node.provenance).split(':').at(-1)) });
      if (node.boundary === 'call-argument') {
        let call = parent; while (call && call.nodeType !== 'FunctionCall') call = ast.parent.get(call.id);
        const boundary = analysis.callBoundaries.find((item) => item.expressionAstId === call?.id && item.callerCallableId === node.callableId);
        const name = callName(call);
        if (name === 'revert') add('revert-custom-error', node, { argumentIndex: argumentIndex(astNode, call), evidenceKind: 'builtin-revert-argument', detail: 'revert(string)' });
        if (boundary && boundary.propagationStatus !== 'propagated') add('external-call', node, { argumentIndex: argumentIndex(astNode, call), externalTarget: { callKind: boundary.callKind, resolutionStatus: boundary.resolutionStatus },
          complete: !['unresolved-call', 'dynamic-function-pointer'].includes(boundary.reason),
          reason: boundary.reason });
        if (['encode', 'encodePacked', 'encodeWithSelector', 'encodeWithSignature'].includes(name)) add('metadata-uri', node, { argumentIndex: argumentIndex(astNode, call), evidenceKind: 'abi-encoding', detail: `abi.${name}`, reason: 'abi-encoding-boundary' });
        if (/(?:uri|metadata|memo)/iu.test(name)) {
          const known = new Set(['uri', 'tokenURI', 'buildURI', 'buildMetadata', 'metadata', 'memo', 'executionMetadata', 'buildExecutionMetadata', 'loanMetadata', 'agreementMetadata', 'borrowerMemo']).has(name);
          add('metadata-uri', node, { argumentIndex: argumentIndex(astNode, call), evidenceKind: 'metadata-builder', detail: name,
            confidence: known ? 'medium' : 'incomplete', complete: known, reason: known ? 'known-metadata-builder-context' : 'unknown-metadata-builder' });
        }
      }
    }
  }
  return [...new Map(result.map((item) => [item.sinkCandidateId, item])).values()].sort((a, b) => compare(a.sinkCandidateId, b.sinkCandidateId));
}
