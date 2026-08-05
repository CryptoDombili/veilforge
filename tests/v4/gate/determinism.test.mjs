import test from 'node:test';
import assert from 'node:assert/strict';
import { report } from '../report/helpers.mjs';
import { evaluateGate } from '../../../packages/gate/src/index.js';
test('gate result is deterministic for the same report and config', async () => { const source = report(); const config = { includedCategories: ['event-disclosure'], includedDomains: ['arc-payments'] }; assert.deepEqual(await evaluateGate(source, config), await evaluateGate(structuredClone(source), structuredClone(config))); });
