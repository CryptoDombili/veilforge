import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { runAction } from '../action/runner.mjs';
const root = process.cwd(); const relativeTemporary = `tmp/phase-4b1-ci-${process.pid}`; const temporary = path.resolve(root, relativeTemporary); await mkdir(temporary, { recursive: false });
try {
  const output = path.join(temporary, 'github-output.txt');
  const result = await runAction({ ...process.env, GITHUB_WORKSPACE: root, GITHUB_OUTPUT: output, INPUT_PROJECT_ID: 'phase-4b1-smoke', INPUT_SOURCE: 'examples/cli/basic-scan/contracts', INPUT_DOMAINS: 'payments', INPUT_OUTPUT: `${relativeTemporary}/artifacts`, INPUT_GATE_CONFIG: 'examples/github-actions/veilforge-gate.json', INPUT_FAIL_ON_GATE: 'false', INPUT_UPLOAD_SARIF: 'true', INPUT_STAGE_TIMEOUT: '120000', INPUT_GLOBAL_TIMEOUT: '300000' });
  if (result.exitCode !== 0 || !result.outputs['report-hash'].startsWith('sha256:')) throw new Error('CI smoke failed.');
  await writeFile(path.join(temporary, 'passed'), 'ok'); process.stdout.write('VeilForge V4 CI smoke passed.\n');
} finally { await rm(temporary, { recursive: true, force: true }); }
