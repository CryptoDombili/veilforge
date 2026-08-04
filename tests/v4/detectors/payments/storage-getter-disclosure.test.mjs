import test from 'node:test'; import assert from 'node:assert/strict'; import { detect, results } from './helpers.mjs';
const source = 'contract PaymentCase { address public payer; }';
test('sensitive value to public storage', () => { const { detectorRun } = detect(source); assert.ok(results(detectorRun, 'public-storage-disclosure').length); });
test('sensitive value to public getter', () => { const { detectorRun } = detect(source); assert.ok(results(detectorRun, 'public-getter-disclosure').length); });
test('getter and storage are separate occurrences', () => { const { detectorRun } = detect(source); const a = results(detectorRun, 'public-storage-disclosure')[0]; const b = results(detectorRun, 'public-getter-disclosure')[0]; assert.notEqual(a.detectorResultId, b.detectorResultId); });
