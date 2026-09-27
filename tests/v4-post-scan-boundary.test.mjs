import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  deriveV4WorkflowState,
  safeV4LifecycleFailure,
  transitionV4Lifecycle,
} from '../apps/web/v4/ui.js';

const reportHash = `sha256:${'a'.repeat(64)}`;
const verification = Object.freeze({
  verified: true,
  reportHash,
  report: Object.freeze({
    schemaVersion: '4.1.0',
    integrity: Object.freeze({ verified: true, reportHash, hashPayloadVersion: 'veilforge.report.hash.v2' }),
  }),
});
const viewModel = Object.freeze({ reportHash, findings: [], analysis: Object.freeze({ complete: true }) });

function lifecycleState() {
  return {
    scanStatus: 'scanning',
    verification: null,
    viewModel: null,
    exportBundle: null,
    reviewReady: false,
    verifyReady: false,
    analysis: { state: 'scanning' },
    historyFailure: null,
    proof: { envelope: null, status: 'unavailable', failure: null, identityVerified: false },
  };
}

function acceptVerifiedReport(state) {
  transitionV4Lifecycle(state, 'report-verified', {
    verification,
    viewModel,
    analysis: { state: 'verified', phase: 'Report', message: reportHash },
  });
  state.reviewReady = true;
  state.verifyReady = true;
  return state;
}

test('scanner and report-verification failures before acceptance remain scan errors', () => {
  for (const stage of ['scanner', 'report-verification']) {
    const state = lifecycleState();
    transitionV4Lifecycle(state, 'scan-failed', {
      analysis: { state: 'error', phase: null, message: stage },
    });
    assert.equal(state.scanStatus, 'error');
    assert.equal(state.reviewReady, false);
    assert.equal(state.verifyReady, false);
  }
});

test('proof failure cannot downgrade an accepted verified report or its evidence', () => {
  const state = acceptVerifiedReport(lifecycleState());
  const failure = safeV4LifecycleFailure(Object.assign(new Error('private detail'), { name: 'ReferenceError' }), 'proof-initialization');
  transitionV4Lifecycle(state, 'proof-failed', { failure });
  assert.equal(state.scanStatus, 'verified');
  assert.equal(state.verification, verification);
  assert.equal(state.viewModel, viewModel);
  assert.equal(state.analysis.state, 'verified');
  assert.equal(state.proof.status, 'preparation-error');
  assert.deepEqual(state.proof.failure, { code: 'ReferenceError', stage: 'proof-initialization' });
  assert.equal(state.proof.envelope, null);
});

test('late generic scan failure transition is defensively ignored after report acceptance', () => {
  const state = acceptVerifiedReport(lifecycleState());
  transitionV4Lifecycle(state, 'scan-failed', { analysis: { state: 'error' } });
  assert.equal(state.scanStatus, 'verified');
  assert.equal(state.verification, verification);
  assert.equal(state.reviewReady, true);
  assert.equal(state.verifyReady, true);
});

test('history failure remains isolated from verified scan state', () => {
  const state = acceptVerifiedReport(lifecycleState());
  const failure = safeV4LifecycleFailure({ code: 'WEB_V4_PERSISTENCE_INVALID' }, 'history-rendering');
  transitionV4Lifecycle(state, 'history-failed', { failure });
  assert.equal(state.scanStatus, 'verified');
  assert.equal(state.verification, verification);
  assert.deepEqual(state.historyFailure, failure);
});

test('proof failure disables only publish while verified review, hash verification and export remain available', () => {
  const workflow = deriveV4WorkflowState({
    restoredReport: true,
    scanStatus: 'verified',
    verification,
    findingCount: 0,
    reviewReady: true,
    verifyReady: true,
    proofAvailable: false,
  });
  assert.equal(workflow.accessible.verify, true);
  assert.equal(workflow.accessible.export, true);
  assert.equal(workflow.accessible.publish, false);
  assert.equal(workflow.completion.scan, true);
});

test('successful proof preparation keeps the verified report and clears prior proof failure', () => {
  const state = acceptVerifiedReport(lifecycleState());
  state.proof.failure = { code: 'ReferenceError', stage: 'proof-initialization' };
  state.proof.envelope = { complete: true };
  state.proof.status = 'ready';
  transitionV4Lifecycle(state, 'proof-ready');
  assert.equal(state.scanStatus, 'verified');
  assert.equal(state.proof.status, 'ready');
  assert.equal(state.proof.failure, null);
  assert.deepEqual(state.proof.envelope, { complete: true });
});

test('runScan uses separate post-verification proof, persistence and history failure boundaries', () => {
  const source = fs.readFileSync(new URL('../apps/web/v4/ui.js', import.meta.url), 'utf8');
  const runScan = source.slice(source.indexOf('const runScan = async'), source.indexOf('const resetCurrentSession'));
  assert.match(runScan, /transitionV4Lifecycle\(state, 'report-verified'/u);
  assert.match(runScan, /transitionV4Lifecycle\(state, 'proof-failed'/u);
  assert.match(runScan, /transitionV4Lifecycle\(state, 'history-failed'/u);
  assert.match(runScan, /Verified V4 report ready/u);
  assert.doesNotMatch(runScan, /renderReport\(\); await initializeProof/u);
  const exportHandler = source.slice(source.indexOf("byId('v4-export').addEventListener"), source.indexOf("byId('v4-refresh-history').addEventListener"));
  assert.match(exportHandler, /!button \|\| !state\.verification/u);
  assert.doesNotMatch(exportHandler, /state\.proof\.envelope/u);
});
