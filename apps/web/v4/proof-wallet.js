import { checksumAddress, normalizeChainId } from '../../../packages/proof/v4/network.js';
import { deepFreeze } from './canonical.js';
import { webV4Error } from './errors.js';

const LISTENERS = new WeakMap();

function walletError(code, message) {
  return webV4Error(code, message);
}

export function classifyProviderError(error) {
  const code = Number(error?.code);
  if (code === 4001) return deepFreeze({ code: 'WEB_V4_USER_REJECTED', state: 'user-rejected', retryable: true });
  if (code === -32002) return deepFreeze({ code: 'WEB_V4_PROOF_PREFLIGHT_FAILED', state: 'request-pending', retryable: true });
  const text = String(error?.message ?? '').toLowerCase();
  if (text.includes('timeout') || text.includes('timed out')) return deepFreeze({ code: 'WEB_V4_TIMEOUT', state: 'timeout', retryable: true });
  return deepFreeze({ code: 'WEB_V4_PROVIDER_UNAVAILABLE', state: 'provider-unavailable', retryable: true });
}

export function normalizeAccounts(accounts) {
  if (!Array.isArray(accounts)) throw walletError('WEB_V4_ACCOUNT_UNAVAILABLE', 'The wallet account response is invalid.');
  const normalized = [];
  for (const value of accounts) {
    let account;
    try { account = checksumAddress(value, 'account'); }
    catch { throw walletError('WEB_V4_ACCOUNT_UNAVAILABLE', 'The wallet returned an invalid account.'); }
    if (!normalized.some((item) => item.toLowerCase() === account.toLowerCase())) normalized.push(account);
  }
  return Object.freeze(normalized);
}

export async function readChainId(provider) {
  if (!provider?.request) throw walletError('WEB_V4_PROVIDER_UNAVAILABLE', 'No EIP-1193 provider is available.');
  try { return normalizeChainId(await provider.request({ method: 'eth_chainId' })); }
  catch (error) {
    const classified = classifyProviderError(error);
    throw walletError(classified.code, 'The wallet chain could not be read safely.');
  }
}

export function buildWalletState({ providerAvailable = false, accounts = [], chainId = null, disconnected = false, error = null } = {}) {
  const normalizedAccounts = providerAvailable ? normalizeAccounts(accounts) : Object.freeze([]);
  return deepFreeze({
    providerAvailable: providerAvailable === true,
    connected: providerAvailable === true && !disconnected && normalizedAccounts.length > 0,
    account: normalizedAccounts[0] ?? null,
    accounts: normalizedAccounts,
    chainId: chainId === null ? null : normalizeChainId(chainId),
    disconnected: disconnected === true,
    errorCode: error?.code ?? null,
  });
}

export async function inspectProvider(provider) {
  if (!provider?.request) return buildWalletState({ providerAvailable: false });
  try {
    const [accounts, chainId] = await Promise.all([
      provider.request({ method: 'eth_accounts' }),
      readChainId(provider),
    ]);
    return buildWalletState({ providerAvailable: true, accounts, chainId });
  } catch (error) {
    const classified = classifyProviderError(error);
    return buildWalletState({ providerAvailable: true, accounts: [], error: classified });
  }
}

export function attachProviderListeners(provider, callbacks = {}) {
  if (!provider?.on || LISTENERS.has(provider)) return false;
  let active = true;
  const handlers = {
    accountsChanged: (accounts) => { if (active) callbacks.onAccountsChanged?.(normalizeAccounts(accounts)); },
    chainChanged: (chainId) => { if (active) callbacks.onChainChanged?.(normalizeChainId(chainId)); },
    disconnect: () => { if (active) callbacks.onDisconnect?.(); },
  };
  for (const [event, handler] of Object.entries(handlers)) provider.on(event, handler);
  LISTENERS.set(provider, { handlers, deactivate: () => { active = false; } });
  return true;
}

export function disposeProviderListeners(provider) {
  const bound = provider && LISTENERS.get(provider);
  if (!bound) return 0;
  bound.deactivate();
  for (const [event, handler] of Object.entries(bound.handlers)) provider.removeListener?.(event, handler);
  LISTENERS.delete(provider);
  return Object.keys(bound.handlers).length;
}
