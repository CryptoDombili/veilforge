import { compare } from '../classification/common.js';

export const FINDING_DISPOSITIONS = Object.freeze(['detected', 'policy-approved', 'accepted-risk', 'incomplete', 'not-applicable']);

function matchingRecord(records, ids) { return records.find((record) => ids.includes(record.acceptedRiskId ?? record.id)) ?? null; }
function explicitSuppression(records, fingerprint, resultIds) { return records.find((record) => record.fingerprint === fingerprint || resultIds.includes(record.detectorResultId)) ?? null; }

export function resolveSuppression({ disposition, acceptedRiskIds, policyRuleIds, fingerprint, detectorResultIds }, options = {}) {
  const now = Date.parse(options.evaluationTime ?? '1970-01-01T00:00:00Z');
  if (disposition === 'policy-approved') return { kind: 'policy-approved', status: 'active', active: true, suppressionId: policyRuleIds[0] ?? null, owner: null, expiry: null, scope: null, reason: 'valid-policy-disposition' };
  if (disposition === 'accepted-risk') {
    const record = matchingRecord(options.acceptedRisks ?? [], acceptedRiskIds);
    const expiry = Date.parse(record?.expiry ?? record?.expiresAt ?? '');
    const valid = record ? record.valid !== false && Number.isFinite(expiry) && expiry > now : true;
    return { kind: 'accepted-risk', status: valid ? 'active' : Number.isFinite(expiry) && expiry <= now ? 'expired' : 'invalid', active: valid, suppressionId: acceptedRiskIds[0] ?? null, owner: record?.owner ?? null, expiry: record?.expiry ?? record?.expiresAt ?? null, scope: record?.scope ?? null, reason: record?.validationReason ?? (valid ? 'valid-accepted-risk' : 'invalid-accepted-risk') };
  }
  const record = explicitSuppression(options.suppressions ?? [], fingerprint, detectorResultIds);
  if (!record) return { kind: 'none', status: 'none', active: false, suppressionId: null, owner: null, expiry: null, scope: null, reason: null };
  const expiry = Date.parse(record.expiresAt ?? ''); const complete = ['id', 'owner', 'scope', 'expiresAt'].every((key) => typeof record[key] === 'string' && record[key].length > 0);
  const active = complete && Number.isFinite(expiry) && expiry > now;
  return { kind: 'explicit', status: active ? 'active' : Number.isFinite(expiry) && expiry <= now ? 'expired' : 'invalid', active, suppressionId: record.id ?? null, owner: record.owner ?? null, expiry: record.expiresAt ?? null, scope: record.scope ?? null, reason: active ? 'valid-explicit-suppression' : 'invalid-or-expired-suppression' };
}

export function uniqueIds(values) { return [...new Set(values.filter(Boolean))].sort(compare); }
