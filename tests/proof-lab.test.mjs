import test from 'node:test';
import assert from 'node:assert/strict';
import { keccakHex } from '../packages/analyzer/src/index.js';
import { buildProofLabSnapshot, parseProofLabReceipt } from '../apps/web/lib/proof-lab.js';

test('Proof Lab parses a Foundry JSON test receipt', () => {
  const receipt = parseProofLabReceipt({
    'test/Payroll.t.sol:PayrollTest': {
      test_results: {
        'testOwner()': { status: 'Success' },
        'testFuzzPrivate(uint256)': { status: 'Success' },
      },
    },
    fuzzRuns: 2048,
    sourceHash: '0xabc',
  }, 'foundry.json');
  assert.equal(receipt.framework, 'Foundry');
  assert.deepEqual(receipt.tests, { total: 2, passed: 2, failed: 0, skipped: 0, durationMs: 0 });
  assert.equal(receipt.fuzz.runs, 2048);
  assert.equal(receipt.compilationPassed, true);
});

test('Proof Lab parses a Hardhat Mocha receipt and preserves failures', () => {
  const receipt = parseProofLabReceipt({ stats: { tests: 4, passes: 3, failures: 1, pending: 0, duration: 420 } }, 'hardhat.json');
  assert.equal(receipt.framework, 'Hardhat / Mocha');
  assert.equal(receipt.tests.failed, 1);
  assert.equal(receipt.tests.durationMs, 420);
});

test('Proof Lab produces FIX PROVEN only when every executable control passes', () => {
  const sourceHash = '0xsource';
  const report = {
    sourceHash,
    reportHash: '0xreport',
    summary: { critical: 0, high: 0 },
    forgePlan: { summary: { candidateReady: 1, engineeringReview: 0 } },
    fuzzPlan: { summary: { vectors: 3 } },
  };
  const receipt = parseProofLabReceipt({
    framework: 'Foundry',
    sourceHash,
    compilation: { success: true },
    tests: { total: 42, passed: 42, failed: 0, skipped: 0 },
    fuzz: { runs: 10000, failures: 0 },
    storageLayout: { safe: true },
  }, 'veilforge-proof-results.json');
  const snapshot = buildProofLabSnapshot({
    report,
    projectXray: { upgradeable: true },
    artifact: { contractName: 'Payroll', compilerVersion: '0.8.24' },
    bytecodeVerification: { verified: true, status: 'ARC VERIFIED', artifactHash: '0xartifact', targetHash: '0xchain' },
    receipt,
    receiptName: receipt.receiptName,
    hash: keccakHex,
  });
  assert.equal(snapshot.decision, 'FIX PROVEN');
  assert.equal(snapshot.blocked, 0);
  assert.equal(snapshot.review, 0);
  assert.match(snapshot.proofId, /^0x[0-9a-f]{64}$/);
});

test('Proof Lab blocks failed tests and a stale source receipt', () => {
  const report = {
    sourceHash: '0xactive',
    reportHash: '0xreport',
    summary: { critical: 0, high: 0 },
    forgePlan: { summary: { candidateReady: 0, engineeringReview: 0 } },
    fuzzPlan: { summary: { vectors: 1 } },
  };
  const receipt = parseProofLabReceipt({ sourceHash: '0xstale', tests: { total: 2, passed: 1, failed: 1 }, fuzz: { runs: 1024, failures: 1 } }, 'failed.json');
  const snapshot = buildProofLabSnapshot({ report, projectXray: { upgradeable: false }, artifact: null, bytecodeVerification: null, receipt, hash: keccakHex });
  assert.equal(snapshot.decision, 'BLOCKED');
  assert.ok(snapshot.checks.some((check) => check.id === 'binding' && check.status === 'block'));
  assert.ok(snapshot.checks.some((check) => check.id === 'tests' && check.status === 'block'));
});
