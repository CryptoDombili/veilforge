import test from 'node:test';
import assert from 'node:assert/strict';
import { detect, results } from '../detectors/payments/helpers.mjs';

test('semantic occurrence identity and evidence are deterministic', () => {
  const source = 'contract PaymentCase { function observe(uint amount) external pure returns(bool) { return amount != 0; } }';
  const first = results(detect(source).detectorRun, 'calldata-observation');
  const second = results(detect(source).detectorRun, 'calldata-observation');
  assert.deepEqual(first, second); assert.equal(first.length, 1);
});
