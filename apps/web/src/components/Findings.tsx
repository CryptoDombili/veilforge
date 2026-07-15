import type { Finding, Severity } from '@veilforge/scanner';
import { AlertOctagon, AlertTriangle, ChevronRight, Info, ShieldAlert } from 'lucide-react';

interface FindingsProps {
  findings: Finding[];
  activeFingerprint: string | null;
  onSelect: (finding: Finding) => void;
}

const iconFor: Record<Severity, React.JSX.Element> = {
  critical: <AlertOctagon size={17} />,
  high: <ShieldAlert size={17} />,
  medium: <AlertTriangle size={17} />,
  low: <Info size={17} />,
};

export function Findings({ findings, activeFingerprint, onSelect }: FindingsProps): React.JSX.Element {
  return (
    <section className="panel findings-panel">
      <header className="panel-header">
        <div>
          <span className="eyebrow">DETERMINISTIC ANALYSIS</span>
          <h2>Privacy leaks</h2>
        </div>
        <span className="count-badge">{findings.length}</span>
      </header>
      <div className="finding-list">
        {findings.length === 0 ? (
          <div className="empty-state">
            <span>✓</span>
            <strong>No current rule matched</strong>
            <p>This is not a formal security audit. Continue manual review.</p>
          </div>
        ) : (
          findings.map((finding) => (
            <button
              type="button"
              className={`finding-card finding-${finding.severity} ${activeFingerprint === finding.fingerprint ? 'active' : ''}`}
              key={finding.fingerprint}
              onClick={() => onSelect(finding)}
            >
              <span className="finding-icon">{iconFor[finding.severity]}</span>
              <span className="finding-body">
                <span className="finding-meta">
                  <strong>{finding.ruleId}</strong>
                  <em>{finding.severity}</em>
                  <small>{finding.file}:{finding.startLine}</small>
                </span>
                <b>{finding.title}</b>
                <p>{finding.description}</p>
              </span>
              <ChevronRight size={17} className="finding-arrow" />
            </button>
          ))
        )}
      </div>
    </section>
  );
}
