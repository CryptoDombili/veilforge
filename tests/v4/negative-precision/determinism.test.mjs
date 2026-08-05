import test from 'node:test';
import assert from 'node:assert/strict';
import { detect, results } from '../detectors/payments/helpers.mjs';

test('boundary identity, merged evidence and diagnostics are deterministic',()=>{
  const source='contract PaymentCase { function expose(bytes32 invoiceReference) external pure returns(bytes32) { return invoiceReference; } }';
  const first=detect(source).detectorRun,second=detect(source).detectorRun;
  assert.deepEqual(results(first,'return-disclosure'),results(second,'return-disclosure'));
  assert.deepEqual(first.boundaryDiagnostics,second.boundaryDiagnostics);
});
