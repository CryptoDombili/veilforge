import {
  compareReports,
  formatMarkdownReport,
  generatePolicyManifest,
  scanProject,
} from './engine/index.js';
import {
  ARC_TESTNET,
  buildProofPayload,
  connectWallet,
  publishReport,
} from './proof/registry.js';
import { createZip } from './lib/zip.js';
import { REGISTRY_ADDRESS } from './config.js';

const HISTORY_KEY = 'veilforge:v1.8:scan-history';
const MAX_HISTORY = 12;

const state = {
  files: [],
  report: null,
  baseline: null,
  activeView: 'triage',
  walletAccount: null,
  history: readHistory(),
  filters: { query: '', severity: 'all', policy: 'all' },
};

const elements = {
  projectName: document.querySelector('#project-name'),
  fileInput: document.querySelector('#file-input'),
  folderInput: document.querySelector('#folder-input'),
  dropZone: document.querySelector('#drop-zone'),
  fileList: document.querySelector('#file-list'),
  clearFiles: document.querySelector('#clear-files'),
  scanButton: document.querySelector('#scan-button'),
  scanMessage: document.querySelector('#scan-message'),
  missionSummary: document.querySelector('#mission-summary'),
  workspace: document.querySelector('#workspace'),
};

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function slugify(value) {
  return String(value || 'veilforge-project')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'veilforge-project';
}

function shortHash(value, head = 12, tail = 8) {
  const text = String(value ?? '');
  return text.length > head + tail + 3 ? `${text.slice(0, head)}…${text.slice(-tail)}` : text;
}

function statusClass(status) {
  if (status === 'Ready') return 'status-ready';
  if (status === 'Review Required') return 'status-review';
  if (status === 'High Risk') return 'status-risk';
  return 'status-blocked';
}

function scoreColor(report) {
  if (!report) return '#6effc2';
  if (report.status === 'Ready') return '#6effc2';
  if (report.status === 'Review Required') return '#ffc766';
  if (report.status === 'High Risk') return '#ff9b63';
  return '#ff6f79';
}

function fileSize(content) {
  const bytes = new TextEncoder().encode(content).length;
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

function setMessage(message, type = 'normal') {
  elements.scanMessage.textContent = message;
  elements.scanMessage.style.color = type === 'error' ? 'var(--red)' : type === 'success' ? 'var(--green)' : '';
}

function readHistory() {
  try {
    const value = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    return Array.isArray(value) ? value.slice(0, MAX_HISTORY) : [];
  } catch {
    return [];
  }
}

function writeHistory() {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(state.history.slice(0, MAX_HISTORY)));
  } catch (error) {
    console.warn('Local history could not be saved.', error);
  }
}

function saveCurrentToHistory() {
  if (!state.report) return;
  const label = elements.projectName.value.trim() || 'Solidity project';
  state.history = state.history.filter((item) => item.report?.reportHash !== state.report.reportHash);
  state.history.unshift({
    id: state.report.reportHash,
    label,
    savedAt: new Date().toISOString(),
    report: state.report,
  });
  state.history = state.history.slice(0, MAX_HISTORY);
  writeHistory();
}

async function readBrowserFiles(fileList) {
  const entries = await Promise.all([...fileList]
    .filter((file) => file.name.toLowerCase().endsWith('.sol'))
    .map(async (file) => ({
      path: (file.webkitRelativePath || file.name).replaceAll('\\', '/'),
      content: await file.text(),
    })));
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

function setFiles(files) {
  const unique = new Map();
  for (const file of files) unique.set(file.path, file);
  state.files = [...unique.values()].sort((a, b) => a.path.localeCompare(b.path));
  renderFileList();
  setMessage(state.files.length ? `${state.files.length} Solidity file${state.files.length === 1 ? '' : 's'} ready.` : 'Add at least one Solidity file.');
}

function renderFileList() {
  if (!state.files.length) {
    elements.fileList.innerHTML = '<div class="empty-files">No Solidity files loaded.</div>';
    return;
  }
  elements.fileList.innerHTML = state.files.map((file) => `
    <div class="file-item" title="${esc(file.path)}">
      <span>${esc(file.path)}</span>
      <small>${esc(fileSize(file.content))}</small>
    </div>
  `).join('');
}

const DEMOS = {
  vulnerable: [
    ['Payroll.sol', './examples/vulnerable-payroll/Payroll.sol'],
  ],
  hardened: [
    ['PayrollPrivateReady.sol', './examples/remediated-payroll/PayrollPrivateReady.sol'],
  ],
  multi: [
    ['contracts/Payroll.sol', './examples/multi-contract/Payroll.sol'],
    ['contracts/Settlement.sol', './examples/multi-contract/Settlement.sol'],
  ],
};

async function loadDemo(name, { scan = false } = {}) {
  const demo = DEMOS[name];
  if (!demo) return;
  setMessage(`Loading ${name} demo…`);
  const files = await Promise.all(demo.map(async ([path, url]) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not load ${url}.`);
    return { path, content: await response.text() };
  }));
  setFiles(files);
  elements.projectName.value = name === 'hardened' ? 'Arc Payroll — Hardened' : name === 'multi' ? 'Arc Multi-Contract Payroll' : 'Arc Payroll Mission';
  if (scan) runScan();
}

function renderSummary() {
  const report = state.report;
  if (!report) {
    elements.missionSummary.innerHTML = `
      <div class="empty-state">
        <div><strong>Mission awaiting scan</strong><span>Load Solidity files and run the deterministic analyzer.</span></div>
      </div>`;
    return;
  }

  elements.missionSummary.innerHTML = `
    <div class="summary-grid">
      <div class="score-orbit" style="--score:${report.score};--score-color:${scoreColor(report)}">
        <div class="score-value"><strong>${report.score}</strong><span>Readiness / 100</span></div>
      </div>
      <div class="status-block">
        <span class="status-chip ${statusClass(report.status)}">${esc(report.status)}</span>
        <h2>${esc(elements.projectName.value || 'Solidity mission')}</h2>
        <p>${report.status === 'Ready'
          ? 'No deterministic privacy rule matched. Keep manual review and deployment controls in place.'
          : `${report.treatmentPlan.filter((task) => task.requiredBeforeDeploy).length} required treatment action${report.treatmentPlan.filter((task) => task.requiredBeforeDeploy).length === 1 ? '' : 's'} detected before deployment.`}</p>
      </div>
      <div class="metric-grid">
        <div class="metric-card"><span>Critical</span><strong>${report.summary.critical}</strong></div>
        <div class="metric-card"><span>High</span><strong>${report.summary.high}</strong></div>
        <div class="metric-card"><span>Contracts</span><strong>${report.contracts.length}</strong></div>
        <div class="metric-card"><span>Exposure chains</span><strong>${report.exposureChains.length}</strong></div>
      </div>
    </div>
    <div class="hash-line">
      <div><span>Canonical source hash</span><code title="${report.sourceHash}">${esc(report.sourceHash)}</code></div>
      <div><span>Canonical report hash</span><code title="${report.reportHash}">${esc(report.reportHash)}</code></div>
    </div>`;
}

function workspaceHeader(eyebrow, title, description, actions = '') {
  return `
    <div class="workspace-header">
      <div><span class="eyebrow">${esc(eyebrow)}</span><h3>${esc(title)}</h3><p>${esc(description)}</p></div>
      <div class="workspace-actions">${actions}</div>
    </div>`;
}

function emptyWorkspace(title = 'Run a scan first', text = 'Mission Control will populate after deterministic analysis completes.') {
  return `${workspaceHeader('Mission Control', title, text)}<div class="empty-state"><div><strong>${esc(title)}</strong><span>${esc(text)}</span></div></div>`;
}

function renderTriage() {
  const report = state.report;
  if (!report) return emptyWorkspace();
  const contractCards = report.contracts.map((contract) => `
    <article class="contract-card">
      <div class="contract-top">
        <div><h4>${esc(contract.name)}</h4><small title="${esc(contract.file)}">${esc(contract.file)}</small></div>
        <div class="contract-score ${statusClass(contract.status)}">${contract.score}</div>
      </div>
      <div class="contract-stats">
        <div><span>Status</span><strong class="${statusClass(contract.status)}">${esc(contract.status)}</strong></div>
        <div><span>Critical / High</span><strong>${contract.summary.critical} / ${contract.summary.high}</strong></div>
        <div><span>Selectors</span><strong>${contract.selectorCount}</strong></div>
      </div>
    </article>`).join('');

  const query = state.filters.query.toLowerCase();
  const findings = report.findings.filter((finding) => {
    if (state.filters.severity !== 'all' && finding.severity !== state.filters.severity) return false;
    if (state.filters.policy !== 'all' && finding.suggestedPolicy !== state.filters.policy) return false;
    if (query && ![finding.ruleId, finding.title, finding.contractName, finding.file, finding.evidence].join(' ').toLowerCase().includes(query)) return false;
    return true;
  });

  const findingCards = findings.length ? findings.map((finding) => `
    <details class="finding-card">
      <summary>
        <span class="severity-badge severity-${finding.severity}">${finding.severity}</span>
        <span class="finding-title"><strong>${esc(finding.ruleId)} · ${esc(finding.title)}</strong><small>${esc(finding.contractName)} · ${esc(finding.file)}:${finding.startLine}</small></span>
        <span class="finding-policy">${esc(finding.suggestedPolicy)}</span>
      </summary>
      <div class="finding-body">
        <div class="finding-columns">
          <div class="detail-block"><h5>Impact</h5><p>${esc(finding.impact)}</p></div>
          <div class="detail-block"><h5>Treatment</h5><p>${esc(finding.remediation)}</p></div>
        </div>
        <pre class="code-block">${esc(finding.evidence)}</pre>
        ${finding.saferPattern ? `<div class="detail-block" style="margin-top:12px"><h5>Safer pattern</h5><pre class="code-block">${esc(finding.saferPattern)}</pre></div>` : ''}
      </div>
    </details>`).join('') : '<div class="empty-state"><div><strong>No matching findings</strong><span>Adjust the filters or review the Ready result.</span></div></div>';

  return workspaceHeader('Project triage', 'Contract readiness dashboard', 'Contract-level deployment states and deterministic findings.', `<span class="status-chip ${statusClass(report.status)}">${esc(report.status)}</span>`) +
    `<div class="contract-grid">${contractCards || '<div class="contract-card"><h4>No implementation contract parsed</h4></div>'}</div>` +
    `<div class="filter-row">
      <input id="finding-query" class="text-input" placeholder="Search rule, contract, file or evidence" value="${esc(state.filters.query)}" />
      <select id="severity-filter" class="select-input"><option value="all">All severities</option>${['critical','high','medium','low'].map((item) => `<option value="${item}" ${state.filters.severity === item ? 'selected' : ''}>${item}</option>`).join('')}</select>
      <select id="policy-filter" class="select-input"><option value="all">All policies</option>${['Open','Restricted','Locked'].map((item) => `<option value="${item}" ${state.filters.policy === item ? 'selected' : ''}>${item}</option>`).join('')}</select>
    </div><div class="finding-list">${findingCards}</div>`;
}

function renderChains() {
  const report = state.report;
  if (!report) return emptyWorkspace();
  const chains = report.exposureChains.map((chain) => `
    <article class="chain-card">
      <div class="chain-heading">
        <strong>${esc(chain.ruleId)} · ${esc(chain.contractName)}</strong>
        <small>${esc(chain.file)}:${chain.startLine}</small>
      </div>
      <div class="chain-nodes">
        ${chain.nodes.map((node) => `<div class="chain-node ${node.detected ? '' : 'muted'}" title="${esc(node.detail)}"><span>${esc(node.type)}</span><strong>${esc(node.label)}</strong><small>${esc(node.detail)}</small></div>`).join('')}
      </div>
    </article>`).join('');
  return workspaceHeader('Deterministic exposure chains', 'Storage → Function → Event → Selector → Policy', 'Every chain is generated from parsed source evidence and policy rules—never from a model.') +
    `<div class="chain-list">${chains || '<div class="empty-state"><div><strong>No exposure chain detected</strong><span>The current source has no deterministic finding chain.</span></div></div>'}</div>`;
}

function renderTreatment() {
  const report = state.report;
  if (!report) return emptyWorkspace();
  const tasks = report.treatmentPlan.map((task) => `
    <article class="task-card">
      <div class="task-priority priority-${task.priority}">${task.priority}</div>
      <div class="task-main"><strong>${esc(task.ruleId)} · ${esc(task.title)}</strong><p>${esc(task.action)}</p><small>${esc(task.contractName)} · ${esc(task.file)}:${task.startLine}</small></div>
      <div class="task-meta"><span>${task.requiredBeforeDeploy ? 'Required before deploy' : 'Engineering follow-up'}</span><span>Policy: ${esc(task.suggestedPolicy)}</span><span>Status: ${esc(task.status)}</span></div>
    </article>`).join('');
  const counts = ['P0','P1','P2','P3'].map((priority) => `${priority}: ${report.treatmentPlan.filter((task) => task.priority === priority).length}`).join(' · ');
  return workspaceHeader('Treatment Plan 2.0', 'Prioritized remediation queue', `${counts}. P0 and P1 items are marked as required before deployment.`) +
    `<div class="task-list">${tasks || '<div class="empty-state"><div><strong>No treatment task</strong><span>The deterministic rule set did not create a remediation item.</span></div></div>'}</div>`;
}

function miniFindings(findings) {
  if (!findings.length) return '<div class="mini-finding"><small>None</small></div>';
  return findings.slice(0, 20).map((finding) => `<div class="mini-finding"><strong>${esc(finding.ruleId)} · ${esc(finding.title)}</strong><small>${esc(finding.contractName)} · ${esc(finding.file)}:${finding.startLine}</small></div>`).join('');
}

function renderCompare() {
  if (!state.report) return emptyWorkspace();
  const actions = `
    <button class="action-button" data-action="set-baseline">Set current as baseline</button>
    <button class="action-button primary" data-action="compare-hardened">Compare with hardened demo</button>
    <button class="action-button" data-action="import-baseline">Import report JSON</button>`;
  if (!state.baseline) {
    return workspaceHeader('Scan comparison', 'Choose a baseline', 'Save the current scan, import an older report, or compare the vulnerable demo with the hardened implementation.', actions) +
      '<div class="empty-state"><div><strong>No baseline selected</strong><span>Comparison will show resolved, ongoing, and introduced findings.</span></div></div>';
  }
  const comparison = compareReports(state.baseline, state.report);
  return workspaceHeader('Scan comparison', 'Resolved, ongoing, and introduced findings', `Baseline ${shortHash(state.baseline.reportHash)} → current ${shortHash(state.report.reportHash)}`, actions) + `
    <div class="compare-metrics">
      <div class="compare-card"><span>Score delta</span><strong class="${comparison.scoreDelta >= 0 ? 'status-ready' : 'status-blocked'}">${comparison.scoreDelta >= 0 ? '+' : ''}${comparison.scoreDelta}</strong></div>
      <div class="compare-card"><span>Resolved</span><strong class="status-ready">${comparison.summary.resolved}</strong></div>
      <div class="compare-card"><span>Ongoing</span><strong class="status-review">${comparison.summary.ongoing}</strong></div>
      <div class="compare-card"><span>Introduced</span><strong class="status-blocked">${comparison.summary.introduced}</strong></div>
    </div>
    <div class="compare-columns">
      <section class="compare-column"><h4 class="status-ready">Resolved</h4>${miniFindings(comparison.resolved)}</section>
      <section class="compare-column"><h4 class="status-review">Ongoing</h4>${miniFindings(comparison.ongoing)}</section>
      <section class="compare-column"><h4 class="status-blocked">Introduced</h4>${miniFindings(comparison.introduced)}</section>
    </div>`;
}

function renderProof() {
  const report = state.report;
  if (!report) return emptyWorkspace();
  const payload = buildProofPayload(report, '');
  return workspaceHeader('Proof Center 2.0', 'Anchor hashes on Arc Testnet', 'Only source hash, report hash, score, URI, version, submitter, and timestamp are written onchain.') + `
    <div class="proof-layout">
      <section class="proof-card">
        <h4>Arc proof transaction</h4>
        <p>Review the registry and optional report URI. Your wallet will show the final transaction before anything is sent.</p>
        <label class="field-label" for="registry-address">Registry address</label>
        <input id="registry-address" class="text-input" value="${esc(REGISTRY_ADDRESS)}" />
        <label class="field-label" for="report-uri" style="margin-top:12px">Optional report URI</label>
        <input id="report-uri" class="text-input" placeholder="ipfs://… or https://…" />
        <div class="proof-actions">
          <button class="action-button" data-action="connect-wallet">${state.walletAccount ? `Connected ${esc(shortHash(state.walletAccount, 8, 6))}` : 'Connect wallet'}</button>
          <button class="action-button primary" data-action="publish-proof">Publish proof</button>
        </div>
        <div id="proof-result" class="proof-result">No transaction submitted.</div>
      </section>
      <section class="proof-card">
        <h4>Canonical payload</h4>
        <div class="info-list">
          <div class="info-row"><span>Network</span><code>${esc(ARC_TESTNET.chainName)} · ${ARC_TESTNET.chainId}</code></div>
          <div class="info-row"><span>Project ID</span><code title="${payload.projectId}">${esc(shortHash(payload.projectId))}</code></div>
          <div class="info-row"><span>Source hash</span><code title="${payload.sourceHash}">${esc(shortHash(payload.sourceHash))}</code></div>
          <div class="info-row"><span>Report hash</span><code title="${payload.reportHash}">${esc(shortHash(payload.reportHash))}</code></div>
          <div class="info-row"><span>Score</span><code>${payload.score}/100</code></div>
          <div class="info-row"><span>Scanner</span><code>${esc(payload.scannerVersion)}</code></div>
        </div>
        <button class="action-button" data-action="copy-payload">Copy payload JSON</button>
      </section>
    </div>`;
}

function renderExports() {
  if (!state.report) return emptyWorkspace();
  const cards = [
    ['Canonical JSON', 'Full deterministic report with triage, findings, chains, treatment, policies, and hashes.', 'export-json', 'Download JSON'],
    ['Markdown report', 'Reviewer-friendly executive summary and remediation evidence.', 'export-markdown', 'Download Markdown'],
    ['Arc Policy Manifest', 'Selector-level Open, Restricted, and Locked recommendations.', 'export-policy', 'Download manifest'],
    ['Remediation Pack ZIP', 'Report, policy manifest, treatment plan, proof payload, and local source bundle.', 'export-zip', 'Download ZIP'],
  ];
  return workspaceHeader('Deterministic exports', 'Portable privacy engineering outputs', 'Every export is generated locally from the same canonical report.') +
    `<div class="export-grid">${cards.map(([title, text, action, button]) => `<article class="export-card"><h4>${title}</h4><p>${text}</p><button class="action-button primary" data-action="${action}">${button}</button></article>`).join('')}</div>`;
}

function renderHistory() {
  const actions = state.history.length ? '<button class="action-button" data-action="clear-history">Clear local history</button>' : '';
  const items = state.history.map((item, index) => `
    <article class="history-card">
      <div><strong>${esc(item.label)} · ${item.report.score}/100 · ${esc(item.report.status)}</strong><small>${new Date(item.savedAt).toLocaleString()} · ${esc(shortHash(item.report.reportHash))}</small></div>
      <div class="history-actions"><button class="action-button" data-action="history-baseline" data-index="${index}">Use baseline</button><button class="action-button" data-action="history-open" data-index="${index}">Open</button></div>
    </article>`).join('');
  return workspaceHeader('Local scan history', 'Private browser history', 'History remains in localStorage on this device. Clear it at any time.', actions) +
    `<div class="history-list">${items || '<div class="empty-state"><div><strong>No saved scan</strong><span>Completed scans will appear here without uploading source code.</span></div></div>'}</div>`;
}

function renderWorkspace() {
  const views = {
    triage: renderTriage,
    chains: renderChains,
    treatment: renderTreatment,
    compare: renderCompare,
    proof: renderProof,
    exports: renderExports,
    history: renderHistory,
  };
  elements.workspace.innerHTML = (views[state.activeView] ?? renderTriage)();
}

function renderAll() {
  renderSummary();
  renderWorkspace();
  document.querySelectorAll('.nav-button').forEach((button) => button.classList.toggle('active', button.dataset.view === state.activeView));
  if (state.report) {
    document.body.dataset.reportHash = state.report.reportHash;
    document.body.dataset.projectStatus = state.report.status;
  }
}

function runScan() {
  if (!state.files.length) {
    setMessage('Add at least one Solidity file before scanning.', 'error');
    return;
  }
  elements.scanButton.disabled = true;
  elements.scanButton.classList.add('scanning');
  setMessage('Running local deterministic analysis…');
  try {
    state.report = scanProject(state.files);
    saveCurrentToHistory();
    renderAll();
    setMessage(`${state.report.status}: ${state.report.summary.total} finding${state.report.summary.total === 1 ? '' : 's'}, report ${shortHash(state.report.reportHash)}.`, 'success');
  } catch (error) {
    console.error(error);
    setMessage(error instanceof Error ? error.message : String(error), 'error');
  } finally {
    elements.scanButton.disabled = false;
    elements.scanButton.classList.remove('scanning');
  }
}

function download(name, data, mime = 'application/octet-stream') {
  const blob = data instanceof Blob
    ? data
    : new Blob([data instanceof Uint8Array ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) : data], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

function exportName(extension) {
  return `${slugify(elements.projectName.value)}-veilforge-v1.8.${extension}`;
}

function exportJson() {
  download(exportName('json'), JSON.stringify(state.report, null, 2), 'application/json');
}

function exportMarkdown() {
  download(exportName('md'), formatMarkdownReport(state.report, elements.projectName.value), 'text/markdown');
}

function exportPolicy() {
  download(`${slugify(elements.projectName.value)}-arc-policy-manifest.json`, JSON.stringify(generatePolicyManifest(state.report), null, 2), 'application/json');
}

function exportZip() {
  const project = slugify(elements.projectName.value);
  const policy = generatePolicyManifest(state.report);
  const proof = buildProofPayload(state.report, '');
  const entries = [
    { name: 'report/veilforge-report.json', data: JSON.stringify(state.report, null, 2) },
    { name: 'report/veilforge-report.md', data: formatMarkdownReport(state.report, elements.projectName.value) },
    { name: 'policy/arc-policy-manifest.json', data: JSON.stringify(policy, null, 2) },
    { name: 'treatment/treatment-plan.json', data: JSON.stringify(state.report.treatmentPlan, null, 2) },
    { name: 'proof/arc-proof-payload.json', data: JSON.stringify(proof, null, 2) },
    { name: 'README.txt', data: 'Generated locally by VeilForge v1.8 Privacy Mission Control. Source code was not sent to an AI model or remote analyzer.\n' },
    ...state.files.map((file) => ({ name: `source/${file.path}`, data: file.content })),
  ];
  download(`${project}-remediation-pack.zip`, createZip(entries), 'application/zip');
}

async function importBaseline() {
  const picker = document.createElement('input');
  picker.type = 'file';
  picker.accept = '.json,application/json';
  picker.addEventListener('change', async () => {
    try {
      const file = picker.files?.[0];
      if (!file) return;
      const report = JSON.parse(await file.text());
      if (!report.reportHash || !Array.isArray(report.findings)) throw new Error('This is not a VeilForge report JSON.');
      state.baseline = report;
      renderWorkspace();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error), 'error');
    }
  });
  picker.click();
}

async function handleWorkspaceAction(button) {
  const action = button.dataset.action;
  if (action === 'set-baseline') {
    state.baseline = structuredClone(state.report);
    renderWorkspace();
  } else if (action === 'compare-hardened') {
    state.baseline = structuredClone(state.report);
    await loadDemo('hardened');
    runScan();
    state.activeView = 'compare';
    renderAll();
  } else if (action === 'import-baseline') {
    importBaseline();
  } else if (action === 'connect-wallet') {
    const result = document.querySelector('#proof-result');
    try {
      state.walletAccount = await connectWallet();
      if (result) result.textContent = `Wallet connected: ${state.walletAccount}`;
      renderWorkspace();
    } catch (error) {
      if (result) result.textContent = error instanceof Error ? error.message : String(error);
    }
  } else if (action === 'publish-proof') {
    const result = document.querySelector('#proof-result');
    try {
      if (result) result.textContent = 'Waiting for wallet confirmation…';
      const response = await publishReport({
        registryAddress: document.querySelector('#registry-address')?.value,
        account: state.walletAccount,
        report: state.report,
        reportURI: document.querySelector('#report-uri')?.value.trim() || '',
      });
      state.walletAccount = response.account;
      if (result) result.innerHTML = `Submitted: <a href="${esc(response.explorerUrl)}" target="_blank" rel="noreferrer">${esc(response.transactionHash)}</a>`;
    } catch (error) {
      if (result) result.textContent = error instanceof Error ? error.message : String(error);
    }
  } else if (action === 'copy-payload') {
    await navigator.clipboard.writeText(JSON.stringify(buildProofPayload(state.report, document.querySelector('#report-uri')?.value || ''), null, 2));
    setMessage('Proof payload copied.', 'success');
  } else if (action === 'export-json') exportJson();
  else if (action === 'export-markdown') exportMarkdown();
  else if (action === 'export-policy') exportPolicy();
  else if (action === 'export-zip') exportZip();
  else if (action === 'clear-history') {
    state.history = [];
    writeHistory();
    renderWorkspace();
  } else if (action === 'history-baseline') {
    state.baseline = structuredClone(state.history[Number(button.dataset.index)].report);
    state.activeView = 'compare';
    renderAll();
  } else if (action === 'history-open') {
    state.report = structuredClone(state.history[Number(button.dataset.index)].report);
    renderAll();
  }
}

function bindEvents() {
  document.querySelectorAll('[data-demo]').forEach((button) => button.addEventListener('click', () => loadDemo(button.dataset.demo, { scan: true }).catch((error) => setMessage(error.message, 'error'))));
  elements.fileInput.addEventListener('change', async () => setFiles(await readBrowserFiles(elements.fileInput.files)));
  elements.folderInput.addEventListener('change', async () => setFiles(await readBrowserFiles(elements.folderInput.files)));
  elements.clearFiles.addEventListener('click', () => setFiles([]));
  elements.scanButton.addEventListener('click', runScan);

  ['dragenter', 'dragover'].forEach((name) => elements.dropZone.addEventListener(name, (event) => {
    event.preventDefault();
    elements.dropZone.classList.add('dragging');
  }));
  ['dragleave', 'drop'].forEach((name) => elements.dropZone.addEventListener(name, (event) => {
    event.preventDefault();
    elements.dropZone.classList.remove('dragging');
  }));
  elements.dropZone.addEventListener('drop', async (event) => setFiles(await readBrowserFiles(event.dataTransfer.files)));
  elements.dropZone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') elements.fileInput.click();
  });

  document.querySelectorAll('.nav-button').forEach((button) => button.addEventListener('click', () => {
    state.activeView = button.dataset.view;
    renderAll();
  }));

  elements.workspace.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (button) handleWorkspaceAction(button).catch((error) => setMessage(error.message, 'error'));
  });
  elements.workspace.addEventListener('input', (event) => {
    if (event.target.id === 'finding-query') {
      state.filters.query = event.target.value;
      renderWorkspace();
      document.querySelector('#finding-query')?.focus();
    }
  });
  elements.workspace.addEventListener('change', (event) => {
    if (event.target.id === 'severity-filter') state.filters.severity = event.target.value;
    if (event.target.id === 'policy-filter') state.filters.policy = event.target.value;
    if (event.target.id === 'severity-filter' || event.target.id === 'policy-filter') renderWorkspace();
  });
}

async function init() {
  window.addEventListener('error', (event) => {
    document.body.dataset.runtimeError = event.message || 'unknown';
  });
  window.addEventListener('unhandledrejection', (event) => {
    document.body.dataset.runtimeError = event.reason?.message || String(event.reason || 'unhandled rejection');
  });
  bindEvents();
  renderFileList();
  renderAll();
  try {
    await loadDemo('vulnerable');
    runScan();
  } catch (error) {
    console.error(error);
    setMessage(error instanceof Error ? error.message : String(error), 'error');
  }
  document.body.dataset.ready = 'true';
  window.__VEILFORGE_READY__ = true;
}

init();
