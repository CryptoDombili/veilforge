import type { AccessPolicy, Finding, ScanReport } from '@veilforge/scanner';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Code2,
  Eye,
  EyeOff,
  KeyRound,
  ShieldCheck,
  Sparkles,
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

export function RemediationLab({ report, selectedFinding, onSelect }: RemediationLabProps): React.JSX.Element {
  if (!selectedFinding) {
    return (
      <section className="panel remediation-panel">
        <header className="panel-header">
          <div><span className="eyebrow">VEILFORGE v1.8</span><h2>Prioritized treatment plan</h2></div>
          <span className="ready-pill"><CheckCircle2 size={14} /> No matched findings</span>
        </header>
        <div className="remediation-empty">
          <ShieldCheck size={44} />
          <strong>No deterministic treatment action was generated.</strong>
          <p>Continue manual review. VeilForge is a privacy-readiness workbench, not a formal security audit.</p>
        </div>
      </section>
    );
  }

  const selectedAction = report.treatmentPlan.find(
    (item) => item.findingFingerprint === selectedFinding.fingerprint,
  );

  return (
    <section className="panel remediation-panel">
      <header className="panel-header">
        <div>
          <span className="eyebrow">FROM FINDINGS TO EXECUTION ORDER</span>
          <h2>Treatment Plan 2.0</h2>
          <p>Every action is derived from a matched rule and sorted by deterministic severity.</p>
        </div>
        <span className="intelligence-pill"><Sparkles size={14} /> NO AI API</span>
      </header>

      <div className="remediation-layout">
        <aside className="fix-queue">
          <div className="fix-queue-title">
            <div><span>PRIORITIZED ACTIONS</span><strong>{report.treatmentPlan.length} steps</strong></div>
            <Zap size={18} />
          </div>
          <div className="fix-queue-list">
            {report.treatmentPlan.slice(0, 30).map((item) => {
              const finding = report.findings.find((candidate) => candidate.fingerprint === item.findingFingerprint);
              if (!finding) return null;
              return (
                <button
                  type="button"
                  key={item.id}
                  className={`fix-queue-item fix-${item.severity} ${selectedFinding.fingerprint === item.findingFingerprint ? 'active' : ''}`}
                  onClick={() => onSelect(finding)}
                >
                  <span className="fix-rank">{item.priority}</span>
                  <span className="fix-copy"><span><b>{item.ruleId}</b><em>{item.severity}</em></span><strong>{item.title}</strong><small>{item.contractName} · {item.file}:{item.startLine}</small></span>
                  <ArrowRight size={15} />
                </button>
              );
            })}
          </div>
        </aside>

        <article className={`remediation-detail detail-${selectedFinding.severity}`}>
          <div className="remediation-heading">
            <div>
              <span className="finding-kicker"><AlertTriangle size={15} /> {selectedAction?.priority ?? 'P3'} · {selectedFinding.ruleId} · {selectedFinding.severity}</span>
              <h3>{selectedFinding.title}</h3>
              <p>{selectedFinding.description}</p>
            </div>
            <span className={`policy-chip policy-${selectedFinding.suggestedPolicy.toLowerCase()}`}>{policyIcon[selectedFinding.suggestedPolicy]}{selectedFinding.suggestedPolicy}</span>
          </div>

          <div className="remediation-meta-grid">
            <div><span>Category</span><strong>{categoryLabel(selectedFinding.category)}</strong></div>
            <div><span>Confidence</span><strong>{selectedFinding.confidence}</strong></div>
            <div><span>Source</span><strong>{selectedFinding.file}:{selectedFinding.startLine}</strong></div>
            <div><span>Contract</span><strong>{selectedAction?.contractName ?? 'Source bundle'}</strong></div>
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
            <span className="section-label"><Zap size={14} /> Action</span>
            <p>{selectedAction?.action ?? selectedFinding.remediation}</p>
          </section>
          {selectedAction && (
            <section className="remediation-section expected-outcome">
              <span className="section-label"><CheckCircle2 size={14} /> Expected outcome</span>
              <p>{selectedAction.expectedOutcome}</p>
            </section>
          )}
          {selectedFinding.saferPattern && (
            <section className="remediation-section safer-pattern">
              <span className="section-label"><CheckCircle2 size={14} /> Safer Solidity pattern</span>
              <pre><code>{selectedFinding.saferPattern}</code></pre>
              <small>Illustrative deterministic pattern. Adapt authorization and test before deployment.</small>
            </section>
          )}
        </article>
      </div>
    </section>
  );
}
