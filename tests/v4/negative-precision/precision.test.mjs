import test from 'node:test';
import assert from 'node:assert/strict';
import { detect as detectPayments, policy as paymentsPolicy, results as paymentResults } from '../detectors/payments/helpers.mjs';
import { detect as detectTreasury, policy as treasuryPolicy, results as treasuryResults } from '../detectors/treasury/helpers.mjs';
import { detect as detectCredit, policy as creditPolicy, results as creditResults } from '../detectors/private-credit/helpers.mjs';

test('derived collateral predicate is not a raw return disclosure', () => {
  const { detectorRun } = detectCredit('contract CreditCase { function check(bytes32 collateralReference) internal pure returns(bool) { return collateralReference != 0; } }');
  assert.equal(creditResults(detectorRun, 'return-disclosure').length, 0);
  assert.equal(creditResults(detectorRun, 'collateral-disclosure').length, 0);
  assert.ok(detectorRun.boundaryDiagnostics.derivedExpressionFilteredCount >= 1);
});

test('raw sensitive return remains visible', () => {
  const { detectorRun } = detectCredit('contract CreditCase { function expose(bytes32 collateralReference) external pure returns(bytes32) { return collateralReference; } }');
  assert.ok(creditResults(detectorRun, 'return-disclosure').length);
});

test('ABI encoding in a commitment wrapper is neither metadata nor an external target', () => {
  const source='contract PaymentCase { function approvedCommitment(bytes32 value) public pure returns(bytes32) { return keccak256(abi.encode(value)); } function publish(bytes32 customerKycReference) external pure returns(bytes32) { return approvedCommitment(customerKycReference); } }';
  const configured={...paymentsPolicy,approvedWrappers:[{id:'W',callable:'PaymentCase.approvedCommitment(bytes32)',kind:'commitment',scope:'PaymentCase.publish(bytes32)'}]};
  const { detectorRun }=detectPayments(source,configured);
  assert.equal(paymentResults(detectorRun,'metadata-disclosure').length,0);
  assert.equal(paymentResults(detectorRun,'external-call-disclosure').length,0);
});

test('real metadata context remains visible', () => {
  const { detectorRun }=detectPayments('contract PaymentCase { function metadata(bytes32 invoiceReference) external pure returns(bytes memory) { return abi.encode(invoiceReference); } }');
  assert.equal(paymentResults(detectorRun,'metadata-disclosure').length,1);
});

test('accepted-risk declaration and usage traces form one boundary', () => {
  const source='interface R { function receiveReference(bytes32 value) external; } contract PaymentCase { function forward(address receiver, bytes32 invoiceReference) external { R(receiver).receiveReference(invoiceReference); } }';
  const configured={...paymentsPolicy,acceptedRisks:[{id:'R1',owner:'security@example.test',justification:'bounded',scope:'PaymentCase.forward(address,bytes32)',expiresAt:'2027-01-01T00:00:00Z'}]};
  const found=paymentResults(detectPayments(source,configured).detectorRun,'external-call-disclosure');
  assert.equal(found.length,1); assert.equal(found[0].disposition,'accepted-risk'); assert.equal(found[0].supportingCandidateTraceIds.length,2);
});

test('fully-qualified public fields preserve separate getter and storage surfaces', () => {
  const payment=detectPayments('contract PaymentCase { bytes32 public beneficiaryReference; }',{...paymentsPolicy,publicFields:[{id:'P',field:'PaymentCase.beneficiaryReference',justification:'public',scope:'PaymentCase'}]}).detectorRun;
  const treasury=detectTreasury('contract TreasuryCase { bytes32 public supplierReference; }',{...treasuryPolicy,publicFields:[{id:'T',field:'TreasuryCase.supplierReference',justification:'public',scope:'TreasuryCase'}]}).detectorRun;
  const credit=detectCredit('contract CreditCase { bytes32 public interestRateReference; }',{...creditPolicy,publicFields:[{id:'C',field:'CreditCase.interestRateReference',justification:'public',scope:'CreditCase'}]}).detectorRun;
  for(const [run,get] of [[payment,paymentResults],[treasury,treasuryResults],[credit,creditResults]]){
    assert.equal(get(run,'public-getter-disclosure')[0].disposition,'policy-approved');
    assert.equal(get(run,'public-storage-disclosure')[0].disposition,'policy-approved');
  }
});
