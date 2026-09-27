export const READ_ONLY_RPC_METHODS = Object.freeze([
  'eth_chainId',
  'eth_blockNumber',
  'eth_getBlockByNumber',
  'eth_getBalance',
  'eth_estimateGas',
  'eth_gasPrice',
]);

const READ_ONLY_RPC_METHOD_SET = new Set(READ_ONLY_RPC_METHODS);

function rpcSafetyError(code, message) {
  return Object.assign(new Error(message), { code });
}

export function sanitizeRpcUrl(value) {
  try {
    const url = new URL(String(value));
    const hadCredentials = Boolean(url.username || url.password);
    const hadQuery = Boolean(url.search);
    const hadFragment = Boolean(url.hash);
    url.username = '';
    url.password = '';
    url.search = hadQuery ? '?REDACTED' : '';
    url.hash = hadFragment ? '#REDACTED' : '';
    return `${url.toString()}${hadCredentials ? ' [credentials redacted]' : ''}`;
  } catch {
    return 'REDACTED / INVALID URL';
  }
}

export function redactSensitive(value, secrets = []) {
  let text = String(value ?? '');
  for (const secret of secrets.filter((item) => typeof item === 'string' && item.length >= 4)) text = text.replaceAll(secret, '[REDACTED]');
  text = text.replace(/(?:0x)?[0-9a-f]{64}/giu, '[REDACTED_KEY_OR_HASH]');
  text = text.replace(/([?&](?:key|token|secret|api[_-]?key|auth)=)[^&#\s]+/giu, '$1REDACTED');
  text = text.replace(/(https?:\/\/)[^/@\s]+:[^/@\s]+@/giu, '$1REDACTED@');
  return text;
}

export function assertReadOnlyRpcMethod(method) {
  if (!READ_ONLY_RPC_METHOD_SET.has(method)) {
    throw rpcSafetyError('READ_ONLY_RPC_METHOD_FORBIDDEN', `RPC method is not permitted by the read-only preflight: ${String(method)}.`);
  }
  return method;
}

export function assertHttpsRpcEndpoint(endpoint) {
  try {
    const parsed = new URL(String(endpoint));
    if (parsed.protocol !== 'https:') throw new Error('protocol');
    return parsed.toString();
  } catch {
    throw rpcSafetyError('READ_ONLY_RPC_ENDPOINT_INVALID', 'The Arc Mainnet preflight requires a valid HTTPS RPC endpoint.');
  }
}

export function createReadOnlyRpcClient({ endpoint, fetchImpl = globalThis.fetch, timeoutMs = 15_000 } = {}) {
  const rpcEndpoint = assertHttpsRpcEndpoint(endpoint);
  if (typeof fetchImpl !== 'function') throw rpcSafetyError('READ_ONLY_RPC_FETCH_UNAVAILABLE', 'A fetch implementation is required.');
  const allowedCalls = [];
  const forbiddenCalls = [];
  let requestId = 0;

  return Object.freeze({
    async request(method, params = []) {
      try {
        assertReadOnlyRpcMethod(method);
      } catch (error) {
        forbiddenCalls.push(String(method));
        throw error;
      }
      if (!Array.isArray(params)) throw rpcSafetyError('READ_ONLY_RPC_PARAMS_INVALID', 'RPC params must be an array.');
      allowedCalls.push(method);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let response;
      try {
        response = await fetchImpl(rpcEndpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: ++requestId, method, params }),
          signal: controller.signal,
        });
      } catch {
        throw rpcSafetyError('READ_ONLY_RPC_UNAVAILABLE', `Read-only RPC method ${method} failed.`);
      } finally {
        clearTimeout(timer);
      }
      if (!response?.ok) throw rpcSafetyError('READ_ONLY_RPC_UNAVAILABLE', `Read-only RPC method ${method} returned an HTTP error.`);
      let body;
      try {
        body = await response.json();
      } catch {
        throw rpcSafetyError('READ_ONLY_RPC_RESPONSE_INVALID', `Read-only RPC method ${method} returned invalid JSON.`);
      }
      if (body?.error || !Object.hasOwn(body ?? {}, 'result')) {
        throw rpcSafetyError('READ_ONLY_RPC_RESPONSE_INVALID', `Read-only RPC method ${method} returned an invalid response.`);
      }
      return body.result;
    },
    usage() {
      return Object.freeze({
        methods: Object.freeze([...allowedCalls]),
        uniqueMethods: Object.freeze([...new Set(allowedCalls)]),
        forbiddenMethods: Object.freeze([...forbiddenCalls]),
        forbiddenCallCount: forbiddenCalls.length,
      });
    },
    sanitizedEndpoint: sanitizeRpcUrl(rpcEndpoint),
  });
}
