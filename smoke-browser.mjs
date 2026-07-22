export const SCANNER_VERSION = '1.8.0';
export const SCHEMA_VERSION = '1.8';

export const DISCLAIMER =
  "Pre-APS readiness analysis based on Arc's published privacy design. VeilForge is an independent community tool, not an official Circle product or a formal security audit.";

export const SENSITIVE_TERMS = Object.freeze([
  'salary', 'payroll', 'employee', 'customer', 'invoice', 'balance', 'credit',
  'debt', 'bid', 'position', 'kyc', 'tax', 'identity', 'secret', 'private',
  'amount', 'recipient', 'beneficiary', 'account', 'limit', 'risk', 'score',
  'memo', 'medical', 'whitelist', 'allowlist', 'passport', 'document',
  'settlement', 'payment', 'bank', 'iban', 'routing', 'compliance', 'screening',
]);

export const ADMIN_TERMS = Object.freeze([
  'admin', 'owner', 'operator', 'guardian', 'controller', 'manager', 'approver',
]);

export const SEVERITY_PENALTY = Object.freeze({
  critical: 25,
  high: 15,
  medium: 8,
  low: 3,
});

export const PRIORITY_BY_SEVERITY = Object.freeze({
  critical: 'P0',
  high: 'P1',
  medium: 'P2',
  low: 'P3',
});

export const STATUS_RANK = Object.freeze({
  Ready: 0,
  'Review Required': 1,
  'High Risk': 2,
  'Deployment Blocked': 3,
});

export const POLICY_RANK = Object.freeze({
  Open: 0,
  Restricted: 1,
  Locked: 2,
});
