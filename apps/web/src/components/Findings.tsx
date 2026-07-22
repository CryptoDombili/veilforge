import type { Finding } from '@veilforge/scanner';
import { AlertOctagon, AlertTriangle, ChevronRight, Info, ShieldCheck } from 'lucide-react';

interface FindingsProps {
  findings: Finding[];
  activeFingerprint: string | null;
  onSelect: (finding: Finding) => void;
}

const iconFor: Record<Finding['severity'], React.JSX.Element> = {
  critical: <AlertOctagon size={17} />,
  high: <AlertTriangle size={17} />,
  medium: <Info size={17} />,
  low: <Info size={17} />,
};

export function Findings({ findings, activeFingerprint, onSelect }: FindingsProps): React.JSX.Element {
  return (
    <section className="panel findings-panel">
      <header className="panel-header">
        <div><span className="eyebrow">DETERMINISTIC FINDINGS</span><h3>Privacy signals</h3></div>
        <span className="count-pill">{findings.length} FINDINGS</span>
      </header>
      <div className="findings-list">
        {findings.length === 0 ? (
          <div className="finding-empty">
            <ShieldCheck size={34} />
            <strong>No deterministic rule matched</strong>
            <p>Continue manual review. This is not a formal security audit.</p>
          </div>
        ) : findings.map((finding) => (
          <button
            type="button"
            className={`finding-card finding-${finding.severity} ${activeFingerprint === finding.fingerprint ? 'active' : ''}`}
            key={finding.fingerprint}
            onClick={() => onSelect(finding)}
          >
            <span className="finding-icon">{iconFor[finding.severity]}</span>
            <span className="finding-body">
              <span className="finding-meta"><strong>{finding.ruleId}</strong><em>{finding.severity}</em><small>{finding.file}:{finding.startLine}</small></span>
              <b>{finding.title}</b>
              <p>{finding.description}</p>
            </span>
            <ChevronRight size={17} className="finding-arrow" />
          </button>
        ))}
      </div>
    </section>
  );
}
