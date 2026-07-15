import type { Severity } from './types.js';

export const SCANNER_VERSION = '0.1.0';

export const SENSITIVE_TERMS = [
  'salary',
  'payroll',
  'employee',
  'customer',
  'invoice',
  'balance',
  'credit',
  'debt',
  'bid',
  'position',
  'kyc',
  'tax',
  'identity',
  'secret',
  'private',
  'amount',
  'recipient',
  'beneficiary',
  'account',
  'limit',
  'risk',
  'score',
  'memo',
  'medical',
  'whitelist',
  'allowlist',
] as const;

export const ADMIN_TERMS = [
  'admin',
  'owner',
  'operator',
  'guardian',
  'controller',
  'manager',
  'approver',
] as const;

export const ACCESS_CONTROL_MARKERS = [
  'onlyowner',
  'onlyrole',
  'onlyadmin',
  'auth',
  'requiresauth',
  'whenallowed',
  'msg.sender == owner',
  'hasrole(',
  '_checkrole(',
] as const;

export const SEVERITY_PENALTY: Record<Severity, number> = {
  critical: 25,
  high: 15,
  medium: 8,
  low: 3,
};

export const DISCLAIMER =
  "Pre-APS readiness analysis based on Arc's published design. VeilForge is an independent community tool, not an official Circle product or a formal security audit.";
