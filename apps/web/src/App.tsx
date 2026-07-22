import {
  scanSources,
  type Finding,
  type ScanReport,
  type SourceFile,
} from '@veilforge/scanner';
import { ARC_TESTNET } from '@veilforge/shared';
import {
  ArrowRight,
  BookOpen,
  Braces,
  Check,
  ChevronDown,
  CircleDotDashed,
  Code2,
  Download,
  FileArchive,
  Github,
  GitCompareArrows,
  LayoutDashboard,
  LockKeyhole,
  Network,
  Radar,
  ScanSearch,
  ShieldCheck,
  UploadCloud,
  Zap,
} from 'lucide-react';
import { type ChangeEvent, type DragEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Brand } from './components/Brand';
import { CodeViewer } from './components/CodeViewer';
import { ExposureChains } from './components/ExposureChains';
import { Findings } from './components/Findings';
import { MissionOverview } from './components/MissionOverview';
import { PolicyGraph } from './components/PolicyGraph';
import { ProofPanel } from './components/ProofPanel';
import { ProgressPanel, type ScanHistoryEntry } from './components/ProgressPanel';
import { RemediationLab } from './components/RemediationLab';
import { ScoreRing } from './components/ScoreRing';
import {
  downloadJsonReport,
  downloadMarkdownReport,
  downloadPolicyManifest,
  downloadRemediationPack,
} from './lib/artifacts';
import { demoFiles, remediatedFiles } from './lib/demo';

type WorkspaceTab = 'overview' | 'analysis' | 'exposure' | 'treatment' | 'progress' | 'policies' | 'proof';
type DemoMode = 'vulnerable' | 'remediated' | 'custom';

const HISTORY_KEY = 'veilforge-v1.8-scan-history';

function fileLabel(path: string): string {
  return path.split('/').at(-1) ?? path;
}

function loadHistory(): ScanHistoryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(HISTORY_KEY) ?? '[]') as unknown;
    return Array.isArray(parsed) ? (parsed as ScanHistoryEntry[]) : [];
  } catch {
    return [];
  }
}

function projectNameFromFiles(files: SourceFile[]): string {
  const first = files[0]?.path ?? 'solidity-project';
  const folder = first.includes('/') ? (first.split('/')[0] ?? 'solidity-project') : fileLabel(first).replace(/\.sol$/i, '');
  return folder.toLowerCase().replace(/[^a-z0-9-_]+/g, '-');
}

export function App(): React.JSX.Element {
  const initialReport = useMemo(() => scanSources(demoFiles), []);
  const vulnerableReport = initialReport;
  const remediatedReport = useMemo(() => scanSources(remediatedFiles), []);

  const [sources, setSources] = useState<SourceFile[]>(demoFiles);
  const [mode, setMode] = useState<DemoMode>('vulnerable');
  const [tab, setTab] = useState<WorkspaceTab>('overview');
  const [activeFile, setActiveFile] = useState(demoFiles[0]?.path ?? '');
  const [activeLine, setActiveLine] = useState<number | null>(10);
  const [selectedFinding, setSelectedFinding] = useState<string | null>(initialReport.findings[0]?.fingerprint ?? null);
  const [dragging, setDragging] = useState(false);
  const [projectName, setProjectName] = useState('veilforge-payroll-demo');
  const [previousCustomReport, setPreviousCustomReport] = useState<ScanReport | null>(null);
  const [history, setHistory] = useState<ScanHistoryEntry[]>(loadHistory);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const report = useMemo(() => scanSources(sources), [sources]);
  const activeSource = sources.find((file) => file.path === activeFile) ?? sources[0];
  const activeFindings = report.findings.filter((finding) => finding.file === activeSource?.path);
  const selectedFindingItem = report.findings.find((finding) => finding.fingerprint === selectedFinding) ?? report.findings[0] ?? null;
  const scoreDelta = remediatedReport.score - vulnerableReport.score;
  const comparisonBaseline = mode === 'remediated' ? vulnerableReport : mode === 'custom' ? previousCustomReport : null;
  const baselineLabel = mode === 'remediated' ? 'Vulnerable demo' : 'Previous custom scan';
  const currentLabel = mode === 'remediated' ? 'Hardened demo' : 'Current scan';

  useEffect(() => {
    const snapshot: ScanHistoryEntry = {
      reportHash: report.reportHash,
      sourceHash: report.sourceHash,
      projectName,
      score: report.score,
      grade: report.grade,
      status: report.triage.status,
      findings: report.findings.length,
      contracts: report.contracts.length,
      timestamp: new Date().toISOString(),
    };
    setHistory((current) => {
      const existing = current.find((item) => item.reportHash === snapshot.reportHash && item.projectName === snapshot.projectName);
      if (existing) return current;
      const next = [snapshot, ...current].slice(0, 12);
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      return next;
    });
  }, [projectName, report]);

  function useDemo(nextMode: Exclude<DemoMode, 'custom'>): void {
    const nextFiles = nextMode === 'vulnerable' ? demoFiles : remediatedFiles;
    const nextReport = nextMode === 'vulnerable' ? vulnerableReport : remediatedReport;
    setSources(nextFiles);
    setMode(nextMode);
    setActiveFile(nextFiles[0]?.path ?? '');
    setActiveLine(nextMode === 'vulnerable' ? 10 : 23);
    setSelectedFinding(nextReport.findings[0]?.fingerprint ?? null);
    setProjectName(nextMode === 'vulnerable' ? 'veilforge-payroll-demo' : 'veilforge-payroll-hardened');
    setPreviousCustomReport(null);
    setTab('overview');
  }

  async function acceptFiles(list: FileList | File[]): Promise<void> {
    const solidityFiles = [...list].filter((file) => file.name.toLowerCase().endsWith('.sol'));
    if (solidityFiles.length === 0) return;
    const loaded = await Promise.all(
      solidityFiles.map(async (file): Promise<SourceFile> => ({
        path: file.webkitRelativePath || file.name,
        content: await file.text(),
      })),
    );
    const sorted = loaded.sort((a, b) => a.path.localeCompare(b.path));
    setPreviousCustomReport(mode === 'custom' ? report : null);
    setSources(sorted);
    setMode('custom');
    setActiveFile(sorted[0]?.path ?? '');
    setActiveLine(null);
    const nextReport = scanSources(sorted);
    setSelectedFinding(nextReport.findings[0]?.fingerprint ?? null);
    setProjectName(projectNameFromFiles(sorted));
    setTab('overview');
  }

  function selectFinding(finding: Finding, openAnalysis = false): void {
    setActiveFile(finding.file);
    setActiveLine(finding.startLine);
    setSelectedFinding(finding.fingerprint);
    if (openAnalysis) setTab('analysis');
  }

  function openLocation(file: string, line: number): void {
    setActiveFile(file);
    setActiveLine(line);
    const finding = report.findings.find(
      (item) => item.file === file && line >= item.startLine && line <= item.endLine,
    );
    if (finding) setSelectedFinding(finding.fingerprint);
    setTab('analysis');
  }

  function clearHistory(): void {
    window.localStorage.removeItem(HISTORY_KEY);
    setHistory([]);
  }

  const tabs: Array<{ id: WorkspaceTab; label: string; icon: React.JSX.Element }> = [
    { id: 'overview', label: 'Mission overview', icon: <LayoutDashboard size={16} /> },
    { id: 'analysis', label: 'Source & findings', icon: <ScanSearch size={16} /> },
    { id: 'exposure', label: 'Exposure chains', icon: <Radar size={16} /> },
    { id: 'treatment', label: 'Treatment plan', icon: <ShieldCheck size={16} /> },
    { id: 'progress', label: 'Progress', icon: <GitCompareArrows size={16} /> },
    { id: 'policies', label: 'Policy studio', icon: <Network size={16} /> },
    { id: 'proof', label: 'Proof center', icon: <Braces size={16} /> },
  ];

  return (
    <div className="app-shell">
      <div className="star-field stars-near" />
      <div className="star-field stars-far" />
      <div className="aurora aurora-one" />
      <div className="aurora aurora-two" />

      <nav className="topbar">
        <Brand />
        <div className="top-links">
          <a href="#workspace">Mission Control</a>
          <a href="#open-source">Open source</a>
          <a href="https://docs.arc.io/arc/concepts/opt-in-privacy" target="_blank" rel="noreferrer">APS docs</a>
        </div>
        <a className="ghost-button" href="https://github.com/CryptoDombili/veilforge" target="_blank" rel="noreferrer"><Github size={16} /> GitHub</a>
      </nav>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="announcement"><span /> VeilForge v1.8 · Privacy Mission Control <ArrowRight size={14} /></div>
            <h1>Trace how privacy escapes through your <em>Solidity project.</em></h1>
            <p>Scan multi-contract projects locally, map deterministic exposure paths, execute a prioritized treatment plan, export Arc-aligned policies and anchor canonical report fingerprints on Arc Testnet.</p>
            <div className="hero-actions">
              <button type="button" className="primary-button" onClick={() => document.getElementById('workspace')?.scrollIntoView({ behavior: 'smooth' })}><Radar size={18} /> Open Mission Control</button>
              <button type="button" className="secondary-button" onClick={() => inputRef.current?.click()}><UploadCloud size={18} /> Upload .sol project</button>
            </div>
            <div className="hero-trust">
              <span><Check size={14} /> No AI API</span>
              <span><Check size={14} /> Source stays local</span>
              <span><Check size={14} /> Deterministic output</span>
              <span><Check size={14} /> Arc proof ready</span>
            </div>
          </div>

          <div className="hero-visual" aria-label="VeilForge Privacy Mission Control preview">
            <div className="visual-grid" />
            <div className="mission-orbit orbit-outer"><span className="mission-orbit orbit-middle"><span className="mission-orbit orbit-inner"><LockKeyhole size={42} /></span></span></div>
            <div className="signal-card signal-one"><ShieldCheck size={16} /><span><b>TRIAGE</b> deployment blocked</span><em>P0</em></div>
            <div className="signal-card signal-two"><Radar size={16} /><span><b>PATH 03</b> storage → selector</span><em>traced</em></div>
            <div className="signal-card signal-three"><Network size={16} /><span><b>ARC POLICY</b> restricted</span><em>ready</em></div>
            <div className="mission-readout"><small>PRIVACY READINESS</small><strong>{vulnerableReport.score}</strong><span>/100</span></div>
            <div className="scan-line" />
          </div>
        </section>

        <section className="feature-strip" id="open-source">
          <article><span><Code2 /></span><div><strong>Canonical engine</strong><p>One reusable scanner powers web, CLI, reports, policy manifests and proofs.</p></div></article>
          <article><span><Radar /></span><div><strong>Exposure intelligence</strong><p>Observed storage, function, event, selector and policy paths without model inference.</p></div></article>
          <article><span><CircleDotDashed /></span><div><strong>Proof, not source</strong><p>Publish hashes and metadata on Arc without exposing confidential Solidity code.</p></div></article>
        </section>

        <section className="workspace" id="workspace">
          <div className="workspace-topline">
            <div><span className="eyebrow">LIVE LOCAL WORKSPACE</span><h2>Privacy Mission Control</h2><p>{sources.length} Solidity files · {report.contracts.length} contracts · canonical report v{report.scannerVersion}</p></div>
            <div className="demo-switcher">
              <button type="button" className={mode === 'vulnerable' ? 'active' : ''} onClick={() => useDemo('vulnerable')}>Vulnerable</button>
              <button type="button" className={mode === 'remediated' ? 'active safe' : ''} onClick={() => useDemo('remediated')}>Hardened</button>
              {mode === 'custom' && <button type="button" className="active custom">Custom project</button>}
            </div>
          </div>

          <div className="workspace-toolbar">
            <div className="workspace-tabs" role="tablist">
              {tabs.map((item) => (
                <button type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)} key={item.id}>{item.icon}{item.label}</button>
              ))}
            </div>
            <div className="toolbar-actions">
              <div className="file-picker">
                <select value={activeFile} onChange={(event: ChangeEvent<HTMLSelectElement>) => { setActiveFile(event.target.value); setActiveLine(null); }}>
                  {sources.map((file) => <option value={file.path} key={file.path}>{fileLabel(file.path)}</option>)}
                </select>
                <ChevronDown size={14} />
              </div>
              <button type="button" className="icon-button export-button" onClick={() => downloadJsonReport(report, projectName)} title="Export canonical JSON"><Braces size={17} /></button>
              <button type="button" className="icon-button export-button" onClick={() => downloadMarkdownReport(report, projectName)} title="Export Markdown report"><Download size={17} /></button>
              <button type="button" className="icon-button export-button" onClick={() => downloadPolicyManifest(report, projectName)} title="Export Arc Policy Manifest"><Network size={17} /></button>
              <button type="button" className="icon-button export-button" onClick={() => downloadRemediationPack(report, projectName, sources)} title="Export Remediation Pack ZIP"><FileArchive size={17} /></button>
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
            {dragging && <div className="drop-message"><UploadCloud size={36} /><strong>Drop Solidity files to scan locally</strong><span>No source leaves your browser.</span></div>}

            {tab === 'overview' && <MissionOverview report={report} onOpenFinding={(finding) => selectFinding(finding, true)} />}

            {tab === 'analysis' && activeSource && (
              <>
                <div className="analysis-metrics">
                  <ScoreRing score={report.score} grade={report.grade} />
                  <div className="metric"><span>Critical</span><strong>{report.summary.critical}</strong><small>Immediate review</small></div>
                  <div className="metric"><span>High</span><strong>{report.summary.high}</strong><small>Likely disclosure</small></div>
                  <div className="metric"><span>Exposure chains</span><strong>{report.exposureChains.length}</strong><small>{report.exposure.sensitiveSelectors} sensitive selectors</small></div>
                  <div className="improvement-card"><span>HARDENING DEMO</span><strong>+{scoreDelta} points</strong><p>Vulnerable {vulnerableReport.score} → Hardened {remediatedReport.score}</p></div>
                </div>
                <div className="analysis-grid">
                  <CodeViewer fileName={activeSource.path} source={activeSource.content} findings={activeFindings} activeLine={activeLine} onLineSelect={setActiveLine} />
                  <Findings findings={report.findings} activeFingerprint={selectedFinding} onSelect={(finding) => selectFinding(finding)} />
                </div>
              </>
            )}

            {tab === 'exposure' && <ExposureChains report={report} onOpenLocation={openLocation} />}
            {tab === 'treatment' && <RemediationLab report={report} selectedFinding={selectedFindingItem} onSelect={(finding) => selectFinding(finding)} />}
            {tab === 'progress' && <ProgressPanel current={report} baseline={comparisonBaseline} baselineLabel={baselineLabel} currentLabel={currentLabel} history={history} onClearHistory={clearHistory} />}
            {tab === 'policies' && <PolicyGraph report={report} />}
            {tab === 'proof' && <ProofPanel report={report} projectName={projectName} onProjectNameChange={setProjectName} />}
          </div>

          <p className="workspace-disclaimer">{report.disclaimer}</p>
        </section>

        <section className="developer-section">
          <div>
            <span className="eyebrow">BUILT TO BE REUSED</span>
            <h2>Not just a dashboard. An open-source privacy engineering engine.</h2>
            <p>Fork the scanner, import the canonical API, add deterministic detection rules, generate policy manifests and build Arc proof workflows on top of VeilForge.</p>
          </div>
          <div className="developer-code"><span><BookOpen size={15} /> REUSABLE ENTRY POINT</span><pre><code>{`import { scanSources, generatePolicyManifest } from '@veilforge/scanner';\n\nconst report = scanSources(files);\nconst manifest = generatePolicyManifest(report);`}</code></pre></div>
        </section>

        <section className="closing">
          <div><span className="eyebrow">PRIVACY ENGINEERING BEFORE PRODUCTION</span><h2>Turn disclosure findings into a deployment decision.</h2><p>VeilForge v1.8 unifies project triage, exact evidence, exposure paths, treatment order, policy boundaries and Arc proof metadata in one deterministic workflow.</p></div>
          <button type="button" className="primary-button" onClick={() => document.getElementById('workspace')?.scrollIntoView({ behavior: 'smooth' })}>Run Mission Control <ArrowRight size={18} /></button>
        </section>
      </main>

      <footer><Brand /><p>Independent community project. Not affiliated with or endorsed by Circle.</p><span>{ARC_TESTNET.name} · Chain {ARC_TESTNET.id}</span></footer>
    </div>
  );
}
