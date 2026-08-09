import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const excluded = new Set(['.git', 'node_modules', 'dist', 'dist-preview-v4', 'output', 'tmp', 'coverage']);

function installPinnedRuntime(actionRoot) {
  assert.ok(process.env.npm_execpath, 'Run this consumer regression through the locked npm script.');
  const result = spawnSync(process.execPath, [process.env.npm_execpath, 'ci', '--omit=dev', '--ignore-scripts'], {
    cwd: actionRoot,
    encoding: 'utf8',
    timeout: 120_000,
    shell: false,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

test('Action executes a real scan from a clean unrelated consumer repository', { timeout: 180_000 }, () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'veilforge-action-consumer-'));
  const actionRoot = path.join(fixture, 'action-checkout');
  const consumerRoot = path.join(fixture, 'consumer');
  try {
    fs.cpSync(root, actionRoot, {
      recursive: true,
      filter(source) {
        const relative = path.relative(root, source).replaceAll('\\', '/');
        return !excluded.has(relative.split('/')[0]);
      },
    });
    assert.equal(fs.existsSync(path.join(actionRoot, 'node_modules')), false);

    installPinnedRuntime(actionRoot);
    assert.equal(JSON.parse(fs.readFileSync(path.join(actionRoot, 'node_modules', 'solc', 'package.json'))).version, '0.8.24');
    assert.equal(JSON.parse(fs.readFileSync(path.join(actionRoot, 'node_modules', 'tmp', 'package.json'))).version, '0.2.7');

    fs.mkdirSync(consumerRoot, { recursive: true });
    fs.cpSync(path.join(actionRoot, 'examples', 'vulnerable-payroll'), path.join(consumerRoot, 'contracts'), { recursive: true });
    fs.copyFileSync(path.join(actionRoot, 'examples', 'github-actions', 'veilforge-gate.json'), path.join(consumerRoot, 'gate.json'));
    const githubOutput = path.join(consumerRoot, 'github-output.txt');
    const result = spawnSync(process.execPath, [path.join(actionRoot, 'action', 'entrypoint.mjs')], {
      cwd: consumerRoot,
      encoding: 'utf8',
      timeout: 120_000,
      env: {
        ...process.env,
        GITHUB_WORKSPACE: consumerRoot,
        GITHUB_OUTPUT: githubOutput,
        INPUT_PROJECT_ID: 'external/consumer',
        INPUT_SOURCE: 'contracts',
        INPUT_DOMAINS: 'payments,treasury,private-credit',
        INPUT_OUTPUT: 'veilforge-output',
        INPUT_GATE_CONFIG: 'gate.json',
        INPUT_FAIL_ON_GATE: 'false',
        INPUT_UPLOAD_SARIF: 'true',
      },
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /VeilForge gate: (allow|deny)/u);
    assert.match(fs.readFileSync(githubOutput, 'utf8'), /^report-hash=sha256:[0-9a-f]{64}$/mu);
    assert.ok(fs.existsSync(path.join(consumerRoot, 'veilforge-output', 'veilforge-report-v4.json')));
    assert.ok(fs.existsSync(path.join(consumerRoot, 'veilforge-output', 'veilforge-results-v4.sarif')));
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});
