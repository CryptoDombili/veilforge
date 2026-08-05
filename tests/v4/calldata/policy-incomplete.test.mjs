import test from 'node:test';
import assert from 'node:assert/strict';
import { detect, policy, results } from '../detectors/payments/helpers.mjs';

test('explicit policy source label remains authoritative', () => {
  const configured = { ...policy, sourceLabels: [{ id: 'L-calldata', target: 'opaque', dataClass: 'payer', scope: 'PaymentCase.observe' }] };
  const { detectorRun } = detect('contract PaymentCase { function observe(address opaque) external {} }', configured);
  assert.equal(results(detectorRun, 'calldata-observation').length, 1);
});

test('accepted-risk disposition remains visible on a canonical occurrence', () => {
  const configured = { ...policy, acceptedRisks: [{ id: 'R-calldata', owner: 'security@example.test', justification: 'bounded ingress',
    scope: 'PaymentCase.observe(address)', expiresAt: '2027-01-01T00:00:00Z' }] };
  const { detectorRun } = detect('contract PaymentCase { function observe(address beneficiary) external {} }', configured);
  const item = results(detectorRun, 'calldata-observation')[0];
  assert.equal(item.disposition, 'accepted-risk'); assert.ok(item.acceptedRiskId);
});

test('unrelated callable incompleteness does not make compiler-backed ABI evidence incomplete', () => {
  const { detectorRun } = detect('contract PaymentCase { function observe(uint amount) external {} function unsupported(uint value) internal { assembly { let x := value } } }');
  const item = results(detectorRun, 'calldata-observation')[0];
  assert.ok(item); assert.equal(item.complete, true); assert.deepEqual(item.incompleteReasons, []);
});
