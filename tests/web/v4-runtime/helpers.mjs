import fs from 'node:fs';
import path from 'node:path';
import { scanProject as nodeScanProject } from '../../../packages/sdk/src/scan.js';
import { VeilForgeV4BrowserRuntime } from '../../../dist/v4/runtime/browser-scanner-entry.js';

const corpus = JSON.parse(fs.readFileSync('tests/corpus/manifest.json', 'utf8'));
function collect(root, directory = root, output = {}) {
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, item.name);
    if (item.isDirectory()) collect(root, absolute, output);
    else if (item.isFile() && item.name.endsWith('.sol')) output[path.relative(root, absolute).replaceAll('\\', '/')] = { content: fs.readFileSync(absolute, 'utf8') };
  }
  return output;
}
export function corpusInput(caseId) {
  const entry = corpus.cases.find((item) => item.id === caseId);
  const compiler = JSON.parse(fs.readFileSync(path.join(entry.path, 'compiler.json'), 'utf8'));
  return { projectId: caseId, canonicalSourceRootId: `corpus-${caseId}`, sources: collect(path.join(entry.path, 'project')), compiler: { version: compiler.version }, settings: compiler.settings, policy: JSON.parse(fs.readFileSync(path.join(entry.path, 'policy.json'), 'utf8')), domains: [entry.domain], evaluationTime: '2026-08-05T00:00:00Z' };
}
export const browserScan = (caseId, options = {}) => VeilForgeV4BrowserRuntime.scanProject(corpusInput(caseId), { limits: { stageTimeoutMs: 120_000, globalTimeoutMs: 300_000, ...(options.limits ?? {}) }, ...options });
export const nodeScan = (caseId) => nodeScanProject(corpusInput(caseId), { export: false });
export { VeilForgeV4BrowserRuntime };
