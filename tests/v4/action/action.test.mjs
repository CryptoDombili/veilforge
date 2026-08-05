import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
test('action metadata exposes required inputs and outputs', async () => { const yaml = await readFile('action/action.yml', 'utf8'); for (const item of ['project-id:', 'source:', 'domains:', 'compiler-version:', 'policy:', 'taxonomy:', 'gate-config:', 'baseline-report:', 'fail-on-gate:', 'upload-sarif:', 'status:', 'passed:', 'report-hash:', 'findings-count:', 'active-findings-count:', 'incomplete-count:', 'sarif-path:', 'export-path:', 'gate-decision:']) assert.match(yaml, new RegExp(item)); });
test('action runner uses spawn argument arrays and no shell', async () => { const source = await readFile('action/runner.mjs', 'utf8'); assert.match(source, /spawn\(process\.execPath/); assert.match(source, /shell: false/); assert.doesNotMatch(source, /shell: true/); assert.doesNotMatch(source, /exec\(/); });
