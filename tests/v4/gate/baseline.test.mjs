import test from 'node:test';
import assert from 'node:assert/strict';
import { report } from '../report/helpers.mjs';
import { evaluateGate } from '../../../packages/gate/src/index.js';
test('new-only baseline accepts existing fingerprints but keeps them counted', async () => { const source = report(); const result = await evaluateGate(source, { baseline: { mode: 'new-only', report: source } }); assert.equal(result.passed, true); assert.equal(result.counts.baselineExisting, 1); assert.equal(result.counts.evaluated, 1); });
test('unverified baseline report is rejected', async () => { const source = report(); const baseline = structuredClone(source); baseline.integrity.reportHash = 'sha256:bad'; await assert.rejects(evaluateGate(source, { baseline: { mode: 'new-only', report: baseline } }), { code: 'GATE_CONFIG_INVALID' }); });
