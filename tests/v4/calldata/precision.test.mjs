import test from 'node:test';
import assert from 'node:assert/strict';
import { detect as detectPayments, results as paymentResults } from '../detectors/payments/helpers.mjs';
import { detect as detectTreasury, results as treasuryResults } from '../detectors/treasury/helpers.mjs';
import { detect as detectCredit, results as creditResults } from '../detectors/private-credit/helpers.mjs';

test('one semantic parameter occurrence merges declaration and use traces', () => {
  const { detectorRun } = detectPayments('contract PaymentCase { function observe(uint amount) external pure returns(bool) { return amount != 0; } }');
  const found = paymentResults(detectorRun, 'calldata-observation');
  assert.equal(found.length, 1); assert.equal(found[0].supportingCandidateTraceIds.length, 3); assert.ok(found[0].semanticOccurrenceId);
  assert.deepEqual(detectorRun.calldataDiagnostics, { rawCandidateCount: 3, semanticOccurrenceCount: 1, duplicateCandidateCount: 2,
    filteredBenignCount: 0, filteredDeclarationOnlyCount: 0, mergedTraceCount: 2 });
});

test('raw stronger disclosure replaces redundant calldata observation', () => {
  const { detectorRun } = detectPayments('contract PaymentCase { event Out(bytes32); function publish(bytes32 payeeReference) external { emit Out(payeeReference); } }');
  assert.equal(paymentResults(detectorRun, 'calldata-observation').length, 0);
  assert.equal(detectorRun.calldataDiagnostics.filteredBenignCount, 1);
});

test('derived boolean return does not hide the ABI observation', () => {
  const { detectorRun } = detectPayments('contract PaymentCase { function observe(uint amount) external pure returns(bool) { return amount != 0; } }');
  assert.equal(paymentResults(detectorRun, 'calldata-observation').length, 1);
});

test('unsupported name-only signal without financial context is filtered', () => {
  const { detectorRun } = detectPayments('contract Neutral { function inspect(bytes32 payeeReference) external pure returns(bool) { return payeeReference != 0; } }');
  assert.equal(paymentResults(detectorRun, 'calldata-observation').length, 0);
  assert.equal(detectorRun.calldataDiagnostics.filteredDeclarationOnlyCount, 1);
});

test('the three domains use the same occurrence semantics', () => {
  const treasury = detectTreasury('contract TreasuryCase { function observe(uint withdrawalAmount) external pure returns(bool) { return withdrawalAmount != 0; } }').detectorRun;
  const credit = detectCredit('contract CreditCase { function observe(bytes32 loanTerms) external pure returns(bool) { return loanTerms != 0; } }').detectorRun;
  assert.equal(treasuryResults(treasury, 'calldata-observation').length, 1);
  assert.equal(creditResults(credit, 'calldata-observation').length, 1);
});
