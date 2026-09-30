export const WEB_V4_ERROR_CODES = Object.freeze([
  'WEB_V4_INPUT_INVALID', 'WEB_V4_INPUT_LIMIT', 'WEB_V4_DIRECTORY_DROP_UNSUPPORTED', 'WEB_V4_COMPILE_FAILED', 'WEB_V4_IMPORT_RESOLUTION_FAILED', 'WEB_V4_PROTOCOL_INVALID',
  'WEB_V4_PROTOCOL_MISMATCH', 'WEB_V4_WORKER_BUSY', 'WEB_V4_RUNTIME_UNAVAILABLE',
  'WEB_V4_ABORTED', 'WEB_V4_TIMEOUT', 'WEB_V4_WORKER_CRASH',
  'WEB_V4_WORKER_CONSTRUCTION_FAILED', 'WEB_V4_WORKER_INIT_FAILED', 'WEB_V4_COMPILER_LOAD_FAILED',
  'WEB_V4_ASSET_NOT_FOUND', 'WEB_V4_CSP_BLOCKED', 'WEB_V4_MIME_MISMATCH',
  'WEB_V4_MESSAGE_ERROR', 'WEB_V4_WORKER_RUNTIME_EXCEPTION', 'WEB_V4_REPORT_INVALID',
  'WEB_V4_REPORT_UNVERIFIED', 'WEB_V4_LOCATION_UNSAFE', 'WEB_V4_PERSISTENCE_INVALID',
  'WEB_V4_PERSISTENCE_LIMIT', 'WEB_V4_STORAGE_QUOTA', 'WEB_V4_EXPORT_INVALID',
  'WEB_V4_PROOF_UNAVAILABLE', 'WEB_V4_PROOF_ENVELOPE_INVALID', 'WEB_V4_PROVIDER_UNAVAILABLE',
  'WEB_V4_ACCOUNT_UNAVAILABLE', 'WEB_V4_WRONG_NETWORK', 'WEB_V4_REGISTRY_MISMATCH',
  'WEB_V4_PROOF_DISCLOSURE_REQUIRED', 'WEB_V4_PROOF_PREFLIGHT_FAILED', 'WEB_V4_PROOF_DUPLICATE',
  'WEB_V4_USER_REJECTED', 'WEB_V4_TX_INVALID', 'WEB_V4_TX_NOT_FOUND', 'WEB_V4_RECEIPT_PENDING', 'WEB_V4_RECEIPT_REVERTED',
  'WEB_V4_RECEIPT_INVALID', 'WEB_V4_EVENT_MISMATCH', 'WEB_V4_PROOF_PERSISTENCE_FAILED',
  'WEB_V4_USER_GESTURE_REQUIRED', 'WEB_V4_REGISTRY_CODE_MISSING',
  'WEB_V4_REGISTRY_ABI_MISMATCH', 'WEB_V4_SEND_DISABLED',
  'WEB_V4_SEND_IN_FLIGHT', 'WEB_V4_RECONCILIATION_REQUIRED', 'WEB_V4_STALE_PUBLICATION',
]);

export class WebV4Error extends Error {
  constructor(code, message, safeDetails = {}) {
    super(message);
    this.name = 'WebV4Error';
    this.code = WEB_V4_ERROR_CODES.includes(code) ? code : 'WEB_V4_WORKER_CRASH';
    this.safeDetails = Object.freeze({ ...safeDetails });
  }
}

export function webV4Error(code, message, safeDetails) {
  return new WebV4Error(code, message, safeDetails);
}

const safeToken = (value, fallback = null) => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,96}$/u.test(value) ? value : fallback;

function safeDirective(value) {
  if (typeof value !== 'string') return null;
  const directive = value.trim().split(/\s+/u)[0]?.toLowerCase();
  return /^[a-z][a-z0-9-]{0,63}$/u.test(directive ?? '') ? directive : null;
}

function safeBlockedUri(value) {
  if (typeof value !== 'string' || !value || value.length > 2_048) return null;
  if (/^[a-z][a-z0-9+.-]{0,31}-eval$/u.test(value)) return value;
  if (/^[a-z][a-z0-9+.-]{0,31}:$/u.test(value)) return value;
  if (['blob', 'data'].includes(value)) return `${value}:`;
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:', 'blob:', 'data:'].includes(parsed.protocol)) return null;
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.origin : parsed.protocol;
  } catch { return null; }
}

export function safeBrowserAssetPath(value) {
  if (typeof value !== 'string' || !value || value.length > 2_048) return null;
  let pathname;
  try { pathname = new URL(value, 'https://veilforge.invalid/').pathname; }
  catch { return null; }
  const segments = pathname.replaceAll('\\', '/').split('/').filter(Boolean);
  if (!segments.length || segments.some((segment) => segment === '.' || segment === '..' || !/^[A-Za-z0-9._~%-]+$/u.test(segment))) return null;
  const v4Index = segments.lastIndexOf('v4');
  if (v4Index < 0) return null;
  const safe = segments.slice(v4Index).join('/');
  return safe.length <= 256 ? safe : null;
}

function safeFailureValue(value, property) {
  try { return value?.[property]; } catch { return undefined; }
}

function inferredAssetPath(value, explicitPath) {
  const direct = safeBrowserAssetPath(explicitPath)
    ?? safeBrowserAssetPath(safeFailureValue(value, 'filename'))
    ?? safeBrowserAssetPath(safeFailureValue(safeFailureValue(value, 'target'), 'src'));
  if (direct) return direct;
  const message = String(safeFailureValue(value, 'message') ?? '');
  const match = message.match(/(?:https?:\/\/[^\s"'()]+)?\/?v4\/[A-Za-z0-9._~%/-]+/iu);
  return safeBrowserAssetPath(match?.[0]);
}

export function safeSecurityPolicyViolation(value) {
  const effectiveDirective = safeDirective(safeFailureValue(value, 'effectiveDirective'));
  const violatedDirective = safeDirective(safeFailureValue(value, 'violatedDirective'));
  const blockedURI = safeBlockedUri(safeFailureValue(value, 'blockedURI'));
  const sourceFile = safeBrowserAssetPath(safeFailureValue(value, 'sourceFile'));
  const lineNumber = Number(safeFailureValue(value, 'lineNumber'));
  if (!effectiveDirective && !violatedDirective && !blockedURI && !sourceFile && !Number.isInteger(lineNumber)) return null;
  return Object.freeze({
    ...(effectiveDirective ? { effectiveDirective } : {}),
    ...(violatedDirective ? { violatedDirective } : {}),
    ...(blockedURI ? { blockedURI } : {}),
    ...(sourceFile ? { sourceFile } : {}),
    ...(Number.isInteger(lineNumber) && lineNumber >= 0 ? { lineNumber } : {}),
  });
}

export function classifyWorkerFailure(value, { stage = 'runtime', assetPath = null } = {}) {
  const safeStage = safeToken(stage, 'runtime');
  const existingCode = safeFailureValue(value, 'code');
  const existingDetails = safeFailureValue(value, 'safeDetails');
  if (WEB_V4_ERROR_CODES.includes(existingCode) && existingDetails?.reasonCode) {
    const existingPath = safeBrowserAssetPath(existingDetails.assetPath) ?? safeBrowserAssetPath(assetPath);
    const existingPolicyViolation = safeSecurityPolicyViolation(existingDetails);
    return webV4Error(existingCode, 'The V4 worker reported a safe runtime diagnostic.', {
      reasonCode: safeToken(existingDetails.reasonCode, existingCode.replace('WEB_V4_', '')),
      stage: safeToken(existingDetails.stage, safeStage),
      ...(existingPath ? { assetPath: existingPath } : {}),
      ...(existingPolicyViolation ?? {}),
    });
  }
  const policyViolation = safeSecurityPolicyViolation(value);
  const reason = safeFailureValue(value, 'reason');
  const message = String(safeFailureValue(value, 'message') ?? safeFailureValue(reason, 'message') ?? '').toLowerCase();
  const path = inferredAssetPath(value, assetPath);
  let code;
  if (safeStage === 'construction') code = 'WEB_V4_WORKER_CONSTRUCTION_FAILED';
  else if (safeStage === 'message') code = 'WEB_V4_MESSAGE_ERROR';
  else if (policyViolation || /content security policy|\bcsp\b|violat(?:e|ed|ion)[^.]*(?:worker-src|script-src)/u.test(message)) code = 'WEB_V4_CSP_BLOCKED';
  else if (/mime|content-type|module script[^.]*type/u.test(message)) code = 'WEB_V4_MIME_MISMATCH';
  else if (safeStage === 'compiler') code = 'WEB_V4_COMPILER_LOAD_FAILED';
  else if (/\b404\b|not found|failed to fetch|importing a module script failed/u.test(message)) code = 'WEB_V4_ASSET_NOT_FOUND';
  else if (safeStage === 'initialization') code = 'WEB_V4_WORKER_INIT_FAILED';
  else code = 'WEB_V4_WORKER_RUNTIME_EXCEPTION';
  return webV4Error(code, 'The V4 worker reported a safe runtime diagnostic.', {
    reasonCode: code.replace('WEB_V4_', ''),
    stage: safeStage,
    ...(path ? { assetPath: path } : {}),
    ...(policyViolation ?? {}),
  });
}

export function safeWorkerError(error, fallback = 'WEB_V4_WORKER_CRASH', context = {}) {
  const code = WEB_V4_ERROR_CODES.includes(error?.code) ? error.code : fallback;
  const messages = {
    WEB_V4_ABORTED: 'The V4 scan was aborted.',
    WEB_V4_TIMEOUT: 'The V4 worker exceeded its safe runtime limit.',
    WEB_V4_COMPILE_FAILED: 'Solidity compilation failed under the pinned compiler.',
    WEB_V4_RUNTIME_UNAVAILABLE: 'A browser-compatible V4 scanner runtime is not available in this build.',
    WEB_V4_WORKER_BUSY: 'The V4 worker already has an active scan.',
    WEB_V4_WORKER_CONSTRUCTION_FAILED: 'The browser could not construct the isolated V4 worker.',
    WEB_V4_WORKER_INIT_FAILED: 'The isolated V4 worker could not initialize.',
    WEB_V4_COMPILER_LOAD_FAILED: 'The pinned browser compiler could not load.',
    WEB_V4_ASSET_NOT_FOUND: 'A required V4 worker asset could not be loaded.',
    WEB_V4_CSP_BLOCKED: 'Browser Content Security Policy blocked the V4 worker or one of its modules.',
    WEB_V4_MIME_MISMATCH: 'A V4 worker module was served with an incompatible MIME type.',
    WEB_V4_MESSAGE_ERROR: 'The browser could not deserialize a V4 worker message.',
    WEB_V4_WORKER_RUNTIME_EXCEPTION: 'The isolated V4 worker raised a runtime exception.',
  };
  const message = messages[code] ?? 'The V4 worker could not complete the request.';
  const details = error?.safeDetails && typeof error.safeDetails === 'object' ? error.safeDetails : {};
  const compileDiagnostic = code === 'WEB_V4_COMPILE_FAILED' ? Object.freeze({
    failureType: 'compile',
    stage: 'compilation',
    requestId: safeToken(context.requestId ?? details.requestId, 'worker'),
    causeCode: safeToken(details.causeCode ?? error?.causeCode ?? error?.code, code),
    errorType: safeToken(details.errorType ?? error?.name, 'Error'),
    ...(Number.isInteger(details.diagnosticCount) && details.diagnosticCount >= 0 ? { diagnosticCount: details.diagnosticCount } : {}),
    ...(Array.isArray(details.compilerDiagnostics) ? { compilerDiagnostics: details.compilerDiagnostics.slice(0, 20).map((item) => Object.freeze({ type: safeToken(item?.type, 'CompilerError'), severity: safeToken(item?.severity, 'error'), errorCode: safeToken(String(item?.errorCode ?? ''), 'unknown') })) } : {}),
  }) : null;
  const safeAssetPath = safeBrowserAssetPath(details.assetPath);
  const policyViolation = safeSecurityPolicyViolation(details);
  const workerDiagnostic = code.startsWith('WEB_V4_WORKER_') || ['WEB_V4_COMPILER_LOAD_FAILED', 'WEB_V4_ASSET_NOT_FOUND', 'WEB_V4_CSP_BLOCKED', 'WEB_V4_MIME_MISMATCH', 'WEB_V4_MESSAGE_ERROR'].includes(code)
    ? Object.freeze({
      reasonCode: safeToken(details.reasonCode, code.replace('WEB_V4_', '')),
      stage: safeToken(details.stage, 'runtime'),
      ...(safeAssetPath ? { assetPath: safeAssetPath } : {}),
      ...(policyViolation ?? {}),
    }) : null;
  const diagnostic = compileDiagnostic ?? workerDiagnostic;
  return Object.freeze({ code, message, retryable: !['WEB_V4_PROTOCOL_MISMATCH', 'WEB_V4_COMPILE_FAILED'].includes(code), ...(diagnostic ? { diagnostic } : {}) });
}
