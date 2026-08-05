import { canonicalJson, deepFreeze, sha256Digest, utf8Bytes } from './canonical.js';
import { webV4Error } from './errors.js';
import { V4_EXPORT_MANIFEST_VERSION } from './version.js';

const JSON_NAME = 'veilforge-report-v4.json';
const MARKDOWN_NAME = 'veilforge-report-v4.md';
const MANIFEST_NAME = 'veilforge-web-export-manifest.json';

function markdown(view) {
  const lines = ['# VeilForge V4 Security Report', '', `Report hash: \`${view.reportHash}\``, '', '## Summary', '', `- Findings: ${view.summary.totalFindings ?? view.findings.length}`, `- Analysis complete: ${view.analysis.complete ? 'yes' : 'no'}`, `- Policy: ${view.policy.status}`, '', '## Findings', ''];
  if (!view.findings.length) lines.push('No V4 findings.');
  for (const item of view.findings) lines.push(`- **${item.detectorId}** — ${item.title} (${item.severity}, ${item.disposition})`);
  if (view.analysis.incompleteReasons.length) lines.push('', '## Incomplete reasons', '', ...view.analysis.incompleteReasons.map((item) => `- ${typeof item === 'string' ? item : item.code ?? 'analysis-incomplete'}`));
  return `${lines.join('\n')}\n`.replace(/\r\n?/gu, '\n');
}

export async function createV4WebExport(verification, viewModel) {
  if (verification?.verified !== true || viewModel?.reportHash !== verification.reportHash) throw webV4Error('WEB_V4_EXPORT_INVALID', 'Verified report and view model are required.');
  const reportText = canonicalJson(verification.report);
  const markdownText = markdown(viewModel);
  const files = [
    { filename: JSON_NAME, mediaType: 'application/json', role: 'canonical-report', bytes: utf8Bytes(reportText) },
    { filename: MARKDOWN_NAME, mediaType: 'text/markdown', role: 'human-report', bytes: utf8Bytes(markdownText) },
  ];
  const entries = [];
  for (const file of files) entries.push({ filename: file.filename, mediaType: file.mediaType, role: file.role, byteLength: file.bytes.byteLength, sha256: await sha256Digest(file.bytes), deterministic: true });
  const manifest = { manifestVersion: V4_EXPORT_MANIFEST_VERSION, reportHash: verification.reportHash, files: entries, packageDigest: null, verified: true };
  manifest.packageDigest = await sha256Digest({ ...manifest, packageDigest: null });
  files.push({ filename: MANIFEST_NAME, mediaType: 'application/json', role: 'manifest', bytes: utf8Bytes(canonicalJson(manifest)) });
  return deepFreeze({ reportHash: verification.reportHash, files, manifest });
}

export async function verifyV4WebExport(bundle) {
  try {
    if (bundle?.manifest?.manifestVersion !== V4_EXPORT_MANIFEST_VERSION || bundle.files?.length !== 3) throw new Error('shape');
    if (await sha256Digest({ ...bundle.manifest, packageDigest: null }) !== bundle.manifest.packageDigest) throw new Error('package');
    for (const entry of bundle.manifest.files) {
      const file = bundle.files.find((item) => item.filename === entry.filename);
      if (!file || file.bytes.byteLength !== entry.byteLength || await sha256Digest(file.bytes) !== entry.sha256) throw new Error('file');
    }
    return deepFreeze({ verified: true, reportHash: bundle.manifest.reportHash, packageDigest: bundle.manifest.packageDigest });
  } catch { throw webV4Error('WEB_V4_EXPORT_INVALID', 'V4 web export verification failed.'); }
}
