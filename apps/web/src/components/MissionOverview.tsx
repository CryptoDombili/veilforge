import type { Finding, ScanReport, TriageStatus } from '@veilforge/scanner';
import {
  Activity,
  AlertOctagon,
  ArrowUpRight,
  Blocks,
  CheckCircle2,
  FileCode2,
  GitBranch,
  Radar,
  ShieldAlert,
} from 'lucide-react';
import { ScoreRing } from './ScoreRing';

interface MissionOverviewProps {
  report: ScanReport;
  onOpenFinding: (finding: Finding) => void;
}

const statusCopy: Record<TriageStatus, { label: string; icon: React.JSX.Element }> = {
  ready: { label: 'Ready for manual review', icon: <CheckCircle2 size={17} /> },
  'review-required': { label: 'Review required', icon: <Activity size={17} /> },
  'high-risk': { label: 'High-risk project', icon: <ShieldAlert size={17} /> },
  'deployment-blocked': { label: 'Deployment blocked', icon: <AlertOctagon size={17} /> },
};

function titleCase(value: string): string {
  return value.replaceAll('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function MissionOverview({ report, onOpenFinding }: MissionOverviewProps): React.JSX.Element {
  const blockers = report.findings.filter((finding) =>
    report.triage.blockerFingerprints.includes(finding.fingerprint),
  );
  const status = statusCopy[report.triage.status];

  return (
    <section className="mission-overview">
      <div className={`triage-command triage-${report.triage.status}`}>
        <div className="triage-score">
          <span className="eyebrow">PROJECT PRIVACY TRIAGE</span>
          <ScoreRing score={report.score} grade={report.grade} />
        </div>
        <div className="triage-brief">
          <span className="triage-status">{status.icon}{status.label}</span>
          <h2>{report.triage.deploymentAllowed ? 'Review the remaining exposure surface.' : 'Resolve P0 blockers before deployment.'}</h2>
          <p>{report.triage.explanation}</p>
          <div className="triage-telemetry">
            <span><FileCode2 size={15} /><b>{report.contracts.length}</b> contracts</span>
            <span><Radar size={15} /><b>{report.exposureChains.length}</b> exposure chains</span>
            <span><GitBranch size={15} /><b>{report.exposure.sensitiveSelectors}</b> sensitive selectors</span>
            <span><Blocks size={15} /><b>{report.triage.contractsAtRisk}</b> contracts at risk</span>
          </div>
        </div>
        <div className="triage-signal" aria-hidden="true">
          <span className="signal-ring ring-a" />
          <span className="signal-ring ring-b" />
          <span className="signal-ring ring-c" />
          <span className="signal-core" />
        </div>
      </div>

      <div className="mission-metrics">
        <article className="mission-metric metric-critical"><span>Critical</span><strong>{report.summary.critical}</strong><small>Deployment blockers</small></article>
        <article className="mission-metric metric-high"><span>High</span><strong>{report.summary.high}</strong><small>Likely disclosure</small></article>
        <article className="mission-metric"><span>Treatment actions</span><strong>{report.treatmentPlan.length}</strong><small>Deterministic plan</small></article>
        <article className="mission-metric"><span>Policy boundaries</span><strong>{report.policies.length}</strong><small>Open / restricted / locked</small></article>
      </div>

      <div className="overview-grid">
        <section className="panel contract-triage-panel">
          <header className="panel-header">
            <div><span className="eyebrow">CONTRACT-LEVEL TRIAGE</span><h3>Project risk map</h3></div>
            <span className="count-pill">{report.contracts.length} CONTRACTS</span>
          </header>
          <div className="contract-list">
            {report.contracts.length === 0 ? (
              <div className="empty-state">No Solidity contract definition could be parsed.</div>
            ) : report.contracts.map((contract) => {
              const topFinding = report.findings.find((finding) => contract.topFindingFingerprints.includes(finding.fingerprint));
              return (
                <article className={`contract-row contract-${contract.status}`} key={contract.id}>
                  <div className="contract-score"><strong>{contract.score}</strong><span>/100</span></div>
                  <div className="contract-copy">
                    <span>{contract.file}</span>
                    <strong>{contract.contractName}</strong>
                    <small>{contract.findingCount} findings · {contract.sensitiveSelectors} sensitive selectors</small>
                  </div>
                  <div className="contract-state">
                    <span>{titleCase(contract.status)}</span>
                    {topFinding && <button type="button" onClick={() => onOpenFinding(topFinding)} aria-label={`Open top finding for ${contract.contractName}`}><ArrowUpRight size={16} /></button>}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="panel risk-intelligence-panel">
          <header className="panel-header">
            <div><span className="eyebrow">RISK INTELLIGENCE</span><h3>Highest-priority signals</h3></div>
          </header>
          {blockers.length > 0 ? (
            <div className="blocker-list">
              {blockers.slice(0, 4).map((finding) => (
                <button type="button" key={finding.fingerprint} onClick={() => onOpenFinding(finding)}>
                  <AlertOctagon size={17} />
                  <span><strong>{finding.ruleId} · {finding.title}</strong><small>{finding.file}:{finding.startLine}</small></span>
                  <ArrowUpRight size={15} />
                </button>
              ))}
            </div>
          ) : (
            <div className="no-blockers"><CheckCircle2 size={28} /><strong>No critical blocker matched</strong><p>Continue manual review and inspect high-confidence paths.</p></div>
          )}
          <div className="risk-categories">
            <span className="section-label">TOP CATEGORIES</span>
            {report.triage.topRiskCategories.length === 0 ? <small>No matched categories.</small> : report.triage.topRiskCategories.map((item) => (
              <div key={item.category}><span>{titleCase(item.category)}</span><b>{item.count}</b></div>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
