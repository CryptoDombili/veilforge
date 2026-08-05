import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { attachProviderListeners, buildWalletState, classifyProviderError, disposeProviderListeners, inspectProvider, normalizeAccounts, readChainId } from '../../../apps/web/v4/proof-wallet.js';
import { ACCOUNT, mockProvider } from './helpers.mjs';

test('provider inspection reads only authorized accounts and chain ID', async () => {
  const provider = mockProvider(); const state = await inspectProvider(provider);
  assert.equal(state.connected, true); assert.equal(state.chainId, 5_042_002); assert.deepEqual(provider.calls.sort(), ['eth_accounts', 'eth_chainId']);
});

test('wallet unavailable is explicit', async () => assert.equal((await inspectProvider(null)).providerAvailable, false));
test('account unavailable does not look connected', async () => assert.equal((await inspectProvider(mockProvider({ accounts: [] }))).connected, false));
test('malformed account is rejected', () => assert.throws(() => normalizeAccounts(['0x1'])));
test('duplicate accounts are normalized once', () => assert.equal(normalizeAccounts([ACCOUNT, ACCOUNT.toUpperCase().replace('0X', '0x')]).length, 1));
test('malformed chain ID is rejected', async () => assert.rejects(() => readChainId(mockProvider({ chainId: 'bad' }))));
test('provider rejection and timeout map to source-free states', () => {
  assert.equal(classifyProviderError({ code: 4001, message: 'source secret' }).state, 'user-rejected');
  assert.equal(classifyProviderError({ message: 'timed out with C:\\secret.sol' }).state, 'timeout');
});

test('provider listeners attach once and report account/chain/disconnect', () => {
  const provider = mockProvider(); const events = [];
  assert.equal(attachProviderListeners(provider, { onAccountsChanged: () => events.push('account'), onChainChanged: () => events.push('chain'), onDisconnect: () => events.push('disconnect') }), true);
  assert.equal(attachProviderListeners(provider, {}), false);
  provider.emit('accountsChanged', [ACCOUNT]); provider.emit('chainChanged', '0x4cef52'); provider.emit('disconnect');
  assert.deepEqual(events, ['account', 'chain', 'disconnect']);
});

test('listener cleanup prevents stale account and chain events', () => {
  const provider = mockProvider(); let count = 0;
  attachProviderListeners(provider, { onAccountsChanged: () => { count += 1; }, onChainChanged: () => { count += 1; } });
  assert.equal(disposeProviderListeners(provider), 3); provider.emit('accountsChanged', [ACCOUNT]); provider.emit('chainChanged', '0x1'); assert.equal(count, 0);
});

test('wallet state is serializable and excludes provider objects', () => {
  const state = buildWalletState({ providerAvailable: true, accounts: [ACCOUNT], chainId: 5_042_002 });
  assert.equal(Object.hasOwn(state, 'provider'), false); assert.equal(Object.hasOwn(state, 'signer'), false);
  assert.doesNotMatch(JSON.stringify(state), /"(?:provider|signer)":/u);
});

test('web proof modules contain no wallet request, switch, or send method', () => {
  const sources = ['proof-wallet.js', 'proof-adapter.js', 'proof-lifecycle.js'].map((name) => fs.readFileSync(new URL(`../../../apps/web/v4/${name}`, import.meta.url), 'utf8')).join('\n');
  assert.doesNotMatch(sources, /eth_requestAccounts|wallet_switchEthereumChain|eth_sendTransaction/u);
});
