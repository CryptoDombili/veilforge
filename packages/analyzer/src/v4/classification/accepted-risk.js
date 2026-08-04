import { classificationId, compare } from './common.js';

function nonEmpty(value) { return typeof value === 'string' && value.trim().length > 0; }
export function validateAcceptedRisks(policy, evaluationTime = new Date()) {
  const now = evaluationTime instanceof Date ? evaluationTime : new Date(evaluationTime);
  return (policy?.acceptedRisks ?? []).map((record) => {
    const missing = ['id', 'owner', 'justification', 'scope', 'expiresAt'].filter((key) => !nonEmpty(record?.[key]));
    const expiry = Date.parse(record?.expiresAt ?? '');
    const validExpiry = Number.isFinite(expiry) && expiry > now.getTime();
    const valid = missing.length === 0 && validExpiry;
    const reason = missing.length ? `missing-${missing.join('-')}` : !Number.isFinite(expiry) ? 'invalid-expiry' : !validExpiry ? 'expired' : 'valid';
    return { acceptedRiskId: classificationId('accepted-risk', { policyId: policy?.policyId, id: record?.id }), id: record?.id ?? null,
      owner: record?.owner ?? null, reason: record?.justification ?? null, scope: record?.scope ?? null, expiry: record?.expiresAt ?? null,
      policyBinding: policy?.policyId ?? null, target: record?.target ?? record?.scope ?? null, approvalIdentity: record?.approvalIdentity ?? record?.id ?? null,
      valid, validationReason: reason };
  }).sort((a, b) => compare(a.acceptedRiskId, b.acceptedRiskId));
}
