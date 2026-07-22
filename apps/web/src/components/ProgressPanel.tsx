import { compareReports, type ScanReport, type TriageStatus } from '@veilforge/scanner';
import { ArrowDownRight, ArrowRight, ArrowUpRight, CheckCircle2, Clock3, GitCompareArrows, Minus } from 'lucide-react';

export interface ScanHistoryEntry {
  reportHash: string;
  sourceHash: string;
  projectName: string;
  score: number;
  grade: string;
  status: TriageStatus;
  findings: number;
  contracts: number;
  timestamp: string;
}

interface ProgressPanelProps {
  current: ScanReport;
  baseline: ScanReport | null;
  baselineLabel: string;
  currentLabel: string;
  history: ScanHistoryEntry[];
  onClearHistory: () => void;
}

function DeltaIcon({ value }: { value: number }): React.JSX.Element {
  if (value > 0) return <ArrowUpRight size={18} />;
  if (value < 0) return <ArrowDownRight size={18} />;
  return <Minus size={18} />;
}

export function ProgressPanel({ current, baseline, baselineLabel, currentLabel, history, onClearHistory }: ProgressPanelProps): React.JSX.Element {
  const comparison = baseline ? compareReports(baseline, current) : null;

  return (
    <section className="progress-layout">
      <div className="panel comparison-panel">
        <header className="panel-header">
          <div><span className="eyebrow">REMEDIATION PROGRESS</span><h2>Scan comparison</h2></div>
          <span className="count-pill"><GitCompareArrows size={14} /> DETERMINISTIC DIFF</span>
        </header>
        {!comparison ? (
          <div className="comparison-empty"><GitCompareArrows size={38} /><strong>Upload a revised project to create a comparison.</strong><p>The previous custom scan is kept only in memory. Source code is never stored in history.</p></div>
        ) : (
          <>
            <div className={`score-delta ${comparison.scoreDelta > 0 ? 'delta-positive' : comparison.scoreDelta < 0 ? 'delta-negative' : 'delta-neutral'}`}>
              <div><span>{baselineLabel}</span><strong>{comparison.previousScore}</strong><small>{comparison.previousStatus}</small></div>
              <ArrowRight size={24} />
              <div><span>{currentLabel}</span><strong>{comparison.currentScore}</strong><small>{comparison.currentStatus}</small></div>
              <em><DeltaIcon value={comparison.scoreDelta} />{comparison.scoreDelta > 0 ? '+' : ''}{comparison.scoreDelta} points</em>
            </div>
            <div className="comparison-metrics">
              <article><CheckCircle2 size={18} /><span><strong>{comparison.resolvedFindings.length}</strong> resolved</span></article>
              <article><Clock3 size={18} /><span><strong>{comparison.persistentFindings.length}</strong> persistent</span></article>
              <article><ArrowDownRight size={18} /><span><strong>{comparison.introducedFindings.length}</strong> introduced</span></article>
              <article><GitCompareArrows size={18} /><span><strong>{comparison.policyChanges.length}</strong> policy changes</span></article>
            </div>
            <div className="comparison-columns">
              <div><span className="section-label">RESOLVED</span>{comparison.resolvedFindings.slice(0, 6).map((finding) => <p key={finding.fingerprint}><b>{finding.ruleId}</b>{finding.title}</p>)}{comparison.resolvedFindings.length === 0 && <small>No findings resolved.</small>}</div>
              <div><span className="section-label">INTRODUCED</span>{comparison.introducedFindings.slice(0, 6).map((finding) => <p key={finding.fingerprint}><b>{finding.ruleId}</b>{finding.title}</p>)}{comparison.introducedFindings.length === 0 && <small>No new findings introduced.</small>}</div>
            </div>
          </>
        )}
      </div>

      <aside className="panel history-panel">
        <header className="panel-header">
          <div><span className="eyebrow">LOCAL METADATA ONLY</span><h3>Scan history</h3></div>
          {history.length > 0 && <button type="button" className="text-button" onClick={onClearHistory}>Clear</button>}
        </header>
        <p className="history-note">VeilForge stores hashes, score and timestamp in this browser. Solidity source is not saved.</p>
        <div className="history-list">
          {history.length === 0 ? <div className="empty-state">No local snapshots yet.</div> : history.map((entry) => (
            <article key={`${entry.reportHash}-${entry.timestamp}`}>
              <div><strong>{entry.projectName}</strong><small>{new Date(entry.timestamp).toLocaleString()}</small></div>
              <span className={`history-status status-${entry.status}`}><b>{entry.score}</b>{entry.grade}</span>
              <code>{entry.reportHash.slice(0, 12)}…</code>
            </article>
          ))}
        </div>
      </aside>
    </section>
  );
}
