import test from 'node:test';
import assert from 'node:assert/strict';
import { report } from '../report/helpers.mjs';
import { renderSarifJson } from '../../../packages/sarif/src/index.js';
test('SARIF bytes are deterministic for the same verified report', () => { const source = report(); assert.equal(renderSarifJson(source), renderSarifJson(structuredClone(source))); });
