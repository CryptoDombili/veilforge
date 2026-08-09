import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
test('action metadata exposes required inputs and outputs', async () => { const yaml = await readFile('action/action.yml', 'utf8'); for (const item of ['project-id:', 'source:', 'domains:', 'compiler-version:', 'policy:', 'taxonomy:', 'gate-config:', 'baseline-report:', 'fail-on-gate:', 'upload-sarif:', 'status:', 'passed:', 'report-hash:', 'findings-count:', 'active-findings-count:', 'incomplete-count:', 'sarif-path:', 'export-path:', 'gate-decision:']) assert.match(yaml, new RegExp(item)); });
test('action runner uses spawn argument arrays and no shell', async () => { const source = await readFile('action/runner.mjs', 'utf8'); assert.match(source, /spawn\(process\.execPath/); assert.match(source, /shell: false/); assert.doesNotMatch(source, /shell: true/); assert.doesNotMatch(source, /exec\(/); });
test('action installs only its exact lockfile-pinned runtime before execution', async () => { const yaml = await readFile('action/action.yml', 'utf8'); assert.match(yaml, /using: composite/u); assert.match(yaml, /npm ci --omit=dev --ignore-scripts/u); assert.match(yaml, /github\.action_path.*\/\.\./u); assert.doesNotMatch(yaml, /npm install|@latest/u); });
test('composite metadata forwards every declared input to the existing runner boundary', async () => {
  const yaml = await readFile('action/action.yml', 'utf8');
  for (const [environmentName, inputName] of [
    ['PROJECT_ID', 'project-id'], ['SOURCE', 'source'], ['DOMAINS', 'domains'], ['COMPILER_VERSION', 'compiler-version'],
    ['POLICY', 'policy'], ['TAXONOMY', 'taxonomy'], ['OUTPUT', 'output'], ['GATE_CONFIG', 'gate-config'],
    ['BASELINE_REPORT', 'baseline-report'], ['FAIL_ON_GATE', 'fail-on-gate'], ['UPLOAD_SARIF', 'upload-sarif'],
    ['STAGE_TIMEOUT', 'stage-timeout'], ['GLOBAL_TIMEOUT', 'global-timeout'],
  ]) assert.ok(yaml.includes(`INPUT_${environmentName}: \${{ inputs.${inputName} }}`), `Missing composite input mapping: ${inputName}`);
});
