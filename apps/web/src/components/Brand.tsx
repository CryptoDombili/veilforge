import { Orbit } from 'lucide-react';

export function Brand(): React.JSX.Element {
  return (
    <div className="brand" aria-label="VeilForge">
      <span className="brand-mark" aria-hidden="true"><span className="brand-mark-core" /><Orbit size={15} strokeWidth={1.7} /></span>
      <span><strong>VeilForge</strong><small>PRIVACY MISSION CONTROL</small></span>
    </div>
  );
}
