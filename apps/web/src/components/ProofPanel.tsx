import type { ScanReport } from '@veilforge/scanner';
import { ARC_TESTNET } from '@veilforge/shared';
import { CheckCircle2, Copy, ExternalLink, Fingerprint, LoaderCircle, RadioTower, WalletCards } from 'lucide-react';
import { useState } from 'react';
import { publishProof, type PublishResult } from '../lib/arc';

interface ProofPanelProps {
  report: ScanReport;
  projectName: string;
  onProjectNameChange: (value: string) => void;
}

export function ProofPanel({ report, projectName, onProjectNameChange }: ProofPanelProps): React.JSX.Element {
  const [reportURI, setReportURI] = useState('');
  const [status, setStatus] = useState<'idle' | 'publishing' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<PublishResult | null>(null);
  const registryConfigured = Boolean(import.meta.env.VITE_REGISTRY_ADDRESS);

  async function copy(value: string): Promise<void> {
    await navigator.clipboard.writeText(value);
    setMessage('Copied to clipboard.');
  }

  async function handlePublish(): Promise<void> {
    setStatus('publishing');
    setMessage('Waiting for wallet confirmation and Arc finality…');
    try {
      const published = await publishProof({
        projectName,
        sourceHash: report.sourceHash,
        reportHash: report.reportHash,
        score: report.score,
        scannerVersion: report.scannerVersion,
        reportURI,
      });
      setResult(published);
      setStatus('success');
      setMessage('Report proof finalized on Arc Testnet.');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <section className="panel proof-panel">
      <header className="panel-header">
        <div>
          <span className="eyebrow">VERIFIABLE BUILD ARTIFACT</span>
          <h2>Anchor a report proof on Arc</h2>
        </div>
        <span className="network-pill"><RadioTower size={14} /> {ARC_TESTNET.name}</span>
      </header>

      <div className="proof-grid">
        <div className="proof-form">
          <label>
            Project name
            <input value={projectName} onChange={(event) => onProjectNameChange(event.target.value)} placeholder="veilforge-payroll-demo" />
          </label>
          <label>
            Optional report URI
            <input value={reportURI} onChange={(event) => setReportURI(event.target.value)} placeholder="ipfs://… or https://…" />
          </label>
          <div className="hash-card">
            <span><Fingerprint size={15} /> Source hash</span>
            <code>{report.sourceHash}</code>
            <button type="button" onClick={() => void copy(report.sourceHash)} aria-label="Copy source hash"><Copy size={14} /></button>
          </div>
          <div className="hash-card">
            <span><Fingerprint size={15} /> Report hash</span>
            <code>{report.reportHash}</code>
            <button type="button" onClick={() => void copy(report.reportHash)} aria-label="Copy report hash"><Copy size={14} /></button>
          </div>
          <button
            type="button"
            className="primary-button publish-button"
            disabled={status === 'publishing' || !registryConfigured}
            onClick={() => void handlePublish()}
          >
            {status === 'publishing' ? <LoaderCircle className="spin" size={18} /> : <WalletCards size={18} />}
            {registryConfigured ? 'Publish proof on Arc' : 'Registry deployment required'}
          </button>
          {!registryConfigured && (
            <p className="config-note">
              The UI is release-ready. Deploy <code>VeilForgeReportRegistry</code>, then set <code>VITE_REGISTRY_ADDRESS</code>.
            </p>
          )}
          {message && <p className={`status-message status-${status}`}>{message}</p>}
        </div>

        <div className="proof-preview">
          <div className="proof-seal">
            <span className="seal-orbit orbit-one" />
            <span className="seal-orbit orbit-two" />
            <Fingerprint size={44} />
          </div>
          <span className="eyebrow">ONCHAIN PROOF PAYLOAD</span>
          <h3>{projectName || 'Untitled project'}</h3>
          <dl>
            <div><dt>Readiness</dt><dd>{report.score}/100 · Grade {report.grade}</dd></div>
            <div><dt>Scanner</dt><dd>VeilForge v{report.scannerVersion}</dd></div>
            <div><dt>Findings</dt><dd>{report.findings.length} deterministic checks</dd></div>
            <div><dt>Stored</dt><dd>Hashes + metadata only</dd></div>
          </dl>
          {result && (
            <div className="proof-success">
              <CheckCircle2 size={20} />
              <div><strong>Finalized</strong><code>{result.transactionHash}</code></div>
              <a href={result.explorerUrl} target="_blank" rel="noreferrer">ArcScan <ExternalLink size={14} /></a>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
