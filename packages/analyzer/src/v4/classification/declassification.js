import { classificationId, compare, locationAnchor } from './common.js';
import { createEvidence, sortEvidence } from './evidence.js';

function callableMatches(actual, expected) { return actual === expected || actual?.endsWith(`.${expected}`) || actual?.endsWith(`:${expected}`); }
function scopeMatches(actual, expected) { return actual === expected || actual?.endsWith(`.${expected}`) || actual?.endsWith(`:${expected}`); }

export function decideDeclassification(program, analysis, traces, sources, sinks, policyState, acceptedRisks) {
  const callableById = new Map(program.declarations.filter((item) => item.kind === 'function').map((item) => [item.id, item]));
  const valueNodeById = new Map(analysis.callableAnalyses.flatMap((item) => item.valueNodes).map((item) => [item.valueNodeId, item]));
  const astById = new Map(); const parentByNode = new WeakMap();
  function visit(node, parent = null) { if (!node?.nodeType) return; if (!astById.has(node.id)) astById.set(node.id, node); if (parent) parentByNode.set(node, parent); for (const value of Object.values(node)) {
    if (Array.isArray(value)) for (const item of value) visit(item, node); else if (value?.nodeType) visit(value, node);
  } }
  for (const item of Object.values(program._compilation?.output?.sources ?? {})) visit(item.ast);
  function transformForTrace(trace) {
    for (const valueNodeId of trace.orderedValueNodeIds) {
      const valueNode = valueNodeById.get(valueNodeId); let node = astById.get(valueNode?.expressionAstId);
      while (node) {
        if (node.nodeType === 'FunctionCall') {
          let expression = node.expression; while (expression?.nodeType === 'FunctionCallOptions') expression = expression.expression;
          const name = expression?.memberName ?? expression?.name ?? '';
          if (/^(?:keccak256|sha256|ripemd160)$/u.test(name) || /(?:hash|encrypt|private|commitment)/iu.test(name)) return { name, astNodeId: node.id };
        }
        node = parentByNode.get(node);
      }
    }
    return null;
  }
  const sourceById = new Map(sources.map((item) => [item.sourceCandidateId, item])); const sinkById = new Map(sinks.map((item) => [item.sinkCandidateId, item]));
  const result = [];
  for (const trace of traces) {
    const source = sourceById.get(trace.sourceCandidateId); const sink = sinkById.get(trace.sinkCandidateId);
    const callableIds = new Set([source?.callableId, sink?.callableId, ...trace.callableTransitions.flatMap((item) => [item.fromCallableId, item.toCallableId])].filter(Boolean));
    const callableNames = [...callableIds].map((id) => callableById.get(id)?.canonicalName).filter(Boolean);
    let decision = trace.complete ? 'not-applicable' : 'incomplete'; let rule = null; let owner = null; let expiry = null; let scope = null;
    const observedTransform = transformForTrace(trace);
    let reason = trace.complete ? 'no-approved-declassification' : 'trace-incomplete'; let transformation = null; let transformationExpressionAstId = null; const evidence = [];
    if (policyState.valid) {
      const wrapper = (policyState.policy.approvedWrappers ?? []).find((item) => callableNames.some((name) => callableMatches(name, item.callable)));
      const publicField = (policyState.policy.publicFields ?? []).find((item) => [source?.dataClass, source?.symbolId].includes(item.field) || source?.evidence.some((entry) => entry.detail.includes(item.field)));
      const risk = acceptedRisks.find((item) => item.valid && callableNames.some((name) => scopeMatches(name, item.scope)));
      if (wrapper) { decision = 'approved'; rule = wrapper.id; scope = wrapper.scope; transformation = wrapper.callable; reason = 'policy-approved-wrapper'; evidence.push(createEvidence({ kind: 'approved-wrapper', origin: wrapper.id, detail: wrapper.callable, location: source?.location, strength: 'authoritative' })); }
      else if (publicField) { decision = 'approved'; rule = publicField.id; scope = publicField.scope; reason = 'policy-public-field'; evidence.push(createEvidence({ kind: 'public-field', origin: publicField.id, detail: publicField.field, location: source?.location, strength: 'authoritative' })); }
      else if (risk) { decision = 'approved'; rule = risk.id; owner = risk.owner; expiry = risk.expiry; scope = risk.scope; reason = 'valid-accepted-risk-disposition'; evidence.push(createEvidence({ kind: 'accepted-risk', origin: risk.id, detail: risk.scope, location: sink?.location, strength: 'authoritative' })); }
      else if (observedTransform || callableNames.some((name) => /(?:hash|encrypt|private|commitment)/iu.test(name))) {
        decision = 'rejected'; transformation = observedTransform?.name ?? callableNames.find((name) => /(?:hash|encrypt|private|commitment)/iu.test(name));
        transformationExpressionAstId = observedTransform?.astNodeId ?? null;
        reason = ['keccak256', 'sha256', 'ripemd160'].includes(observedTransform?.name) ? 'plain-hash-not-declassification' : 'unapproved-name-based-transform';
      }
    } else { decision = 'incomplete'; reason = 'policy-invalid'; }
    const fields = { inputCandidateIds: [trace.sourceCandidateId, trace.sinkCandidateId], candidateTraceId: trace.candidateTraceId,
      transformationCallable: transformation, transformationExpressionAstId, decision, policyRuleId: rule,
      evidence: sortEvidence(evidence), reason, owner, expiry, scope, location: locationAnchor(source?.location ?? sink?.location) };
    result.push({ decisionId: classificationId('declassification-decision', fields), ...fields });
  }
  return result.sort((a, b) => compare(a.decisionId, b.decisionId));
}
