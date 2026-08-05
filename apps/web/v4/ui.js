import { createV4WebExport, verifyV4WebExport } from './export-adapter.js';
import { browserFilesToScanInput } from './input-adapter.js';
import { clearV4Reports, listV4Reports, readV3Storage, removeV4Report, saveV4Report } from './persistence.js';
import { verifyV4Report } from './report-adapter.js';
import { createWorkerClient } from './runtime/worker-client.js';
import { WEB_V4_LIMITS } from './runtime/limits.js';
import { createV4ViewModel } from './view-models.js';
import { createWebProofEnvelope, prepareWebRegistryPublish } from './proof-adapter.js';
import { saveWebProofState } from './proof-persistence.js';
import { normalizeWebRegistryReceipt } from './proof-receipt.js';
import { proofSectionTemplate, renderPreflightChecks, renderProofExplorerLink, renderProofSummary, renderTransactionSummary } from './proof-ui.js';
import { attachProviderListeners, buildWalletState, disposeProviderListeners, inspectProvider } from './proof-wallet.js';

const DOMAIN_LABELS = Object.freeze({
  'arc-payments': 'Arc Payments',
  'arc-treasury': 'Arc Treasury',
  'arc-private-credit': 'Arc Private Credit',
});
const SEVERITY_ORDER = Object.freeze({ critical: 0, high: 1, medium: 2, low: 3, info: 4 });

const esc = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const formatBytes = (bytes) => bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KiB`;
const shortAddress = (value) => value ? `${value.slice(0, 6)}…${value.slice(-4)}` : '—';
const locationText = (location) => location ? `${location.sourcePath}:${location.startLine ?? '?'}:${location.startColumn ?? '?'}` : 'No safe source location';
const slug = (value) => String(value || 'veilforge-project').toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '') || 'veilforge-project';

export function v4ErrorMessage(error) {
  const messages = {
    WEB_V4_INPUT_INVALID: 'Choose valid UTF-8 Solidity files with safe project-relative paths.',
    WEB_V4_INPUT_LIMIT: 'The selected project exceeds the browser safety limit (100 files, 512 KiB per file, 1 MiB total).',
    WEB_V4_PROTOCOL_INVALID: 'The scanner returned an invalid worker message.',
    WEB_V4_PROTOCOL_MISMATCH: 'This page and its scanner worker are incompatible. Refresh after rebuilding the site.',
    WEB_V4_WORKER_BUSY: 'A V4 scan is already running.',
    WEB_V4_RUNTIME_UNAVAILABLE: 'The browser-compatible V4 scanner runtime is unavailable in this build.',
    WEB_V4_ABORTED: 'The V4 scan was cancelled. No partial result was saved.',
    WEB_V4_TIMEOUT: 'The V4 scan exceeded its safe runtime limit and was stopped.',
    WEB_V4_WORKER_CRASH: 'The isolated V4 scanner stopped unexpectedly. Retry with the same local files.',
    WEB_V4_REPORT_INVALID: 'The scanner result failed V4 schema or integrity validation.',
    WEB_V4_REPORT_UNVERIFIED: 'Only a cryptographically verified V4 report can be displayed or saved.',
    WEB_V4_LOCATION_UNSAFE: 'The report contains an unsafe source location and was rejected.',
    WEB_V4_PERSISTENCE_INVALID: 'A saved V4 report is corrupt or no longer compatible.',
    WEB_V4_PERSISTENCE_LIMIT: 'The verified report is too large for safe browser history.',
    WEB_V4_STORAGE_QUOTA: 'Browser storage is unavailable or full. Clear rejected V4 history or free site storage, then retry; V3 history is never removed.',
    WEB_V4_EXPORT_INVALID: 'Export verification failed. No file was downloaded.',
    WEB_V4_PROOF_UNAVAILABLE: 'Run and verify a V4 scan before preparing a registry proof.',
    WEB_V4_PROOF_ENVELOPE_INVALID: 'The proof envelope failed integrity verification.',
    WEB_V4_PROVIDER_UNAVAILABLE: 'No previously authorized injected EVM wallet is available. No connection popup was opened.',
    WEB_V4_ACCOUNT_UNAVAILABLE: 'The wallet has no previously authorized account for this site.',
    WEB_V4_WRONG_NETWORK: 'The wallet is not on the trusted Arc Testnet chain. Network switching is intentionally disabled in this phase.',
    WEB_V4_REGISTRY_MISMATCH: 'The proof does not target the trusted Arc Testnet Registry V2 address.',
    WEB_V4_PROOF_DISCLOSURE_REQUIRED: 'Acknowledge the incomplete-analysis disclosure before preflight.',
    WEB_V4_PROOF_PREFLIGHT_FAILED: 'Proof preflight failed closed. No transaction request was released.',
    WEB_V4_PROOF_DUPLICATE: 'This publisher-scoped proof is already present in the registry.',
    WEB_V4_USER_REJECTED: 'The simulated wallet request was rejected.',
    WEB_V4_TX_INVALID: 'The transaction identity is invalid.',
    WEB_V4_RECEIPT_REVERTED: 'The simulated registry transaction reverted.',
    WEB_V4_RECEIPT_INVALID: 'The simulated receipt failed verification.',
    WEB_V4_EVENT_MISMATCH: 'The registry publication event does not match this report and publisher.',
    WEB_V4_PROOF_PERSISTENCE_FAILED: 'The local proof state failed verification and was not loaded.',
  };
  return messages[error?.code] ?? 'The V4 scan could not complete safely. No unverified result was displayed.';
}

export function filterAndSortV4Findings(findings, filters = {}) {
  const query = String(filters.query ?? '').trim().toLowerCase();
  const selected = findings.filter((finding) => {
    if (filters.severity && filters.severity !== 'all' && finding.severity !== filters.severity) return false;
    if (filters.domain && filters.domain !== 'all' && finding.domain !== filters.domain) return false;
    if (filters.disposition && filters.disposition !== 'all' && finding.disposition !== filters.disposition) return false;
    if (filters.confidence && filters.confidence !== 'all' && finding.confidence !== filters.confidence) return false;
    if (filters.completeness === 'complete' && finding.incomplete) return false;
    if (filters.completeness === 'incomplete' && !finding.incomplete) return false;
    if (filters.detector && !finding.detectorId.toLowerCase().includes(String(filters.detector).toLowerCase())) return false;
    return !query || [finding.detectorId, finding.title, finding.summary, finding.sourceClass, finding.sinkClass].some((value) => String(value ?? '').toLowerCase().includes(query));
  });
  return [...selected].sort((left, right) => {
    if (filters.sort === 'location') return locationText(left.primaryLocation).localeCompare(locationText(right.primaryLocation)) || left.findingId.localeCompare(right.findingId);
    if (filters.sort === 'detector') return left.detectorId.localeCompare(right.detectorId) || left.findingId.localeCompare(right.findingId);
    if (filters.sort === 'occurrences') return (right.occurrenceCount ?? 1) - (left.occurrenceCount ?? 1) || left.findingId.localeCompare(right.findingId);
    return (SEVERITY_ORDER[left.severity] ?? 9) - (SEVERITY_ORDER[right.severity] ?? 9) || left.detectorId.localeCompare(right.detectorId) || left.findingId.localeCompare(right.findingId);
  });
}

export function v4UiTemplate() {
  return `
    <header class="sectionHead v4-heading"><div><span class="systemBadge"><i></i> VEILFORGE V4 VERIFIED FINDINGS</span><h2>Local analysis with <span class="headlineGradient">verified evidence.</span></h2><p>Source is not uploaded. Solidity 0.8.24 runs locally inside an isolated Web Worker. Reports may contain sensitive evidence.</p></div><div class="trustBadge"><i></i> V4 RC1 · BROWSER SCANNER · 1 MiB PROJECT LIMIT</div></header>
    <div class="v4-shell">
      <aside class="v4-intake panel" aria-labelledby="v4-intake-title">
        <header><div><small>PROJECT INTAKE</small><b id="v4-intake-title">Configure a V4 scan</b></div><span>1 MiB MAX</span></header>
        <div class="v4-intake-body">
          <label for="v4-project-name">Project label</label><input id="v4-project-name" class="text-input" value="VeilForge Web Project" maxlength="128" autocomplete="off">
          <fieldset><legend>Analysis domains</legend>${Object.entries(DOMAIN_LABELS).map(([value, label]) => `<label class="v4-check"><input type="checkbox" name="v4-domain" value="${value}" checked> ${label}</label>`).join('')}</fieldset>
          <label for="v4-policy-mode">Policy</label><select id="v4-policy-mode"><option value="none">No policy</option><option value="custom">Custom JSON policy</option></select>
          <label id="v4-policy-label" for="v4-policy" hidden>Policy JSON</label><textarea id="v4-policy" rows="7" spellcheck="false" hidden>{}</textarea>
          <div class="v4-compiler"><span>Exact compiler</span><code>solc 0.8.24</code></div>
          <div id="v4-drop-zone" class="drop-zone" tabindex="0" role="button" aria-label="Choose Solidity source files">
            <strong>Drop Solidity files or a project folder</strong><div class="drop-actions"><label class="file-button">Files<input id="v4-file-input" type="file" accept=".sol" multiple hidden></label><label class="file-button">Folder<input id="v4-folder-input" type="file" accept=".sol" webkitdirectory directory multiple hidden></label></div>
          </div>
          <div class="file-heading"><span>LOCAL SOURCES</span><button id="v4-clear" class="text-button" type="button">Clear</button></div>
          <div id="v4-files" class="v4-files" aria-live="polite"><p>No Solidity files selected.</p></div>
          <div class="v4-limit"><span id="v4-file-count">0 / 100 files</span><span id="v4-byte-count">0 B / 1 MiB</span></div>
          <progress id="v4-progress" value="0" max="100" aria-label="Scan progress"></progress><p id="v4-progress-label" class="scan-message" aria-live="polite">Ready for local input.</p>
          <div class="v4-scan-actions"><button id="v4-scan" class="scan-button primary" type="button">Run verified V4 scan</button><button id="v4-cancel" class="soft-button" type="button" disabled>Cancel</button></div>
        </div>
      </aside>
      <section class="v4-results" aria-label="Verified V4 results">
        <div id="v4-status" class="v4-status panel" role="status"><strong>Awaiting a verified report</strong><p>Unverified or partial worker output is never rendered.</p></div>
        <div id="v4-summary" class="v4-summary panel" hidden></div>
        ${proofSectionTemplate()}
        <div id="v4-controls" class="v4-controls panel" hidden>
          <label>Search <input id="v4-query" type="search" autocomplete="off"></label>
          <label>Severity <select id="v4-severity"><option value="all">All</option><option>critical</option><option>high</option><option>medium</option><option>low</option><option>info</option></select></label>
          <label>Domain <select id="v4-domain-filter"><option value="all">All</option>${Object.entries(DOMAIN_LABELS).map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select></label>
          <label>Disposition <select id="v4-disposition"><option value="all">All</option><option value="detected">detected</option><option value="policy-approved">policy-approved</option><option value="accepted-risk">accepted-risk</option><option value="suppressed">suppressed</option></select></label>
          <label>Confidence <select id="v4-confidence"><option value="all">All</option><option value="high">high</option><option value="medium">medium</option><option value="low">low</option></select></label>
          <label>Completeness <select id="v4-completeness"><option value="all">All</option><option value="complete">Complete</option><option value="incomplete">Incomplete</option></select></label>
          <label>Detector <input id="v4-detector" type="search" autocomplete="off"></label>
          <label>Sort <select id="v4-sort"><option value="severity">Severity</option><option value="detector">Detector</option><option value="location">Location</option><option value="occurrences">Occurrence count</option></select></label>
        </div>
        <div id="v4-findings" class="v4-findings" aria-live="polite"></div>
        <section id="v4-export" class="v4-secondary panel" hidden><header><div><small>VERIFIED EXPORT</small><b>Integrity-checked files</b></div></header><p>Each download is generated from the verified report and checked before release. SARIF and GitHub Action integration are CLI/CI-only.</p><div class="v4-button-row"><button data-v4-export="veilforge-report-v4.json" type="button">JSON report</button><button data-v4-export="veilforge-report-v4.md" type="button">Markdown</button><button data-v4-export="veilforge-web-export-manifest.json" type="button">Manifest</button></div></section>
        <section class="v4-secondary panel"><header><div><small>LOCAL HISTORY</small><b>Verified V4 reports</b></div><div class="v4-history-actions"><button id="v4-refresh-history" type="button">Refresh</button><button id="v4-clear-history" type="button">Clear V4 history</button></div></header><div id="v4-history"><p>No verified V4 history.</p></div></section>
        <details class="v4-secondary panel"><summary>Legacy V3 history and modules</summary><p>Read-only V3 history remains separate. Genome, Intent, Shadow Lab, MRI, Twin, Treatment, Forge, Compare, Proof Lab, Bytecode Truth, Passport, Arc Proof and Release Gate are legacy-only, CLI-only, or deferred for V4 RC1.</p><div id="v3-history"></div></details>
      </section>
    </div>
    <dialog id="v4-detail" class="v4-detail" aria-labelledby="v4-detail-title"><button id="v4-detail-close" class="v4-detail-close" type="button" aria-label="Close finding detail">×</button><div id="v4-detail-content"></div></dialog>
    <p class="disclaimer">Local deterministic source analysis. Findings are evidence, not a formal audit. Source content is not persisted by the V4 web UI.</p>`;
}

function findingDetail(finding) {
  const evidence = finding.evidence.length ? finding.evidence.map((item) => `<li><code>${esc(item.role ?? item.kind ?? 'evidence')}</code> ${esc(item.label ?? item.description ?? item.valueRole ?? JSON.stringify(item))}</li>`).join('') : '<li>No canonical evidence items.</li>';
  const steps = finding.trace?.steps?.length ? finding.trace.steps.map((step, index) => `<li><b>${index + 1}. ${esc(step.valueRole ?? step.kind ?? 'flow')}</b><span>${esc(locationText(step.location))}${step.boundaryMarker ? ` · ${esc(step.boundaryMarker)}` : ''}</span></li>`).join('') : '<li>No canonical trace steps.</li>';
  const remediation = finding.remediationSteps.length ? `<ol>${finding.remediationSteps.map((step) => `<li>${esc(typeof step === 'string' ? step : step.text ?? step.description ?? JSON.stringify(step))}</li>`).join('')}</ol>` : '<p>No V4 remediation steps were projected.</p>';
  const warnings = finding.unsafeRemediationWarnings.length ? `<div class="v4-warning"><b>Unsafe remediation warnings</b><ul>${finding.unsafeRemediationWarnings.map((item) => `<li>${esc(typeof item === 'string' ? item : item.message ?? JSON.stringify(item))}</li>`).join('')}</ul></div>` : '';
  const disposition = finding.policyMessage || finding.acceptedRiskMessage || finding.suppressionMessage;
  const related = finding.relatedLocations.length ? finding.relatedLocations.map((item) => `<li><code>${esc(locationText(item))}</code></li>`).join('') : '<li>No additional safe locations.</li>';
  return `<header><span class="v4-severity ${esc(finding.severity)}">${esc(finding.severity)}</span><div><small>${esc(finding.detectorId)}</small><h3 id="v4-detail-title">${esc(finding.title)}</h3></div></header><p>${esc(finding.explanation || finding.summary)}</p><dl><div><dt>Disposition</dt><dd>${esc(finding.disposition)}</dd></div><div><dt>Domain / category</dt><dd>${esc(DOMAIN_LABELS[finding.domain] ?? finding.domain)} · ${esc(finding.category ?? '—')}</dd></div><div><dt>Source → sink</dt><dd>${esc(finding.sourceClass)} → ${esc(finding.sinkClass)}</dd></div><div><dt>Confidence</dt><dd>${esc(finding.confidence)}</dd></div><div><dt>Primary location</dt><dd><code>${esc(locationText(finding.primaryLocation))}</code></dd></div><div><dt>Contract / callable context</dt><dd>${esc([...finding.contractIds, ...finding.callableIds].join(', ') || 'not projected')}</dd></div><div><dt>Occurrences</dt><dd>${esc(finding.occurrenceCount ?? 1)} · ${esc(finding.groupedOccurrenceIds.join(', ') || 'not grouped')}</dd></div></dl>${disposition ? `<div class="v4-disposition-note">${esc(disposition)}</div>` : ''}${finding.incomplete ? `<div class="v4-warning"><b>Incomplete analysis</b><ul>${finding.incompleteMessages.map((item) => `<li>${esc(typeof item === 'string' ? item : item.message ?? JSON.stringify(item))}</li>`).join('')}</ul></div>` : ''}<h4>Related locations</h4><ul>${related}</ul><h4>Evidence</h4><ul class="v4-evidence">${evidence}</ul><h4>Trace${finding.trace?.complete === false ? ' · incomplete' : ''}</h4><ol class="v4-trace">${steps}</ol><h4>${esc(finding.remediationTitle || 'Remediation')}</h4>${remediation}${warnings}<p class="v4-fingerprint">Finding fingerprint: <code>${esc(finding.fingerprint || finding.findingId)}</code><br>Report identity is shown in the verified summary.</p>`;
}

function download(filename, bytes, mediaType) {
  const blob = new Blob([bytes], { type: mediaType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

export async function initV4Ui(options = {}) {
  const root = options.root ?? document.querySelector('#scanner');
  const storage = options.storage ?? localStorage;
  if (!root) throw new Error('V4 scanner mount is unavailable.');
  document.body.classList.add('v4-ui-mode');
  document.querySelector('.versionPill')?.replaceChildren('V4 RC1');
  const chip = document.querySelector('.chip'); if (chip) chip.innerHTML = '<i></i> VeilForge V4 RC1 · VERIFIED FINDINGS';
  root.innerHTML = v4UiTemplate();
  const byId = (id) => root.querySelector(`#${id}`);
  const state = { files: [], bytes: 0, inputError: null, client: null, verification: null, viewModel: null, exportBundle: null, proof: { envelope: null, wallet: buildWalletState(), preflight: null, status: 'unavailable', receipt: null, provider: null }, filters: { query: '', severity: 'all', domain: 'all', disposition: 'all', confidence: 'all', completeness: 'all', detector: '', sort: 'severity' } };

  const setStatus = (title, text, kind = '') => { const node = byId('v4-status'); node.className = `v4-status panel ${kind}`; node.innerHTML = `<strong>${esc(title)}</strong><p>${esc(text)}</p>`; };
  const setBusy = (busy) => { byId('v4-scan').disabled = busy; byId('v4-cancel').disabled = !busy; byId('v4-file-input').disabled = busy; byId('v4-folder-input').disabled = busy; };
  const renderProof = () => {
    const proof = state.proof;
    byId('v4-proof-state').textContent = proof.status.replaceAll('-', ' ').toUpperCase();
    if (!proof.envelope) {
      byId('v4-proof-status').innerHTML = '<p>Run and verify a V4 scan to prepare a proof envelope.</p>';
      byId('v4-proof-summary').hidden = true; byId('v4-proof-wallet').hidden = true; byId('v4-proof-checks').hidden = true; byId('v4-proof-transaction').hidden = true;
      byId('v4-proof-inspect-wallet').disabled = true; byId('v4-proof-preflight').disabled = true; byId('v4-proof-disclosure').hidden = true;
      return;
    }
    byId('v4-proof-summary').hidden = false; byId('v4-proof-summary').innerHTML = renderProofSummary(proof.envelope);
    byId('v4-proof-disclosure').hidden = proof.envelope.complete;
    const wallet = proof.wallet;
    byId('v4-proof-wallet').hidden = false;
    byId('v4-proof-wallet').innerHTML = `<p><b>Wallet boundary:</b> ${wallet.providerAvailable ? wallet.connected ? `${esc(shortAddress(wallet.account))} on chain ${esc(wallet.chainId)}` : 'provider available; no authorized account' : 'provider unavailable'}.</p>`;
    byId('v4-proof-inspect-wallet').disabled = false;
    const acknowledged = proof.envelope.complete || byId('v4-proof-ack').checked;
    byId('v4-proof-preflight').disabled = !(wallet.connected && acknowledged);
    const statusMessages = {
      'already-published': 'An identical publisher-scoped proof already exists; no new transaction was prepared.',
      'ready-to-publish': 'Preflight passed. The transaction request is prepared but cannot be sent in this phase.',
      confirmed: 'The mock receipt and Registry V2 publication event were verified.',
      reverted: 'The mock registry transaction reverted; the proof was not confirmed.',
      'receipt-invalid': 'The mock receipt failed verification; the proof was not confirmed.',
      'wrong-network': 'The connected wallet is not on the trusted Arc Testnet chain.',
      'wallet-not-connected': 'No previously authorized wallet account is available.',
      'preflight-checking': 'Running deterministic proof preflight checks…',
      'preflight-failed': 'Proof preflight failed closed; no transaction request was released.',
      'user-rejected': 'The simulated wallet request was rejected; no transaction was sent.',
      cancelled: 'The simulated publication request was cancelled; no transaction was sent.',
      pending: 'The simulated transaction is pending receipt verification.',
    };
    const fallback = proof.envelope.complete ? 'Verified proof envelope ready for read-only wallet inspection.' : 'Verified incomplete report. Disclosure acknowledgement is required before preflight.';
    byId('v4-proof-status').innerHTML = `<p>${esc(statusMessages[proof.status] ?? fallback)}</p>${renderProofExplorerLink(proof.receipt ?? proof.preflight?.transactionIdentity)}`;
    byId('v4-proof-preflight').textContent = proof.status === 'already-published' ? 'Reverify registry status' : 'Prepare transaction request';
    byId('v4-proof-checks').hidden = !proof.preflight; byId('v4-proof-checks').innerHTML = proof.preflight ? renderPreflightChecks(proof.preflight) : '';
    const summary = proof.preflight?.transactionSummary;
    byId('v4-proof-transaction').hidden = !summary; byId('v4-proof-transaction-summary').innerHTML = renderTransactionSummary(summary);
  };
  const initializeProof = async () => {
    try {
      state.proof.envelope = await createWebProofEnvelope(state.verification);
      state.proof.preflight = null; state.proof.receipt = null;
      state.proof.status = state.proof.envelope.complete ? 'ready' : 'incomplete-warning';
    } catch { state.proof = { ...state.proof, envelope: null, preflight: null, receipt: null, status: 'report-unverified' }; }
    renderProof();
  };
  const inspectProofWallet = async () => {
    const provider = options.proofProvider ?? globalThis.ethereum;
    state.proof.provider = provider ?? null;
    state.proof.wallet = await inspectProvider(provider);
    state.proof.status = !state.proof.wallet.providerAvailable ? 'wallet-not-connected' : !state.proof.wallet.connected ? 'wallet-not-connected' : state.proof.wallet.chainId !== state.proof.envelope.chainId ? 'wrong-network' : state.proof.envelope.complete ? 'ready' : 'incomplete-warning';
    if (provider) attachProviderListeners(provider, {
      onAccountsChanged(accounts) { state.proof.wallet = buildWalletState({ providerAvailable: true, accounts, chainId: state.proof.wallet.chainId }); state.proof.status = accounts.length ? 'ready' : 'wallet-not-connected'; renderProof(); },
      onChainChanged(chainId) { state.proof.wallet = buildWalletState({ providerAvailable: true, accounts: state.proof.wallet.accounts, chainId }); state.proof.status = chainId === state.proof.envelope.chainId ? 'ready' : 'wrong-network'; renderProof(); },
      onDisconnect() { state.proof.wallet = buildWalletState({ providerAvailable: true, disconnected: true }); state.proof.status = 'wallet-not-connected'; renderProof(); },
    });
    renderProof(); return state.proof.wallet;
  };
  const runProofPreflight = async () => {
    state.proof.status = 'preflight-checking'; renderProof();
    try {
      const lookup = typeof options.proofRecordLookup === 'function' ? await options.proofRecordLookup(state.proof.envelope, state.proof.wallet) : null;
      const existingRecord = lookup?.record ?? lookup;
      const existingTransactionIdentity = lookup?.transactionIdentity ?? null;
      state.proof.preflight = await prepareWebRegistryPublish({ verification: state.verification, envelope: state.proof.envelope, walletState: state.proof.wallet, disclosureAcknowledged: byId('v4-proof-ack').checked, existingRecord, existingTransactionIdentity });
      state.proof.status = state.proof.preflight.status;
      await saveWebProofState(storage, { envelope: state.proof.envelope, preflight: state.proof.preflight, status: state.proof.status });
    } catch (error) { state.proof.status = 'preflight-failed'; state.proof.preflight = { status: 'preflight-failed', checks: [], blockingReasons: [error?.code ?? 'WEB_V4_PROOF_PREFLIGHT_FAILED'], warnings: [], transactionRequest: null }; }
    renderProof(); return state.proof.preflight;
  };
  const acceptMockReceipt = async (receipt) => {
    try {
      state.proof.receipt = await normalizeWebRegistryReceipt(receipt, state.proof.envelope, { verification: state.verification, publisher: state.proof.wallet.account, providerChainId: state.proof.wallet.chainId });
      state.proof.status = 'confirmed';
      await saveWebProofState(storage, { envelope: state.proof.envelope, preflight: state.proof.preflight, status: 'confirmed', transactionHash: state.proof.receipt.transactionHash, receiptSummary: state.proof.receipt });
    } catch (error) { state.proof.status = error?.code === 'WEB_V4_RECEIPT_REVERTED' ? 'reverted' : 'receipt-invalid'; }
    renderProof(); return state.proof.receipt;
  };
  const renderFiles = () => {
    byId('v4-files').innerHTML = state.files.length ? state.files.map((file) => `<div><span>${esc(file.webkitRelativePath || file.name)}</span><small>${formatBytes(file.size)}</small></div>`).join('') : '<p>No Solidity files selected.</p>';
    byId('v4-file-count').textContent = `${state.files.length} / ${WEB_V4_LIMITS.maxFileCount} files`;
    byId('v4-byte-count').textContent = `${formatBytes(state.bytes)} / 1 MiB`;
    root.classList.toggle('v4-input-over-limit', state.files.length > WEB_V4_LIMITS.maxFileCount || state.bytes > WEB_V4_LIMITS.maxProjectBytes || state.files.some((file) => file.size > WEB_V4_LIMITS.maxPerFileBytes));
  };
  const renderFindings = () => {
    const findings = filterAndSortV4Findings(state.viewModel?.findings ?? [], state.filters);
    byId('v4-findings').innerHTML = findings.length ? findings.map((finding) => `<article class="v4-finding panel ${finding.incomplete ? 'incomplete' : ''}"><div class="v4-finding-top"><span class="v4-severity ${esc(finding.severity)}">${esc(finding.severity)}</span><span class="v4-disposition">${esc(finding.disposition)}</span></div><small>${esc(DOMAIN_LABELS[finding.domain] ?? finding.domain)} · ${esc(finding.detectorId)}</small><h3>${esc(finding.title)}</h3><p>${esc(finding.summary)}</p><dl class="v4-card-facts"><div><dt>Category</dt><dd>${esc(finding.category ?? '—')}</dd></div><div><dt>Source → sink</dt><dd>${esc(finding.sourceClass)} → ${esc(finding.sinkClass)}</dd></div><div><dt>Confidence</dt><dd>${esc(finding.confidence)}</dd></div><div><dt>Context</dt><dd>${esc([...finding.contractIds, ...finding.callableIds].join(', ') || 'not projected')}</dd></div></dl><p class="v4-remediation-summary">${esc(finding.remediationTitle || finding.remediationSteps[0] || 'Review canonical remediation guidance in detail.')}</p><div class="v4-finding-meta"><code>${esc(locationText(finding.primaryLocation))}</code><span>${esc(finding.occurrenceCount ?? 1)} occurrence${finding.occurrenceCount === 1 ? '' : 's'}</span>${finding.incomplete ? '<strong>INCOMPLETE</strong>' : ''}</div><button type="button" data-v4-finding="${esc(finding.findingId)}">Inspect evidence and trace</button></article>`).join('') : '<div class="v4-empty panel"><strong>No matching findings</strong><p>Change the filters or inspect the verified zero-finding summary. No finding is not proof of confidentiality.</p></div>';
  };
  const renderReport = () => {
    const view = state.viewModel;
    const summary = view.summary;
    byId('v4-summary').hidden = false; byId('v4-controls').hidden = false; byId('v4-export').hidden = false;
    const gate = view.gate ? `<div><span>Release gate</span><strong>${esc(view.gate.decision ?? view.gate.status ?? 'present')}</strong></div>` : '<div><span>Release gate</span><strong>Evaluate in CLI/CI</strong></div>';
    const counts = (field) => Object.entries(view.findings.reduce((all, item) => ({ ...all, [item[field] ?? 'unknown']: (all[item[field] ?? 'unknown'] ?? 0) + 1 }), {})).map(([key, value]) => `${key} ${value}`).join(' · ') || 'none';
    byId('v4-summary').innerHTML = `<header><div><small>VERIFIED REPORT · SCHEMA ${esc(view.reportVersion)}</small><b>${esc(view.projectId)}</b></div><span class="v4-verified">✓ HASH VERIFIED</span></header><div class="v4-summary-grid"><div><span>Findings</span><strong>${esc(summary.totalFindings ?? view.findings.length)}</strong></div><div><span>Active detected</span><strong>${esc(summary.activeDetected ?? view.findings.filter((item) => item.disposition === 'detected').length)}</strong></div><div><span>Analysis</span><strong>${view.analysis.complete ? 'Complete' : 'Incomplete'}</strong></div><div><span>Policy</span><strong>${esc(view.policy.status)}</strong></div><div><span>Compiler</span><strong>${esc(view.compiler.version)}</strong></div><div><span>Duration</span><strong>${view.operational.durationMs == null ? 'not recorded' : `${esc(view.operational.durationMs)} ms`}</strong></div><div><span>Severity</span><strong>${esc(counts('severity'))}</strong></div><div><span>Disposition</span><strong>${esc(counts('disposition'))}</strong></div><div><span>Domains</span><strong>${esc(counts('domain'))}</strong></div>${gate}</div><code class="v4-report-hash" tabindex="0">${esc(view.reportHash)}</code>${view.analysis.incompleteReasons.length ? `<div class="v4-warning"><b>Scan completed with incomplete analysis</b><p>No finding is not proof of confidentiality.</p><ul>${view.analysis.incompleteReasons.map((item) => `<li>${esc(typeof item === 'string' ? item : item.message ?? item.code ?? JSON.stringify(item))}</li>`).join('')}</ul></div>` : ''}`;
    renderFindings();
  };
  const renderHistory = async () => {
    const history = await listV4Reports(storage);
    byId('v4-history').innerHTML = history.entries.length ? history.entries.map((item) => { const view = createV4ViewModel(item.verification); return `<article><div><b>${esc(item.projectId)}</b><small>${esc(item.createdAt)} · schema ${esc(view.reportVersion)} · ${view.analysis.complete ? 'complete' : 'incomplete'} · ${view.findings.length} findings</small></div><code>${esc(item.reportHash)}</code><div class="v4-history-actions"><button type="button" data-v4-history="${esc(item.projectId)}">Open</button><button type="button" data-v4-delete="${esc(item.projectId)}">Delete</button></div></article>`; }).join('') : '<p>No verified V4 history.</p>';
    if (history.errors.length) byId('v4-history').insertAdjacentHTML('beforeend', `<div class="v4-history-error" role="alert"><p>${history.errors.length} corrupt or inaccessible V4 history entr${history.errors.length === 1 ? 'y was' : 'ies were'} rejected. V3 history was not touched.</p><button id="v4-clear-rejected" type="button">Clear rejected V4 entries</button></div>`);
    const legacy = readV3Storage(storage);
    byId('v3-history').innerHTML = Array.isArray(legacy) && legacy.length ? `<p>${legacy.length} read-only V3 entr${legacy.length === 1 ? 'y' : 'ies'} retained. They are not converted to V4.</p>` : '<p>No V3 history found.</p>';
  };
  const acceptFiles = (files) => {
    state.files = [...files].filter((file) => file.name.toLowerCase().endsWith('.sol'));
    state.bytes = state.files.reduce((total, file) => total + file.size, 0); renderFiles();
    const paths = state.files.map((file) => file.webkitRelativePath || file.name);
    const folded = new Set(); const collision = paths.some((path) => { const key = path.toLowerCase(); if (folded.has(key)) return true; folded.add(key); return false; });
    state.inputError = collision ? 'Duplicate or case-folding-colliding source paths are not accepted.' : state.files.length > WEB_V4_LIMITS.maxFileCount || state.bytes > WEB_V4_LIMITS.maxProjectBytes || state.files.some((file) => file.size > WEB_V4_LIMITS.maxPerFileBytes) ? 'The selected files exceed the browser safety limit.' : null;
    if (state.inputError) setStatus('Input rejected', state.inputError, 'error');
  };
  const runScan = async () => {
    if (!state.files.length) { setStatus('Solidity sources required', 'Choose one or more .sol files before scanning.', 'error'); return; }
    if (state.inputError) { setStatus('Input rejected', state.inputError, 'error'); return; }
    let policy;
    try { if (byId('v4-policy-mode').value === 'custom') policy = JSON.parse(byId('v4-policy').value); }
    catch { setStatus('Policy JSON is invalid', 'Correct the custom policy before starting the scan.', 'error'); return; }
    setBusy(true); byId('v4-progress').value = 2; byId('v4-progress-label').textContent = 'Starting isolated V4 worker…'; setStatus('Scanning locally', 'Source content stays in this browser. Partial output will not be displayed.');
    state.client = createWorkerClient();
    try {
      const projectName = byId('v4-project-name').value.trim() || 'VeilForge Web Project';
      const projectId = slug(projectName);
      const domains = [...root.querySelectorAll('[name="v4-domain"]:checked')].map((node) => node.value);
      if (!domains.length) throw Object.assign(new Error('domain'), { code: 'WEB_V4_INPUT_INVALID' });
      const input = await browserFilesToScanInput(state.files, { projectId, projectName, domains, compilerVersion: '0.8.24', ...(policy === undefined ? {} : { policy }) });
      const result = await state.client.scan(input, { onProgress(progress) { const value = Number(progress?.percent ?? progress?.progress ?? 0); byId('v4-progress').value = Math.max(4, Math.min(96, Number.isFinite(value) ? value : 20)); byId('v4-progress-label').textContent = `V4 analysis: ${progress?.stage ?? progress?.message ?? 'running locally'}…`; } });
      const verification = await verifyV4Report(result?.report ?? result);
      const viewModel = createV4ViewModel(verification, { gate: result?.gate });
      state.verification = verification; state.viewModel = viewModel; state.exportBundle = null;
      let persistenceWarning = null;
      try { await saveV4Report(storage, verification, { viewModel }); } catch (error) { if (error?.code !== 'WEB_V4_STORAGE_QUOTA' && error?.code !== 'WEB_V4_PERSISTENCE_LIMIT') throw error; persistenceWarning = v4ErrorMessage(error); }
      byId('v4-progress').value = 100; byId('v4-progress-label').textContent = 'Verified V4 report ready.';
      setStatus('Verified result ready', `${viewModel.findings.length} canonical finding${viewModel.findings.length === 1 ? '' : 's'} · ${viewModel.reportHash}${persistenceWarning ? ` · History not saved: ${persistenceWarning}` : ''}`, persistenceWarning ? 'warning' : 'success');
      renderReport(); await initializeProof(); await renderHistory();
    } catch (error) { state.proof.status = 'report-unverified'; state.proof.envelope = null; renderProof(); byId('v4-progress').value = 0; byId('v4-progress-label').textContent = 'Scan did not produce a verified report.'; setStatus(error?.code === 'WEB_V4_ABORTED' ? 'Scan cancelled' : 'V4 scan blocked', v4ErrorMessage(error), 'error'); }
    finally { state.client?.dispose(); state.client = null; setBusy(false); }
  };

  byId('v4-file-input').addEventListener('change', (event) => acceptFiles(event.target.files));
  byId('v4-folder-input').addEventListener('change', (event) => acceptFiles(event.target.files));
  byId('v4-clear').addEventListener('click', () => { state.files = []; state.bytes = 0; state.inputError = null; byId('v4-file-input').value = ''; byId('v4-folder-input').value = ''; renderFiles(); });
  byId('v4-drop-zone').addEventListener('click', (event) => { if (!event.target.closest('label')) byId('v4-file-input').click(); });
  byId('v4-drop-zone').addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); byId('v4-file-input').click(); } });
  byId('v4-drop-zone').addEventListener('dragover', (event) => event.preventDefault());
  byId('v4-drop-zone').addEventListener('drop', (event) => { event.preventDefault(); acceptFiles(event.dataTransfer.files); });
  byId('v4-policy-mode').addEventListener('change', (event) => { const show = event.target.value === 'custom'; byId('v4-policy').hidden = !show; byId('v4-policy-label').hidden = !show; });
  byId('v4-scan').addEventListener('click', runScan);
  byId('v4-cancel').addEventListener('click', () => {
    if (!state.client) return;
    state.client.abort();
    if (!state.client.disposed) state.client.dispose();
    byId('v4-progress-label').textContent = 'Cancellation requested…';
    byId('v4-cancel').disabled = true;
  });
  byId('v4-proof-inspect-wallet').addEventListener('click', inspectProofWallet);
  byId('v4-proof-preflight').addEventListener('click', runProofPreflight);
  byId('v4-proof-ack').addEventListener('change', renderProof);
  for (const [id, key, eventName] of [['v4-query', 'query', 'input'], ['v4-severity', 'severity', 'change'], ['v4-domain-filter', 'domain', 'change'], ['v4-disposition', 'disposition', 'change'], ['v4-confidence', 'confidence', 'change'], ['v4-completeness', 'completeness', 'change'], ['v4-detector', 'detector', 'input'], ['v4-sort', 'sort', 'change']]) byId(id).addEventListener(eventName, (event) => { state.filters[key] = event.target.value; renderFindings(); });
  byId('v4-findings').addEventListener('click', (event) => { const button = event.target.closest('[data-v4-finding]'); if (!button) return; const finding = state.viewModel.findings.find((item) => item.findingId === button.dataset.v4Finding); if (!finding) return; byId('v4-detail-content').innerHTML = findingDetail(finding); byId('v4-detail').showModal(); byId('v4-detail-close').focus(); });
  byId('v4-detail-close').addEventListener('click', () => byId('v4-detail').close());
  byId('v4-detail').addEventListener('click', (event) => { if (event.target === byId('v4-detail')) byId('v4-detail').close(); });
  byId('v4-detail').addEventListener('keydown', (event) => { if (event.key !== 'Tab') return; const focusable = [...byId('v4-detail').querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')]; if (!focusable.length) return; const first = focusable[0], last = focusable.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } });
  byId('v4-export').addEventListener('click', async (event) => { const button = event.target.closest('[data-v4-export]'); if (!button || !state.verification) return; try { const bundle = state.exportBundle ?? await createV4WebExport(state.verification, state.viewModel); await verifyV4WebExport(bundle); state.exportBundle = bundle; const file = bundle.files.find((item) => item.filename === button.dataset.v4Export); if (!file) throw new Error('missing'); download(file.filename, file.bytes, file.mediaType); setStatus('Verified export ready', `${file.filename} passed digest verification before download.`, 'success'); } catch (error) { setStatus('Export blocked', v4ErrorMessage(error), 'error'); } });
  byId('v4-refresh-history').addEventListener('click', renderHistory);
  byId('v4-clear-history').addEventListener('click', async () => { try { const count = clearV4Reports(storage); await renderHistory(); setStatus('V4 history cleared', `${count} V4 entr${count === 1 ? 'y' : 'ies'} removed. Legacy V3 history was preserved.`, 'success'); } catch (error) { setStatus('History recovery blocked', `${v4ErrorMessage(error)} Diagnostic: ${error?.code ?? 'WEB_V4_STORAGE_QUOTA'}`, 'error'); } });
  byId('v4-history').addEventListener('click', async (event) => { const button = event.target.closest('[data-v4-history]'); if (!button) return; try { const history = await listV4Reports(storage); const item = history.entries.find((entry) => entry.projectId === button.dataset.v4History); if (!item) throw Object.assign(new Error('history'), { code: 'WEB_V4_PERSISTENCE_INVALID' }); state.verification = item.verification; state.viewModel = createV4ViewModel(item.verification); state.exportBundle = null; renderReport(); await initializeProof(); setStatus('Verified history opened', item.reportHash, 'success'); } catch (error) { setStatus('History entry rejected', v4ErrorMessage(error), 'error'); } });
  byId('v4-history').addEventListener('click', async (event) => { const button = event.target.closest('[data-v4-delete]'); if (!button) return; try { removeV4Report(storage, button.dataset.v4Delete); await renderHistory(); setStatus('V4 history entry deleted', 'Only the selected V4 report was removed.', 'success'); } catch (error) { setStatus('History recovery blocked', `${v4ErrorMessage(error)} Diagnostic: ${error?.code ?? 'WEB_V4_STORAGE_QUOTA'}`, 'error'); } });
  byId('v4-history').addEventListener('click', async (event) => { if (!event.target.closest('#v4-clear-rejected')) return; try { const count = clearV4Reports(storage); await renderHistory(); setStatus('Rejected V4 history cleared', `${count} V4 entr${count === 1 ? 'y' : 'ies'} removed. Legacy V3 history was preserved.`, 'success'); } catch (error) { setStatus('History recovery blocked', `${v4ErrorMessage(error)} Diagnostic: ${error?.code ?? 'WEB_V4_STORAGE_QUOTA'}`, 'error'); } });
  document.querySelector('#heroDemo')?.addEventListener('click', () => root.scrollIntoView({ behavior: 'smooth' }));
  document.querySelector('#heroUpload')?.addEventListener('click', () => { root.scrollIntoView({ behavior: 'smooth' }); byId('v4-file-input').click(); });
  renderFiles(); renderProof(); await renderHistory();
  return Object.freeze({ runScan, renderHistory, inspectProofWallet, runProofPreflight, acceptMockReceipt, dispose() { if (state.proof.provider) disposeProviderListeners(state.proof.provider); state.client?.dispose(); } });
}
