import { spawn } from 'node:child_process';
import { appendFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function value(env, name, fallback = '') { const item = env[`INPUT_${name.toUpperCase()}`] ?? env[`INPUT_${name.replaceAll('-', '_').toUpperCase()}`] ?? fallback; if (typeof item !== 'string' || item.length > 4096 || /[\0\r]/u.test(item)) throw new Error(`Invalid action input: ${name}`); return item.trim(); }
function relativeOutput(item) { const normalized = item.replaceAll('\\', '/'); if (!normalized || path.isAbsolute(item) || normalized.split('/').includes('..')) throw new Error('Invalid action output path.'); return normalized; }
function boolean(item, name) { if (!['true', 'false'].includes(item)) throw new Error(`Invalid action boolean: ${name}`); return item === 'true'; }
async function setOutputs(filename, outputs) { if (!filename) return; for (const [name, item] of Object.entries(outputs)) { const text = String(item ?? ''); if (/[\r\n]/u.test(text)) throw new Error('Unsafe action output.'); await appendFile(filename, `${name}=${text}\n`, { encoding: 'utf8', mode: 0o600 }); } }
function execute(args, env) { return new Promise((resolve, reject) => { const child = spawn(process.execPath, [path.join(root, 'packages/cli/bin/veilforge.js'), ...args], { cwd: env.GITHUB_WORKSPACE || process.cwd(), env, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); let stdout = ''; let stderr = ''; child.stdout.on('data', (chunk) => { stdout += chunk; }); child.stderr.on('data', (chunk) => { stderr += chunk; }); child.on('error', reject); child.on('close', (code) => resolve({ code, stdout, stderr })); }); }
export async function runAction(env = process.env) {
  const projectId = value(env, 'project-id'); const sources = value(env, 'source').split('\n').map((item) => item.trim()).filter(Boolean); if (!projectId || !sources.length) throw new Error('project-id and source are required.');
  const domains = value(env, 'domains', 'payments').split(',').map((item) => item.trim()).filter(Boolean); if (domains.some((item) => !['payments', 'treasury', 'private-credit', 'arc-payments', 'arc-treasury', 'arc-private-credit'].includes(item))) throw new Error('Invalid action domain.');
  const output = relativeOutput(value(env, 'output', 'veilforge-output')); const gateConfig = value(env, 'gate-config'); if (!gateConfig) throw new Error('gate-config is required.');
  const uploadSarif = boolean(value(env, 'upload-sarif', 'true'), 'upload-sarif'); const failOnGate = boolean(value(env, 'fail-on-gate', 'true'), 'fail-on-gate');
  const args = ['scan', '--project-id', projectId, '--output', output, '--compiler-version', value(env, 'compiler-version', '0.8.24'), '--gate-config', gateConfig, '--gate-json', '--json', '--quiet', '--stage-timeout', value(env, 'stage-timeout', '120000'), '--global-timeout', value(env, 'global-timeout', '300000')];
  for (const source of sources) args.push('--source', source); for (const domain of domains) args.push('--domain', domain);
  const baseline = value(env, 'baseline-report'); if (baseline) args.push('--baseline-report', baseline);
  const policy = value(env, 'policy'); if (policy) args.push('--policy', policy); const taxonomy = value(env, 'taxonomy'); if (taxonomy) args.push('--taxonomy', taxonomy);
  const sarifPath = uploadSarif ? path.join(output, 'veilforge-results-v4.sarif') : ''; if (uploadSarif) args.push('--sarif-output', sarifPath);
  const execution = await execute(args, env); let summary; try { summary = JSON.parse(execution.stdout); } catch { throw new Error(`VeilForge CLI failed with exit code ${execution.code}.`); }
  const outputs = { status: summary.status ?? 'failed', passed: String(summary.gate?.passed === true), 'report-hash': summary.reportHash ?? '', 'findings-count': summary.gate?.counts?.evaluated ?? 0, 'active-findings-count': summary.gate?.counts?.active ?? 0, 'incomplete-count': summary.gate?.incompleteReasons?.length ?? 0, 'sarif-path': sarifPath ? path.resolve(env.GITHUB_WORKSPACE || process.cwd(), sarifPath) : '', 'export-path': path.resolve(env.GITHUB_WORKSPACE || process.cwd(), output), 'gate-decision': summary.gate?.decision ?? 'deny' };
  await setOutputs(env.GITHUB_OUTPUT, outputs);
  if (execution.code !== 0 && !(execution.code === 12 && !failOnGate)) { const error = new Error(`VeilForge action failed with exit code ${execution.code}.`); error.exitCode = execution.code; throw error; }
  return { exitCode: execution.code === 12 && !failOnGate ? 0 : execution.code, outputs, summary };
}
