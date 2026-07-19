import type { AccessPolicy, Finding, ScanReport } from '@veilforge/scanner';
import {
  ArrowRight,
  CheckCircle2,
  Check,
  Code2,
  Eye,
  EyeOff,
  KeyRound,
  ShieldCheck,
  AlertTriangle,
  Zap,
} from 'lucide-react';

interface RemediationLabProps {
  report: ScanReport;
  selectedFinding: Finding | null;
  onSelect: (finding: Finding) => void;
}

const policyIcon: Record<AccessPolicy, React.JSX.Element> = {
  Open: <Eye size={15} />,
  Restricted: <KeyRound size={15} />,
  Locked: <EyeOff size={15} />,
};

function categoryLabel(value: Finding['category']): string {
  return value.replaceAll('-', ' ');
}

const severityRank: Record<Finding['severity'], number> = { critical: 0, high: 1, medium: 2, low: 3 };

export function RemediationLab({ report, selectedFinding, onSelect }: RemediationLabProps): React.JSX.Element {
  const prioritized = [...report.findings]
    .sort(
      (a, b) =>
        severityRank[a.severity] - severityRank[b.severity] ||
        a.file.localeCompare(b.file) ||
        a.startLine - b.startLine,
    )
    .slice(0, 12);

  if (!selectedFinding) {
    return (
      <section className="panel remediation-panel">
        <header className="panel-header">
          <div>
            <span className="eyebrow">VEILFORGE v1.1</span>
            <h2>Remediation intelligence</h2>
          </div>
          <span className="ready-pill"><CheckCircle2 size={14} /> No matched findings</span>
        </header>
        <div className="remediation-empty">
          <ShieldCheck size={44} />
          <strong>No deterministic rule matched this source bundle.</strong>
          <p>Continue manual review. VeilForge is a privacy-readiness assistant, not a formal security audit.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="panel remediation-panel">
      <header className="panel-header">
        <div>
          <span className="eyebrow">FROM DETECTION TO REMEDIATION</span>
          <h2>Privacy remediation lab</h2>
        </div>
        <span className="intelligence-pill"><Zap size={14} /> DETERMINISTIC PLAYBOOK</span>
      </header>

      <div className="remediation-layout">
        <aside className="fix-queue">
          <div className="fix-queue-title">
            <div>
              <span>PRIORITIZED FIX PLAN</span>
              <strong>{report.findings.length} actions</strong>
            </div>
            <Check size={18} />
          </div>

          <div className="fix-queue-list">
            {prioritized.map((finding, index) => (
              <button
                type="button"
                key={finding.fingerprint}
                className={`fix-queue-item fix-${finding.severity} ${selectedFinding.fingerprint === finding.fingerprint ? 'active' : ''}`}
                onClick={() => onSelect(finding)}
              >
                <span className="fix-rank">{String(index + 1).padStart(2, '0')}</span>
                <span className="fix-copy">
                  <span><b>{finding.ruleId}</b><em>{finding.severity}</em></span>
                  <strong>{finding.title}</strong>
                  <small>{finding.file}:{finding.startLine}</small>
                </span>
                <ArrowRight size={15} />
              </button>
            ))}
          </div>
        </aside>

        <article className={`remediation-detail detail-${selectedFinding.severity}`}>
          <div className="remediation-heading">
            <div>
              <span className="finding-kicker">
                <AlertTriangle size={15} /> {selectedFinding.ruleId} · {selectedFinding.severity}
              </span>
              <h3>{selectedFinding.title}</h3>
              <p>{selectedFinding.description}</p>
            </div>
            <span className={`policy-chip policy-${selectedFinding.suggestedPolicy.toLowerCase()}`}>
              {policyIcon[selectedFinding.suggestedPolicy]}
              {selectedFinding.suggestedPolicy}
            </span>
          </div>

          <div className="remediation-meta-grid">
            <div><span>Category</span><strong>{categoryLabel(selectedFinding.category)}</strong></div>
            <div><span>Confidence</span><strong>{selectedFinding.confidence}</strong></div>
            <div><span>Source</span><strong>{selectedFinding.file}:{selectedFinding.startLine}</strong></div>
          </div>

          <section className="remediation-section">
            <span className="section-label"><ShieldCheck size={14} /> Why it matters</span>
            <p>{selectedFinding.impact}</p>
          </section>

          <section className="remediation-section">
            <span className="section-label"><Code2 size={14} /> Evidence</span>
            <pre><code>{selectedFinding.evidence}</code></pre>
          </section>

          <section className="remediation-section recommended-fix">
            <span className="section-label"><Zap size={14} /> Recommended remediation</span>
            <p>{selectedFinding.remediation}</p>
          </section>

          {selectedFinding.saferPattern && (
            <section className="remediation-section safer-pattern">
              <span className="section-label"><CheckCircle2 size={14} /> Safer Solidity pattern</span>
              <pre><code>{selectedFinding.saferPattern}</code></pre>
              <small>Illustrative pattern only. Adapt authorization and data design to the application.</small>
            </section>
          )}
        </article>
      </div>
    </section>
  );
}
