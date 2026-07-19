import { formatMarkdownReport, scanSources, type Finding, type SourceFile } from '@veilforge/scanner';
import { ARC_TESTNET } from '@veilforge/shared';
import {
  ArrowRight,
  Braces,
  Check,
  ChevronDown,
  CircleDotDashed,
  Code2,
  Download,
  Github,
  LockKeyhole,
  Network,
  ScanSearch,
  ShieldCheck,
  UploadCloud,
  Zap,
} from 'lucide-react';
import { type ChangeEvent, type DragEvent, useMemo, useRef, useState } from 'react';
import { Brand } from './components/Brand';
import { CodeViewer } from './components/CodeViewer';
import { Findings } from './components/Findings';
import { PolicyGraph } from './components/PolicyGraph';
import { ProofPanel } from './components/ProofPanel';
import { RemediationLab } from './components/RemediationLab';
import { ScoreRing } from './components/ScoreRing';
import { demoFiles, remediatedFiles } from './lib/demo';

type WorkspaceTab = 'analysis' | 'remediation' | 'policies' | 'proof';

type DemoMode = 'vulnerable' | 'remediated' | 'custom';

function downloadArtifact(content: string, type: string, fileName: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function downloadJsonReport(report: ReturnType<typeof scanSources>): void {
  downloadArtifact(
    JSON.stringify(report, null, 2),
    'application/json',
    `veilforge-report-${report.reportHash.slice(2, 10)}.json`,
  );
}

function downloadMarkdownReport(report: ReturnType<typeof scanSources>, projectName: string): void {
  downloadArtifact(
    formatMarkdownReport(report, projectName || 'VeilForge scan'),
    'text/markdown',
    `veilforge-report-${report.reportHash.slice(2, 10)}.md`,
  );
}

function fileLabel(path: string): string {
  return path.split('/').at(-1) ?? path;
}

export function App(): React.JSX.Element {
  const [sources, setSources] = useState<SourceFile[]>(demoFiles);
  const [mode, setMode] = useState<DemoMode>('vulnerable');
  const [tab, setTab] = useState<WorkspaceTab>('analysis');
  const [activeFile, setActiveFile] = useState(demoFiles[0]?.path ?? '');
  const [activeLine, setActiveLine] = useState<number | null>(10);
  const [selectedFinding, setSelectedFinding] = useState<string | null>(
    () => scanSources(demoFiles).findings[0]?.fingerprint ?? null,
  );
  const [dragging, setDragging] = useState(false);
  const [projectName, setProjectName] = useState('veilforge-payroll-demo');
  const inputRef = useRef<HTMLInputElement | null>(null);

  const report = useMemo(() => scanSources(sources), [sources]);
  const vulnerableReport = useMemo(() => scanSources(demoFiles), []);
  const remediatedReport = useMemo(() => scanSources(remediatedFiles), []);
  const activeSource = sources.find((file) => file.path === activeFile) ?? sources[0];
  const activeFindings = report.findings.filter((finding) => finding.file === activeSource?.path);
  const selectedFindingItem =
    report.findings.find((finding) => finding.fingerprint === selectedFinding) ?? report.findings[0] ?? null;

  function useDemo(nextMode: Exclude<DemoMode, 'custom'>): void {
    const nextFiles = nextMode === 'vulnerable' ? demoFiles : remediatedFiles;
    setSources(nextFiles);
    setMode(nextMode);
    setActiveFile(nextFiles[0]?.path ?? '');
    setActiveLine(nextMode === 'vulnerable' ? 10 : 23);
    setSelectedFinding(scanSources(nextFiles).findings[0]?.fingerprint ?? null);
    setProjectName(nextMode === 'vulnerable' ? 'veilforge-payroll-demo' : 'veilforge-payroll-hardened');
  }

  async function acceptFiles(list: FileList | File[]): Promise<void> {
    const solidityFiles = [...list].filter((file) => file.name.toLowerCase().endsWith('.sol'));
    if (solidityFiles.length === 0) return;
    const loaded = await Promise.all(
      solidityFiles.map(async (file): Promise<SourceFile> => ({ path: file.name, content: await file.text() })),
    );
    setSources(loaded.sort((a, b) => a.path.localeCompare(b.path)));
    setMode('custom');
    setActiveFile(loaded[0]?.path ?? '');
    setActiveLine(null);
    setSelectedFinding(scanSources(loaded).findings[0]?.fingerprint ?? null);
    setProjectName(fileLabel(loaded[0]?.path ?? 'solidity-project').replace(/\.sol$/i, '').toLowerCase());
  }

  function selectFinding(finding: Finding): void {
    setActiveFile(finding.file);
    setActiveLine(finding.startLine);
    setSelectedFinding(finding.fingerprint);
  }

  const scoreDelta = remediatedReport.score - vulnerableReport.score;

  return (
    <div className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <nav className="topbar">
        <Brand />
        <div className="top-links">
          <a href="#workspace">Scanner</a>
          <a href="#architecture">Architecture</a>
          <a href="https://docs.arc.network/arc/concepts/opt-in-privacy" target="_blank" rel="noreferrer">APS docs</a>
        </div>
        <a className="ghost-button" href="https://github.com/CryptoDombili/veilforge" target="_blank" rel="noreferrer">
          <Github size={16} /> Open source
        </a>
      </nav>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="announcement"><span /> VeilForge v1.1 · Built for Arc Privacy Sector before it goes live <ArrowRight size={14} /></div>
            <h1>Find what your Solidity contract will <em>leak</em> before privacy becomes production.</h1>
            <p>
              VeilForge turns source code into deterministic privacy findings, prioritized remediation playbooks, APS-aligned exposure policies and a verifiable Arc Testnet report proof.
            </p>
            <div className="hero-actions">
              <button type="button" className="primary-button" onClick={() => document.getElementById('workspace')?.scrollIntoView({ behavior: 'smooth' })}>
                <ScanSearch size={18} /> Scan the payroll demo
              </button>
              <button type="button" className="secondary-button" onClick={() => inputRef.current?.click()}>
                <UploadCloud size={18} /> Upload .sol files
              </button>
            </div>
            <div className="hero-trust">
              <span><Check size={14} /> No AI API</span>
              <span><Check size={14} /> Runs locally</span>
              <span><Check size={14} /> Canonical hashes</span>
              <span><Check size={14} /> Arc-native proof</span>
            </div>
          </div>

          <div className="hero-visual" aria-label="VeilForge analysis preview">
            <div className="visual-grid" />
            <div className="orb orb-outer"><span className="orb orb-middle"><span className="orb orb-inner"><LockKeyhole size={38} /></span></span></div>
            <div className="signal-card signal-one"><ShieldCheck size={16} /><span><b>VF008</b> public mapping</span><em>critical</em></div>
            <div className="signal-card signal-two"><Network size={16} /><span><b>Policy</b> getSalary()</span><em>restricted</em></div>
            <div className="signal-card signal-three"><Zap size={16} /><span><b>Arc proof</b> deterministic</span><em>ready</em></div>
            <div className="scan-line" />
          </div>
        </section>

        <section className="feature-strip" id="architecture">
          <article><span><Code2 /></span><div><strong>AST analysis</strong><p>Explainable rules, exact source lines and deterministic output.</p></div></article>
          <article><span><Zap /></span><div><strong>Remediation intelligence</strong><p>Impact, fix guidance and safer Solidity patterns for every finding.</p></div></article>
          <article><span><CircleDotDashed /></span><div><strong>Proof, not source</strong><p>Anchor hashes and score on Arc without publishing confidential code.</p></div></article>
        </section>

        <section className="workspace" id="workspace">
          <div className="workspace-topline">
            <div>
              <span className="eyebrow">LIVE LOCAL WORKSPACE</span>
              <h2>Privacy readiness, from source to proof.</h2>
            </div>
            <div className="demo-switcher">
              <button type="button" className={mode === 'vulnerable' ? 'active' : ''} onClick={() => useDemo('vulnerable')}>Vulnerable</button>
              <button type="button" className={mode === 'remediated' ? 'active safe' : ''} onClick={() => useDemo('remediated')}>Hardened</button>
              {mode === 'custom' && <button type="button" className="active">Custom</button>}
            </div>
          </div>

          <div className="workspace-toolbar">
            <div className="workspace-tabs" role="tablist">
              <button type="button" role="tab" aria-selected={tab === 'analysis'} className={tab === 'analysis' ? 'active' : ''} onClick={() => setTab('analysis')}><ScanSearch size={16} /> Analysis</button>
              <button type="button" role="tab" aria-selected={tab === 'remediation'} className={tab === 'remediation' ? 'active' : ''} onClick={() => setTab('remediation')}><ShieldCheck size={16} /> Remediation</button>
              <button type="button" role="tab" aria-selected={tab === 'policies'} className={tab === 'policies' ? 'active' : ''} onClick={() => setTab('policies')}><Network size={16} /> Exposure map</button>
              <button type="button" role="tab" aria-selected={tab === 'proof'} className={tab === 'proof' ? 'active' : ''} onClick={() => setTab('proof')}><FingerprintIcon /> Arc proof</button>
            </div>
            <div className="toolbar-actions">
              <div className="file-picker">
                <select value={activeFile} onChange={(event: ChangeEvent<HTMLSelectElement>) => { setActiveFile(event.target.value); setActiveLine(null); }}>
                  {sources.map((file) => <option value={file.path} key={file.path}>{fileLabel(file.path)}</option>)}
                </select>
                <ChevronDown size={14} />
              </div>
              <button type="button" className="icon-button export-button" onClick={() => downloadJsonReport(report)} title="Export deterministic JSON"><Braces size={17} /></button>
              <button type="button" className="icon-button export-button" onClick={() => downloadMarkdownReport(report, projectName)} title="Export remediation report"><Download size={17} /></button>
              <button type="button" className="secondary-button compact" onClick={() => inputRef.current?.click()}><UploadCloud size={16} /> Upload</button>
              <input ref={inputRef} type="file" accept=".sol" multiple hidden onChange={(event: ChangeEvent<HTMLInputElement>) => event.target.files && void acceptFiles(event.target.files)} />
            </div>
          </div>

          <div
            className={`drop-overlay ${dragging ? 'visible' : ''}`}
            onDragEnter={(event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setDragging(true); }}
            onDragOver={(event: DragEvent<HTMLDivElement>) => event.preventDefault()}
            onDragLeave={(event: DragEvent<HTMLDivElement>) => { if (event.currentTarget === event.target) setDragging(false); }}
            onDrop={(event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setDragging(false); void acceptFiles(event.dataTransfer.files); }}
          >
            {dragging && <div><UploadCloud size={32} /><strong>Drop Solidity files to scan locally</strong><span>No source leaves your browser.</span></div>}

            {tab === 'analysis' && activeSource && (
              <>
                <div className="analysis-metrics">
                  <ScoreRing score={report.score} grade={report.grade} />
                  <div className="metric"><span>Critical</span><strong>{report.summary.critical}</strong><small>Immediate review</small></div>
                  <div className="metric"><span>High</span><strong>{report.summary.high}</strong><small>Likely disclosure</small></div>
                  <div className="metric">
  <span>Sensitive selectors</span>
  <strong>{report.exposure.sensitiveSelectors}</strong>
  <small>
    {report.exposure.restrictedSelectors} restricted selectors ·{" "}
    {report.exposure.lockedSelectors} locked selectors
  </small>
</div>
                  <div className="improvement-card">
                    <span>HARDENING DEMO</span>
                    <strong>+{scoreDelta} points</strong>
                    <p>Vulnerable {vulnerableReport.score} → Hardened {remediatedReport.score}</p>
                  </div>
                </div>
                <div className="analysis-grid">
                  <CodeViewer
                    fileName={activeSource.path}
                    source={activeSource.content}
                    findings={activeFindings}
                    activeLine={activeLine}
                    onLineSelect={setActiveLine}
                  />
                  <Findings findings={report.findings} activeFingerprint={selectedFinding} onSelect={selectFinding} />
                </div>
              </>
            )}

            {tab === 'remediation' && (
              <RemediationLab report={report} selectedFinding={selectedFindingItem} onSelect={selectFinding} />
            )}
            {tab === 'policies' && <PolicyGraph policies={report.policies} />}
            {tab === 'proof' && <ProofPanel report={report} projectName={projectName} onProjectNameChange={setProjectName} />}
          </div>

          <p className="workspace-disclaimer">{report.disclaimer}</p>
        </section>

        <section className="closing">
          <div>
            <span className="eyebrow">FORWARD-LOOKING DEVELOPER TOOLING</span>
            <h2>Prepare today for private Solidity tomorrow.</h2>
            <p>APS is not live yet. That is the point: VeilForge gives Arc builders a migration runway with deterministic findings, remediation playbooks and verifiable report proofs before confidential execution reaches production.</p>
          </div>
          <button type="button" className="primary-button" onClick={() => document.getElementById('workspace')?.scrollIntoView({ behavior: 'smooth' })}>
            Run the demo <ArrowRight size={18} />
          </button>
        </section>
      </main>

      <footer>
        <Brand />
        <p>Independent community project. Not affiliated with or endorsed by Circle.</p>
        <span>{ARC_TESTNET.name} · Chain {ARC_TESTNET.id}</span>
      </footer>
    </div>
  );
}

function FingerprintIcon(): React.JSX.Element {
  return <Braces size={16} />;
}
