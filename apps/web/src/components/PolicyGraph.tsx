import type { AccessPolicy, PolicyRecommendation } from '@veilforge/scanner';
import { Eye, EyeOff, KeyRound } from 'lucide-react';

interface PolicyGraphProps {
  policies: PolicyRecommendation[];
}

const policyDetails: Record<AccessPolicy, { icon: React.JSX.Element; description: string }> = {
  Open: { icon: <Eye size={17} />, description: 'Broadly callable selector' },
  Restricted: { icon: <KeyRound size={17} />, description: 'Explicit grant required' },
  Locked: { icon: <EyeOff size={17} />, description: 'Selector unavailable' },
};

export function PolicyGraph({ policies }: PolicyGraphProps): React.JSX.Element {
  const groups = (['Open', 'Restricted', 'Locked'] as const).map((policy) => ({
    policy,
    items: policies.filter((item) => item.recommendation === policy),
  }));

  return (
    <section className="panel policy-panel">
      <header className="panel-header">
        <div>
          <span className="eyebrow">APS-ALIGNED RECOMMENDATIONS</span>
          <h2>Function exposure map</h2>
        </div>
        <span className="beta-pill">PRE-APS</span>
      </header>
      <div className="policy-columns">
        {groups.map(({ policy, items }) => (
          <div className={`policy-column policy-${policy.toLowerCase()}`} key={policy}>
            <div className="policy-column-title">
              <span>{policyDetails[policy].icon}</span>
              <div><strong>{policy}</strong><small>{policyDetails[policy].description}</small></div>
              <em>{items.length}</em>
            </div>
            <div className="policy-items">
              {items.length === 0 ? (
                <div className="policy-empty">No selectors</div>
              ) : (
                items.map((item) => (
                  <article key={`${item.file}-${item.signature}-${item.startLine}`}>
                    <code>{item.signature}</code>
                    <p>{item.reason}</p>
                    <small>{item.contractName} · line {item.startLine}</small>
                  </article>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
