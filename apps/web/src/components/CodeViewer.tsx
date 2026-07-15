import type { Finding } from '@veilforge/scanner';

interface CodeViewerProps {
  fileName: string;
  source: string;
  findings: Finding[];
  activeLine: number | null;
  onLineSelect: (line: number) => void;
}

export function CodeViewer({ fileName, source, findings, activeLine, onLineSelect }: CodeViewerProps): React.JSX.Element {
  const lines = source.split('\n');
  const findingByLine = new Map<number, Finding[]>();

  findings.forEach((finding) => {
    for (let line = finding.startLine; line <= finding.endLine; line += 1) {
      const existing = findingByLine.get(line) ?? [];
      existing.push(finding);
      findingByLine.set(line, existing);
    }
  });

  return (
    <section className="panel code-panel" aria-label={`Source code ${fileName}`}>
      <header className="panel-header code-header">
        <div className="window-dots" aria-hidden="true"><i /><i /><i /></div>
        <span className="file-tab">{fileName}</span>
        <span className="solidity-pill">SOLIDITY</span>
      </header>
      <div className="code-scroll" role="list">
        {lines.map((line, index) => {
          const lineNumber = index + 1;
          const lineFindings = findingByLine.get(lineNumber) ?? [];
          const highest = lineFindings.some((item) => item.severity === 'critical')
            ? 'critical'
            : lineFindings.some((item) => item.severity === 'high')
              ? 'high'
              : lineFindings.length
                ? 'medium'
                : 'none';
          return (
            <button
              type="button"
              role="listitem"
              className={`code-line code-line-${highest} ${activeLine === lineNumber ? 'active' : ''}`}
              key={`${lineNumber}-${line}`}
              onClick={() => onLineSelect(lineNumber)}
              title={lineFindings.map((item) => `${item.ruleId}: ${item.title}`).join('\n')}
            >
              <span className="line-number">{lineNumber}</span>
              <code>{line || ' '}</code>
              {lineFindings.length > 0 && <span className="line-marker">{lineFindings.length}</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}
