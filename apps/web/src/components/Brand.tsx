import { Sparkles } from 'lucide-react';

export function Brand(): React.JSX.Element {
  return (
    <div className="brand" aria-label="VeilForge">
      <span className="brand-mark" aria-hidden="true">
        <span className="brand-mark-core" />
        <Sparkles size={13} strokeWidth={1.8} />
      </span>
      <span>
        <strong>VeilForge</strong>
        <small>PRE-APS TOOLKIT</small>
      </span>
    </div>
  );
}
