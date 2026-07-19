import type { AccessPolicy, FindingCategory } from './types.js';

export interface RulePlaybookEntry {
  category: FindingCategory;
  impact: string;
  suggestedPolicy: AccessPolicy;
  saferPattern?: string;
}

const fallback: RulePlaybookEntry = {
  category: 'analysis-integrity',
  impact: 'The analysis is incomplete, so the report cannot make a reliable privacy-readiness claim for this source.',
  suggestedPolicy: 'Locked',
};

export const RULE_PLAYBOOK: Record<string, RulePlaybookEntry> = {
  VF000: fallback,
  VF001: {
    category: 'state-exposure',
    impact: 'Anyone can call the compiler-generated getter and correlate the returned value with an account, business process or identity.',
    suggestedPolicy: 'Restricted',
    saferPattern: `mapping(address => uint256) private salaryByEmployee;\n\nfunction viewSalary(address employee)\n    external\n    view\n    onlyRole(AUDITOR_ROLE)\n    returns (uint256)\n{\n    return salaryByEmployee[employee];\n}`,
  },
  VF002: {
    category: 'event-disclosure',
    impact: 'Log data is durable and indexable. Once emitted, sensitive values can be copied and correlated outside the application forever.',
    suggestedPolicy: 'Locked',
    saferPattern: `event PaymentCommitted(\n    bytes32 indexed commitment,\n    uint64 indexed batchId\n);`,
  },
  VF003: {
    category: 'error-disclosure',
    impact: 'State-specific error text can reveal account status, limits or private workflow details to callers and monitoring infrastructure.',
    suggestedPolicy: 'Restricted',
    saferPattern: `error Unauthorized();\nerror MissingRecord();\n\nif (!authorized) revert Unauthorized();`,
  },
  VF004: {
    category: 'access-control',
    impact: 'An arbitrary caller may retrieve sensitive financial or identity-linked information without a visible authorization boundary.',
    suggestedPolicy: 'Restricted',
    saferPattern: `function viewMySalary()\n    external\n    view\n    returns (uint256)\n{\n    return salaryByEmployee[msg.sender];\n}`,
  },
  VF005: {
    category: 'access-control',
    impact: 'An untrusted caller may change sensitive state, corrupt records or trigger financial actions outside the intended workflow.',
    suggestedPolicy: 'Restricted',
    saferPattern: `function setSalary(address employee, uint256 amount)\n    external\n    onlyRole(PAYROLL_ADMIN_ROLE)\n{\n    salaryByEmployee[employee] = amount;\n}`,
  },
  VF006: {
    category: 'trust-boundary',
    impact: 'Low-level execution hides interface guarantees and can move control or confidential values across an unintended trust boundary.',
    suggestedPolicy: 'Restricted',
    saferPattern: `interface ISettlementTarget {\n    function settle(bytes32 commitment) external;\n}\n\nISettlementTarget(target).settle(commitment);`,
  },
  VF007: {
    category: 'trust-boundary',
    impact: 'Sensitive values may leave the current contract and become observable or usable by a destination with different privacy guarantees.',
    suggestedPolicy: 'Restricted',
    saferPattern: `bytes32 commitment = keccak256(\n    abi.encode(employee, salary, nonce)\n);\nsettlement.submitCommitment(commitment);`,
  },
  VF008: {
    category: 'state-exposure',
    impact: 'Automatic mapping getters let observers query known keys and gradually reconstruct sensitive indexed records.',
    suggestedPolicy: 'Restricted',
    saferPattern: `mapping(address => uint256) private salaryByEmployee;\n\nfunction viewMySalary() external view returns (uint256) {\n    return salaryByEmployee[msg.sender];\n}`,
  },
  VF009: {
    category: 'privileged-operation',
    impact: 'A public administrative selector can alter roles, configuration or critical state without proving the caller is authorized.',
    suggestedPolicy: 'Restricted',
    saferPattern: `function setOperator(address next)\n    external\n    onlyRole(DEFAULT_ADMIN_ROLE)\n{\n    operator = next;\n}`,
  },
  VF010: {
    category: 'authorization',
    impact: 'tx.origin can authorize a malicious intermediary contract and breaks clear caller boundaries required by financial applications.',
    suggestedPolicy: 'Locked',
    saferPattern: `if (!hasRole(OPERATOR_ROLE, msg.sender)) {\n    revert Unauthorized();\n}`,
  },
  VF011: {
    category: 'event-disclosure',
    impact: 'Runtime values placed in an event become permanent public metadata even when the surrounding contract flow is intended to be private.',
    suggestedPolicy: 'Locked',
    saferPattern: `bytes32 paymentCommitment = keccak256(\n    abi.encode(employee, amount, nonce)\n);\nemit PaymentCommitted(paymentCommitment);`,
  },
  VF012: {
    category: 'calldata-disclosure',
    impact: 'Plaintext string and bytes arguments remain visible in transaction calldata and can expose documents, identities, memos or KYC data.',
    suggestedPolicy: 'Restricted',
    saferPattern: `function submitInvoice(bytes32 documentHash) external {\n    invoiceHash[msg.sender] = documentHash;\n}`,
  },
};

export function playbookFor(ruleId: string): RulePlaybookEntry {
  return RULE_PLAYBOOK[ruleId] ?? fallback;
}
