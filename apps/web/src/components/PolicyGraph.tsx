import type { AccessPolicy, PolicyRecommendation, ScanReport } from '@veilforge/scanner';
import { Eye, EyeOff, KeyRound, Network } from 'lucide-react';

interface PolicyGraphProps {
  report: ScanReport;
}

const policyDetails: Record<AccessPolicy, { icon: React.JSX.Element; description: string }> = {
  Open: { icon: <Eye size={17} />, description: 'Broadly callable selector' },
  Restricted: { icon: <KeyRound size={17} />, description: 'Explicit grant required' },
  Locked: { icon: <EyeOff size={17} />, description: 'Unavailable by default' },
};

function groupPolicies(policies: PolicyRecommendation[]): Array<{ policy: AccessPolicy; items: PolicyRecommendation[] }> {
  return (['Open', 'Restricted', 'Locked'] as const).map((policy) => ({
    policy,
    items: policies.filter((item) => item.recommendation === policy),
  }));
}

export function PolicyGraph({ report }: PolicyGraphProps): React.JSX.Element {
  return (
    <section className="panel policy-panel">
      <header className="panel-header">
        <div>
          <span className="eyebrow">ARC-ALIGNED POLICY STUDIO</span>
          <h2>Selector exposure boundaries</h2>
          <p>Exportable recommendations generated from the same canonical scan report.</p>
        </div>
        <span className="count-pill"><Network size={14} /> {report.policies.length} SELECTORS</span>
      </header>
      <div className="policy-summary-bar">
        <span><b>{report.exposure.restrictedSelectors}</b> restricted</span>
        <span><b>{report.exposure.lockedSelectors}</b> locked</span>
        <span><b>{report.policies.length - report.exposure.sensitiveSelectors}</b> open</span>
      </div>
      <div className="policy-columns">
        {groupPolicies(report.policies).map(({ policy, items }) => (
          <div className={`policy-column policy-${policy.toLowerCase()}`} key={policy}>
            <div className="policy-column-title">
              <span>{policyDetails[policy].icon}</span>
              <div><strong>{policy}</strong><small>{policyDetails[policy].description}</small></div>
              <em>{items.length}</em>
            </div>
            <div className="policy-items">
              {items.length === 0 ? <div className="policy-empty">No selectors</div> : items.map((item) => (
                <article key={`${item.file}-${item.signature}-${item.startLine}`}>
                  <code>{item.signature}</code>
                  <p>{item.reason}</p>
                  <small>{item.contractName} · {item.file}:{item.startLine} · {item.confidence} confidence</small>
                </article>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
