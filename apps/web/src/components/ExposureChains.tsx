import type { ExposureNodeKind, ScanReport } from '@veilforge/scanner';
import { Braces, Database, Eye, FileCode2, KeyRound, RadioTower } from 'lucide-react';

interface ExposureChainsProps {
  report: ScanReport;
  onOpenLocation: (file: string, line: number) => void;
}

const nodeIcon: Record<ExposureNodeKind, React.JSX.Element> = {
  storage: <Database size={16} />,
  function: <FileCode2 size={16} />,
  event: <RadioTower size={16} />,
  selector: <Braces size={16} />,
  policy: <KeyRound size={16} />,
};

export function ExposureChains({ report, onOpenLocation }: ExposureChainsProps): React.JSX.Element {
  return (
    <section className="panel exposure-chain-panel">
      <header className="panel-header">
        <div>
          <span className="eyebrow">DETERMINISTIC DATA-FLOW INTELLIGENCE</span>
          <h2>Exposure chains</h2>
          <p>Observed source relationships only. VeilForge does not invent links or use an AI model.</p>
        </div>
        <span className="count-pill"><Eye size={14} /> {report.exposureChains.length} PATHS</span>
      </header>

      {report.exposureChains.length === 0 ? (
        <div className="chain-empty"><Eye size={36} /><strong>No deterministic exposure chain generated.</strong><p>Inspect the source and policy recommendations manually.</p></div>
      ) : (
        <div className="chain-list">
          {report.exposureChains.map((chain, chainIndex) => (
            <article className={`exposure-chain chain-${chain.severity}`} key={chain.id}>
              <div className="chain-heading">
                <span className="chain-index">PATH {String(chainIndex + 1).padStart(2, '0')}</span>
                <div><strong>{chain.title}</strong><p>{chain.explanation}</p></div>
                <span className={`severity-chip severity-${chain.severity}`}>{chain.severity}</span>
              </div>
              <div className="chain-flow">
                {chain.nodes.map((item, index) => (
                  <div className="chain-node-wrap" key={item.id}>
                    <button type="button" className={`chain-node node-${item.kind}`} onClick={() => onOpenLocation(item.file, item.startLine)}>
                      <span>{nodeIcon[item.kind]}</span>
                      <b>{item.label}</b>
                      <small>{item.detail}</small>
                      <em>{item.file}:{item.startLine}</em>
                    </button>
                    {index < chain.nodes.length - 1 && <span className="chain-connector" aria-hidden="true">→</span>}
                  </div>
                ))}
              </div>
              <footer><span>{chain.contractName}</span><span>{chain.confidence} confidence</span><span>{chain.findingFingerprints.length} linked findings</span></footer>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
