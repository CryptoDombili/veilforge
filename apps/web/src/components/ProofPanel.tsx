import type { ScanReport } from '@veilforge/scanner';
import { ARC_TESTNET, ARC_TESTNET_REGISTRY_ADDRESS } from '@veilforge/shared';
import {
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Fingerprint,
  LoaderCircle,
  RadioTower,
  ShieldCheck,
  WalletCards,
} from 'lucide-react';
import { type ChangeEvent, useEffect, useState } from 'react';
import { publishProof, type PublishResult } from '../lib/arc';
import { downloadText } from '../lib/artifacts';

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

  useEffect(() => {
    setStatus('idle');
    setMessage('');
    setResult(null);
  }, [projectName, report.reportHash]);

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

  function downloadReceipt(): void {
    const receipt = {
      network: ARC_TESTNET.name,
      chainId: ARC_TESTNET.id,
      registry: ARC_TESTNET_REGISTRY_ADDRESS,
      projectName,
      sourceHash: report.sourceHash,
      reportHash: report.reportHash,
      readinessScore: report.score,
      triageStatus: report.triage.status,
      scannerVersion: report.scannerVersion,
      reportURI,
      transactionHash: result?.transactionHash ?? null,
      projectId: result?.projectId ?? null,
      storesSourceCode: false,
    };
    downloadText(`${JSON.stringify(receipt, null, 2)}\n`, 'application/json', `veilforge-proof-${report.reportHash.slice(2, 10)}.json`);
  }

  return (
    <section className="panel proof-panel">
      <header className="panel-header">
        <div>
          <span className="eyebrow">PROOF CENTER 2.0</span>
          <h2>Anchor a canonical report fingerprint on Arc</h2>
          <p>Only hashes, score and metadata are published. Solidity source never enters the transaction.</p>
        </div>
        <span className="network-pill"><RadioTower size={14} /> {ARC_TESTNET.name}</span>
      </header>

      <div className="proof-grid">
        <div className="proof-form">
          <label>
            Project name
            <input value={projectName} onChange={(event: ChangeEvent<HTMLInputElement>) => onProjectNameChange(event.target.value)} placeholder="veilforge-project" />
          </label>
          <label>
            Optional report URI
            <input value={reportURI} onChange={(event: ChangeEvent<HTMLInputElement>) => setReportURI(event.target.value)} placeholder="ipfs://… or https://…" />
          </label>
          <div className="registry-card">
            <span><ShieldCheck size={15} /> Registry contract</span>
            <code>{ARC_TESTNET_REGISTRY_ADDRESS}</code>
            <a href={`${ARC_TESTNET.explorerUrl}/address/${ARC_TESTNET_REGISTRY_ADDRESS}`} target="_blank" rel="noreferrer">ArcScan <ExternalLink size={13} /></a>
          </div>
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
          <div className="proof-actions">
            <button type="button" className="primary-button publish-button" disabled={status === 'publishing'} onClick={() => void handlePublish()}>
              {status === 'publishing' ? <LoaderCircle className="spin" size={18} /> : <WalletCards size={18} />}
              Publish proof on Arc
            </button>
            <button type="button" className="secondary-button compact" onClick={downloadReceipt}><Download size={16} /> Receipt JSON</button>
          </div>
          {message && <p className={`status-message status-${status}`}>{message}</p>}
        </div>

        <div className="proof-preview">
          <div className="proof-seal">
            <span className="seal-orbit orbit-one" />
            <span className="seal-orbit orbit-two" />
            <Fingerprint size={44} />
          </div>
          <span className="eyebrow">CANONICAL PROOF PAYLOAD</span>
          <h3>{projectName || 'Untitled project'}</h3>
          <dl>
            <div><dt>Readiness</dt><dd>{report.score}/100 · Grade {report.grade}</dd></div>
            <div><dt>Triage</dt><dd>{report.triage.status}</dd></div>
            <div><dt>Scanner</dt><dd>VeilForge v{report.scannerVersion}</dd></div>
            <div><dt>Contracts</dt><dd>{report.contracts.length}</dd></div>
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
