const domains = new Set(['arc-payments', 'arc-treasury', 'arc-private-credit']);
function string(value, pattern = null) { return typeof value === 'string' && value.length > 0 && (!pattern || pattern.test(value)); }
function exactKeys(item, allowed) { return item && typeof item === 'object' && !Array.isArray(item) && Object.keys(item).every((key) => allowed.has(key)); }

export function validatePolicy(policy) {
  const errors = [];
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) return { valid: false, errors: [{ path: '', reason: 'policy-must-be-object' }], policy: null };
  const rootKeys = new Set(['schemaVersion', 'policyId', 'version', 'domain', 'approvedWrappers', 'publicFields', 'acceptedRisks', 'sourceLabels']);
  if (!exactKeys(policy, rootKeys)) errors.push({ path: '', reason: 'additional-property' });
  if (policy.schemaVersion !== '4.0.0') errors.push({ path: '/schemaVersion', reason: 'const' });
  if (!string(policy.policyId, /^[a-z0-9][a-z0-9._-]{2,127}$/u)) errors.push({ path: '/policyId', reason: 'pattern' });
  if (!string(policy.version, /^\d+\.\d+\.\d+$/u)) errors.push({ path: '/version', reason: 'pattern' });
  if (!domains.has(policy.domain)) errors.push({ path: '/domain', reason: 'enum' });
  for (const key of ['approvedWrappers', 'publicFields', 'acceptedRisks']) if (!Array.isArray(policy[key])) errors.push({ path: `/${key}`, reason: 'required-array' });
  (policy.approvedWrappers ?? []).forEach((item, index) => {
    if (!exactKeys(item, new Set(['id', 'callable', 'kind', 'scope'])) || !['id', 'callable', 'scope'].every((key) => string(item[key])) || !['commitment', 'encryption'].includes(item.kind)) errors.push({ path: `/approvedWrappers/${index}`, reason: 'invalid-wrapper' });
  });
  (policy.publicFields ?? []).forEach((item, index) => {
    if (!exactKeys(item, new Set(['id', 'field', 'justification', 'scope'])) || !['id', 'field', 'justification', 'scope'].every((key) => string(item[key]))) errors.push({ path: `/publicFields/${index}`, reason: 'invalid-public-field' });
  });
  (policy.acceptedRisks ?? []).forEach((item, index) => {
    if (!exactKeys(item, new Set(['id', 'owner', 'justification', 'scope', 'expiresAt', 'target', 'approvalIdentity'])) || !['id', 'owner', 'justification', 'scope', 'expiresAt'].every((key) => string(item[key]))) errors.push({ path: `/acceptedRisks/${index}`, reason: 'invalid-accepted-risk' });
  });
  (policy.sourceLabels ?? []).forEach((item, index) => {
    if (!exactKeys(item, new Set(['id', 'target', 'dataClass', 'scope'])) || !['id', 'target', 'dataClass', 'scope'].every((key) => string(item[key]))) errors.push({ path: `/sourceLabels/${index}`, reason: 'invalid-source-label' });
  });
  return { valid: errors.length === 0, errors, policy };
}
