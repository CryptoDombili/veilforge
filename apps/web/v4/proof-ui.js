import { resolveProofNetwork } from '../../../packages/proof/v4/network.js';
import { deepFreeze } from './canonical.js';

const esc = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const short = (value) => value ? `${value.slice(0, 8)}…${value.slice(-6)}` : '—';

export function proofSectionTemplate() {
  return `<section id="v4-proof" class="v4-secondary v4-proof panel" aria-labelledby="v4-proof-title">
    <header><div><small>V4 REGISTRY PROOF</small><b id="v4-proof-title">Verified report anchor</b></div><span id="v4-proof-state" class="v4-proof-state">UNAVAILABLE</span></header>
    <div id="v4-proof-status" role="status" aria-live="polite"><p>Run and verify a V4 scan to prepare a proof envelope.</p></div>
    <div id="v4-proof-summary" hidden></div>
    <div id="v4-proof-wallet" hidden></div>
    <div id="v4-proof-disclosure" class="v4-proof-disclosure" hidden><label for="v4-proof-ack"><input id="v4-proof-ack" type="checkbox"> I understand this proof anchors analysis evidence; it does not certify confidentiality.</label></div>
    <div id="v4-proof-checks" hidden></div>
    <div class="v4-button-row"><button id="v4-proof-inspect-wallet" type="button" disabled>Connect Wallet</button><button id="v4-proof-preflight" type="button" disabled>Review &amp; Publish Proof</button></div>
    <details id="v4-proof-transaction" hidden><summary>Safe transaction request summary</summary><div id="v4-proof-transaction-summary"></div></details>
    <div id="v4-proof-review-acknowledgement" class="v4-proof-disclosure" hidden><label for="v4-proof-review-ack"><input id="v4-proof-review-ack" type="checkbox"> I reviewed the network, account, registry, report hash, value and transaction summary.</label></div>
    <button id="v4-proof-send" type="button" disabled>Send transaction (disabled)</button>
    <p class="v4-proof-boundary"><b>Transaction sending is disabled in this preflight build.</b> Transaction submission is disabled in Phase 5C-3A. Wallet connection requires an explicit click; no signature, network switch, or send call is made automatically.</p>
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
  return `<dl class="v4-proof-grid"><div><dt>Report hash</dt><dd><code>${esc(summary.reportHash)}</code></dd></div><div><dt>Schema / hash payload</dt><dd>${esc(summary.schemaVersion)} / ${esc(summary.hashPayloadVersion)}</dd></div><div><dt>Integrity</dt><dd>${esc(summary.integrity)}</dd></div><div><dt>Analysis</dt><dd>${summary.complete ? 'complete' : 'incomplete'}</dd></div><div><dt>Findings / policy</dt><dd>${esc(summary.findingCount)} / ${esc(summary.policyStatus)}</dd></div><div><dt>Compiler</dt><dd>${esc(summary.compilerVersion)}</dd></div><div><dt>Network / chain</dt><dd>${esc(summary.network)} / ${esc(summary.chainId)}</dd></div><div><dt>Registry V${esc(summary.registryContractVersion)}</dt><dd title="${esc(summary.registryAddress)}"><code>${esc(short(summary.registryAddress))}</code></dd></div><div><dt>Envelope</dt><dd>${esc(summary.envelopeVersion)}</dd></div><div><dt>Canonical digest</dt><dd><code>${esc(summary.canonicalPayloadDigest)}</code></dd></div></dl>${reasons}`;
}

export function renderPreflightChecks(preflight) {
  return `<h4>Preflight checks</h4><ul class="v4-proof-check-list">${(preflight?.checks ?? []).map((check) => `<li class="${check.passed ? 'passed' : 'blocked'}"><span aria-hidden="true">${check.passed ? '✓' : '!'}</span><b>${esc(check.id)}</b><small>${esc(check.message)}</small></li>`).join('')}</ul>`;
}

export function renderTransactionSummary(summary) {
  if (!summary) return '';
  return `<dl class="v4-proof-grid"><div><dt>Network</dt><dd>${esc(summary.networkName ?? 'Arc Testnet')}</dd></div><div><dt>From</dt><dd><code>${esc(short(summary.from))}</code></dd></div><div><dt>To trusted registry</dt><dd><code>${esc(short(summary.to))}</code></dd></div><div><dt>Chain ID</dt><dd>${esc(summary.chainId)}</dd></div><div><dt>Report hash</dt><dd><code>${esc(short(summary.reportHash))}</code></dd></div><div><dt>Envelope / schema</dt><dd>${esc(summary.envelopeVersion ?? '—')} / ${esc(summary.schemaVersion ?? '—')}</dd></div><div><dt>Hash payload</dt><dd>${esc(summary.hashPayloadVersion ?? '—')}</dd></div><div><dt>Analysis</dt><dd>${summary.complete === false ? 'incomplete (acknowledged)' : 'complete'}</dd></div><div><dt>Value</dt><dd>${esc(summary.value)}</dd></div><div><dt>Method</dt><dd>${esc(summary.registryMethod)}</dd></div><div><dt>Calldata</dt><dd>${esc(summary.calldataBytes)} bytes (hidden)</dd></div><div><dt>Calldata digest</dt><dd><code>${esc(short(summary.calldataDigest))}</code></dd></div><div><dt>Gas estimate</dt><dd>${esc(summary.gasEstimateStatus)}${summary.gasEstimate ? ` · ${esc(summary.gasEstimate)}` : ''}</dd></div><div><dt>Duplicate</dt><dd>${summary.duplicate ? 'publisher record present' : 'not found'} · ${esc(summary.duplicatePolicy)}</dd></div><div><dt>Explorer destination</dt><dd>${esc(summary.explorerExpectation ?? 'available after a validated transaction hash')}</dd></div></dl>`;
}

export function renderProofExplorerLink(identity) {
  if (!identity?.explorerUrl || !identity?.transactionHash) return '';
  const transactionHash = String(identity.transactionHash).toLowerCase();
  if (!/^0x[0-9a-f]{64}$/u.test(transactionHash) || identity.explorerUrl !== `https://testnet.arcscan.app/tx/${transactionHash}`) return '';
  return `<p class="v4-proof-explorer"><a href="${esc(identity.explorerUrl)}" target="_blank" rel="noopener noreferrer">View transaction ${esc(short(identity.transactionHash))}</a></p>`;
}
