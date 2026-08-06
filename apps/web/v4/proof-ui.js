import { resolveProofNetwork } from '../../../packages/proof/v4/network.js';
import { deepFreeze } from './canonical.js';

const esc = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const short = (value) => value ? `${value.slice(0, 8)}…${value.slice(-6)}` : '—';

export function deriveProofWalletUiState(wallet = {}, expectedChainId = null, { connecting = false, error = null } = {}) {
  if (connecting) return deepFreeze({ state: 'connecting', label: 'Connecting…', description: 'Waiting for the explicit wallet connection request.', disabled: true });
  if (error) return deepFreeze({ state: 'error', label: 'Retry wallet connection', description: String(error), disabled: wallet.providerAvailable !== true });
  if (wallet.providerAvailable !== true) return deepFreeze({ state: 'disconnected', label: 'Wallet unavailable', description: 'No injected EVM wallet provider is available.', disabled: true });
  if (wallet.connected !== true || !wallet.account) return deepFreeze({ state: 'disconnected', label: 'Connect Wallet', description: 'Connect a previously authorized wallet with an explicit click.', disabled: false });
  if (wallet.chainId !== expectedChainId) return deepFreeze({ state: 'wrong-network', label: 'Wrong network · switch in wallet', description: `Connected account ${wallet.account}; switch manually to Arc Testnet chain ${expectedChainId}.`, disabled: true });
  return deepFreeze({ state: 'connected', label: `Connected · ${short(wallet.account)}`, description: `Connected to Arc Testnet chain ${expectedChainId} as ${wallet.account}.`, disabled: true });
}

export function proofSectionTemplate() {
  return `<section id="v4-proof" class="v4-secondary v4-proof panel" aria-labelledby="v4-proof-title">
    <header><div><small>VERIFY &amp; PUBLISH</small><b id="v4-proof-title">Anchor verified evidence on Arc</b></div><span id="v4-proof-state" class="v4-proof-state">UNAVAILABLE</span></header>
    <div id="v4-proof-status" role="status" aria-live="polite"><p>Run and verify a V4 scan to prepare a proof envelope.</p></div>
    <div id="v4-proof-summary" hidden></div>
    <details id="v4-proof-workflow" class="v4-proof-workflow" hidden><summary>Open proof workflow</summary><div class="v4-proof-workflow-body">
      <div id="v4-proof-wallet" hidden></div>
      <div id="v4-proof-disclosure" class="v4-proof-disclosure" hidden><label for="v4-proof-ack"><input id="v4-proof-ack" type="checkbox"> I understand this proof anchors analysis evidence; it does not certify confidentiality.</label></div>
      <div id="v4-proof-checks" hidden></div>
      <div class="v4-button-row"><button id="v4-proof-inspect-wallet" type="button" disabled>Connect Wallet</button><button id="v4-proof-preflight" type="button" disabled>Review &amp; Publish Proof</button></div>
      <details id="v4-proof-transaction" hidden><summary>Review transaction request</summary><div id="v4-proof-transaction-summary"></div></details>
      <div id="v4-proof-review-acknowledgement" class="v4-proof-disclosure" hidden><label for="v4-proof-review-ack"><input id="v4-proof-review-ack" type="checkbox"> I reviewed the network, account, registry, report hash, value and transaction summary.</label></div>
      <button id="v4-proof-send" type="button" disabled>Publish Proof</button>
      <details class="v4-proof-reconcile"><summary>Verify an existing transaction</summary><label for="v4-proof-reconcile-hash">Transaction hash</label><input id="v4-proof-reconcile-hash" type="text" inputmode="text" autocomplete="off" spellcheck="false" placeholder="0x…" maxlength="66" aria-describedby="v4-proof-reconcile-status"><button id="v4-proof-reconcile" type="button" disabled>Verify existing transaction</button><div id="v4-proof-reconcile-status" class="v4-proof-reconcile-status" role="status" aria-live="polite" hidden></div></details>
      <p class="v4-proof-boundary"><b>Publishing always requires a separate explicit click.</b> Wallet connection and transaction publication are isolated user actions. No signature, network switch, or transaction request is made automatically.</p>
    </div></details>
  </section>`;
}

export function createProofSummary(envelope) {
  const network = resolveProofNetwork(envelope.networkKey);
  return deepFreeze({
    reportHash: envelope.reportHash,
    schemaVersion: envelope.reportSchemaVersion,
    hashPayloadVersion: envelope.reportHashPayloadVersion,
    integrity: envelope.reportIntegrityStatus,
    complete: envelope.complete,
    incompleteReasonCodes: [...envelope.incompleteReasonCodes],
    findingCount: envelope.findingSummary.total,
    policyStatus: envelope.policyStatus,
    compilerVersion: envelope.compilerVersion,
    network: network.chainName,
    chainId: network.chainId,
    registryAddress: network.registryAddress,
    registryContractVersion: network.registryContractVersion,
    envelopeVersion: envelope.envelopeVersion,
    canonicalPayloadDigest: envelope.canonicalPayloadDigest,
  });
}

export function renderProofSummary(envelope) {
  const summary = createProofSummary(envelope);
  const reasons = summary.incompleteReasonCodes.length ? `<div class="v4-warning"><b>Incomplete analysis</b><ul>${summary.incompleteReasonCodes.map((reason) => `<li>${esc(reason)}</li>`).join('')}</ul><p>Proof anchors analysis evidence; it does not certify confidentiality.</p></div>` : '';
  return `<div class="v4-proof-ready"><span aria-hidden="true">✓</span><div><b>Verified report ready</b><small>${esc(summary.network)} · ${esc(summary.findingCount)} findings · ${summary.complete ? 'complete analysis' : 'incomplete analysis'}</small></div></div><dl class="v4-proof-grid v4-proof-primary"><div><dt>Report hash</dt><dd><code>${esc(summary.reportHash)}</code></dd></div><div><dt>Registry</dt><dd title="${esc(summary.registryAddress)}"><code>${esc(short(summary.registryAddress))}</code></dd></div></dl><details class="v4-proof-technical"><summary>Verification details</summary><dl class="v4-proof-grid"><div><dt>Schema / hash payload</dt><dd>${esc(summary.schemaVersion)} / ${esc(summary.hashPayloadVersion)}</dd></div><div><dt>Integrity</dt><dd>${esc(summary.integrity)}</dd></div><div><dt>Analysis</dt><dd>${summary.complete ? 'complete' : 'incomplete'}</dd></div><div><dt>Findings / policy</dt><dd>${esc(summary.findingCount)} / ${esc(summary.policyStatus)}</dd></div><div><dt>Compiler</dt><dd>${esc(summary.compilerVersion)}</dd></div><div><dt>Network / chain</dt><dd>${esc(summary.network)} / ${esc(summary.chainId)}</dd></div><div><dt>Registry V${esc(summary.registryContractVersion)}</dt><dd><code>${esc(short(summary.registryAddress))}</code></dd></div><div><dt>Envelope</dt><dd>${esc(summary.envelopeVersion)}</dd></div><div><dt>Canonical digest</dt><dd><code>${esc(summary.canonicalPayloadDigest)}</code></dd></div></dl></details>${reasons}`;
}

export function renderPreflightChecks(preflight) {
  const checks = preflight?.checks ?? [];
  const required = checks.filter((check) => check.applicable !== false);
  const passed = required.filter((check) => check.passed).length;
  const skipped = checks.length - required.length;
  const blocked = required.length - passed;
  const skippedText = skipped ? ` · ${skipped} not required` : '';
  return `<details class="v4-proof-checks"${blocked ? ' open' : ''}><summary>${passed}/${required.length} required checks passed${skippedText}</summary><ul class="v4-proof-check-list">${checks.map((check) => { const state = check.applicable === false ? 'not-required' : check.passed ? 'passed' : 'blocked'; const icon = check.applicable === false ? 'N/A' : check.passed ? '✓' : '!'; return `<li class="${state}"><span aria-hidden="true">${icon}</span><b>${esc(check.id)}</b><small>${esc(check.message)}</small></li>`; }).join('')}</ul></details>`;
}

export function renderTransactionSummary(summary) {
  if (!summary) return '';
  const incompleteReasons = summary.complete === false ? ` · ${esc((summary.incompleteReasonCodes ?? []).join(', ') || 'reason unavailable')}` : '';
  return `<dl class="v4-proof-grid v4-transaction-primary"><div><dt>Network</dt><dd>${esc(summary.networkName ?? 'Arc Testnet')}</dd></div><div><dt>From</dt><dd><code>${esc(short(summary.from))}</code></dd></div><div><dt>Trusted registry</dt><dd><code>${esc(short(summary.to))}</code></dd></div><div><dt>Report hash</dt><dd><code>${esc(short(summary.reportHash))}</code></dd></div><div><dt>Value</dt><dd>${esc(summary.value)}</dd></div><div><dt>Gas estimate</dt><dd>${esc(summary.gasEstimateStatus)}${summary.gasEstimate ? ` · ${esc(summary.gasEstimate)}` : ''}</dd></div><div><dt>Duplicate check</dt><dd>${summary.duplicate ? 'publisher record present' : 'not found'}</dd></div><div><dt>Method</dt><dd>${esc(summary.registryMethod)}</dd></div></dl><details class="v4-proof-technical"><summary>Advanced transaction details</summary><dl class="v4-proof-grid"><div><dt>Registry contract</dt><dd>V${esc(summary.registryContractVersion ?? '—')}</dd></div><div><dt>Chain ID</dt><dd>${esc(summary.chainId)}</dd></div><div><dt>Envelope / schema</dt><dd>${esc(summary.envelopeVersion ?? '—')} / ${esc(summary.schemaVersion ?? '—')}</dd></div><div><dt>Hash payload</dt><dd>${esc(summary.hashPayloadVersion ?? '—')}</dd></div><div><dt>Analysis</dt><dd>${summary.complete === false ? 'incomplete (acknowledged)' : 'complete'}${incompleteReasons}</dd></div><div><dt>Calldata</dt><dd><code>${esc(summary.calldataPreview ?? 'unavailable')}</code> · ${esc(summary.calldataBytes)} bytes</dd></div><div><dt>Calldata digest</dt><dd><code>${esc(short(summary.calldataDigest))}</code></dd></div><div><dt>Duplicate policy</dt><dd>${esc(summary.duplicatePolicy)}</dd></div><div><dt>Explorer destination</dt><dd>${esc(summary.explorerExpectation ?? 'available after a validated transaction hash')}</dd></div></dl></details>`;
}

export function renderProofExplorerLink(identity) {
  if (!identity?.explorerUrl || !identity?.transactionHash) return '';
  const transactionHash = String(identity.transactionHash).toLowerCase();
  if (!/^0x[0-9a-f]{64}$/u.test(transactionHash) || identity.explorerUrl !== `https://testnet.arcscan.app/tx/${transactionHash}`) return '';
  return `<p class="v4-proof-explorer"><a href="${esc(identity.explorerUrl)}" target="_blank" rel="noopener noreferrer">View transaction ${esc(short(identity.transactionHash))}</a></p>`;
}

export function renderExistingTransactionVerification(result = {}) {
  if (!result.status || result.status === 'idle') return '';
  if (result.status === 'verifying') return '<p><b>Verifying existing Arc Testnet transaction…</b></p>';
  if (result.status === 'invalid-input' || result.status === 'error') return `<div class="v4-proof-reconcile-error"><b>${result.status === 'invalid-input' ? 'Invalid transaction hash' : 'Verification failed'}</b><p>${esc(result.message)}</p></div>`;
  const identity = result.identity;
  if (result.status === 'report-hash-mismatch' && identity) return `<div class="v4-proof-reconcile-mismatch"><b>REPORT HASH MISMATCH</b><p>Existing Arc Testnet transaction verified, but its report hash does not match the currently open report.</p><dl class="v4-proof-grid"><div><dt>Transaction</dt><dd><code>${esc(short(identity.transactionHash))}</code></dd></div><div><dt>Block</dt><dd>${esc(identity.blockNumber)}</dd></div><div><dt>Publisher</dt><dd><code>${esc(short(identity.publisher))}</code></dd></div><div><dt>Registry</dt><dd><code>${esc(short(identity.registryAddress))}</code></dd></div><div><dt>Transaction report hash</dt><dd><code>${esc(short(identity.transactionReportHash))}</code></dd></div><div><dt>Current report hash</dt><dd><code>${esc(short(identity.currentReportHash))}</code></dd></div></dl>${renderProofExplorerLink(identity)}</div>`;
  if (result.status === 'verified' && identity) return `<div class="v4-proof-reconcile-success"><b>Existing transaction verified</b><p>The receipt, Registry V2 event and current report identity match. No new transaction is required.</p>${renderProofExplorerLink(identity)}</div>`;
  return '';
}
