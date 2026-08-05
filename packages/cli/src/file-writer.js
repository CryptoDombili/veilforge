import { mkdir, open, readdir, readFile, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { verifyExportPackage } from '../../sdk/src/exports.js';
import { cliError } from './errors.js';

const EXPECTED = Object.freeze(['veilforge-export-manifest.json', 'veilforge-report-v4.json', 'veilforge-report-v4.md']);
const INTEGRATION = new Set(['veilforge-results-v4.sarif', 'veilforge-gate-result-v4.json']);
function validateOutputPath(value) {
  if (typeof value !== 'string' || !value || /[\u0000-\u001f\u007f]/u.test(value) || value.replaceAll('\\', '/').split('/').includes('..')) throw cliError('CLI_OUTPUT_WRITE_FAILED');
  return path.resolve(value);
}
export async function writeAtomicFile(filename, bytes, { overwrite = false } = {}) {
  const output = validateOutputPath(filename); const parent = path.dirname(output); const leaf = path.basename(output);
  if (!leaf || leaf === '.' || leaf === '..') throw cliError('CLI_OUTPUT_WRITE_FAILED');
  await mkdir(parent, { recursive: true });
  const exists = await stat(output).then(() => true).catch(() => false); if (exists && !overwrite) throw cliError('CLI_OUTPUT_EXISTS');
  const nonce = randomUUID(); const staging = path.join(parent, `.${leaf}.stage-${nonce}`); const backup = path.join(parent, `.${leaf}.backup-${nonce}`); let backedUp = false;
  try { await writeSynced(staging, bytes); if (exists) { await rename(output, backup); backedUp = true; } await rename(staging, output); if (backedUp) await rm(backup, { force: true }); return output; }
  catch (error) { await rm(staging, { force: true }).catch(() => {}); if (backedUp) { await rm(output, { force: true }).catch(() => {}); await rename(backup, output).catch(() => {}); } if (error?.code?.startsWith('CLI_')) throw error; throw cliError('CLI_OUTPUT_WRITE_FAILED', { causeCode: error?.code ?? null }); }
}
async function writeSynced(filename, bytes) { const handle = await open(filename, 'wx', 0o600); try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); } }
export async function readExportDirectory(directory) {
  const root = validateOutputPath(directory); let entries; let names;
  try { entries = await readdir(root, { withFileTypes: true }); names = entries.map((item) => item.name).sort(); } catch { throw cliError('CLI_EXPORT_INVALID'); }
  if (entries.some((item) => !item.isFile() || item.isSymbolicLink())) throw cliError('CLI_EXPORT_INVALID');
  const exportNames = names.filter((name) => !INTEGRATION.has(name)); if (exportNames.length !== EXPECTED.length || exportNames.some((name, index) => name !== EXPECTED[index])) throw cliError('CLI_EXPORT_INVALID');
  const manifest = JSON.parse(await readFile(path.join(root, 'veilforge-export-manifest.json'), 'utf8').catch(() => { throw cliError('CLI_EXPORT_INVALID'); }));
  const byName = new Map((manifest.files ?? []).map((item) => [item.filename, item]));
  return { manifest, files: await Promise.all(EXPECTED.map(async (filename) => ({ filename, mediaType: byName.get(filename)?.mediaType ?? (filename.endsWith('.md') ? 'text/markdown; charset=utf-8' : 'application/json'), role: byName.get(filename)?.role ?? 'unknown', bytes: await readFile(path.join(root, filename)) }))) };
}
export async function writeExportPackage(pkg, directory, { overwrite = false } = {}) {
  try { verifyExportPackage(pkg); } catch (error) { throw cliError('CLI_EXPORT_INVALID', { causeCode: error.code }); }
  const output = validateOutputPath(directory); const parent = path.dirname(output); const leaf = path.basename(output);
  if (!leaf || leaf === '.' || leaf === '..') throw cliError('CLI_OUTPUT_WRITE_FAILED');
  await mkdir(parent, { recursive: true });
  const exists = await stat(output).then(() => true).catch(() => false);
  if (exists && !overwrite) throw cliError('CLI_OUTPUT_EXISTS');
  if (exists) { const names = await readdir(output).catch(() => { throw cliError('CLI_OUTPUT_WRITE_FAILED'); }); if (names.some((name) => !EXPECTED.includes(name) && !INTEGRATION.has(name))) throw cliError('CLI_OUTPUT_WRITE_FAILED'); }
  const nonce = randomUUID(); const staging = path.join(parent, `.${leaf}.stage-${nonce}`); const backup = path.join(parent, `.${leaf}.backup-${nonce}`);
  let installed = false; let backedUp = false;
  try {
    await mkdir(staging, { recursive: false });
    for (const file of [...pkg.files].sort((a, b) => a.filename < b.filename ? -1 : 1)) await writeSynced(path.join(staging, file.filename), file.bytes);
    verifyExportPackage(await readExportDirectory(staging));
    if (exists) { await rename(output, backup); backedUp = true; }
    try { await rename(staging, output); installed = true; } catch (error) { if (backedUp) await rename(backup, output).catch(() => {}); throw error; }
    verifyExportPackage(await readExportDirectory(output));
    if (backedUp) await rm(backup, { recursive: true, force: true });
    return EXPECTED.map((filename) => filename);
  } catch (error) {
    await rm(staging, { recursive: true, force: true }).catch(() => {});
    if (installed) await rm(output, { recursive: true, force: true }).catch(() => {});
    if (await stat(backup).then(() => true).catch(() => false)) await rename(backup, output).catch(() => {});
    if (error?.code?.startsWith('CLI_')) throw error;
    throw cliError('CLI_OUTPUT_WRITE_FAILED', { causeCode: error?.code ?? null });
  }
}
