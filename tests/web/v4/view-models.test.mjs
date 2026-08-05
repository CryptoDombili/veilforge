import test from 'node:test';
import assert from 'node:assert/strict';
import { report } from '../../v4/report/helpers.mjs';
import { verifyV4Report } from '../../../apps/web/v4/report-adapter.js';
import { createV4ViewModel } from '../../../apps/web/v4/view-models.js';

test('summary, finding, evidence and trace view models use supported V4 fields', async () => {
  const view = createV4ViewModel(await verifyV4Report(report()));
  assert.equal(view.summary.totalFindings, 1);
  assert.match(view.findings[0].detectorId, /^arc-payments/u);
  assert.ok(view.findings[0].evidence.length);
  assert.equal(view.findings[0].trace.steps.length, 3);
  assert.equal(view.integrity.verified, true);
});
test('incomplete state remains explicit', async () => {
  const value = report({ analysis: { statuses: { frontend: 'incomplete' }, incompleteReasons: [{ code: 'unsupported' }] } });
  const view = createV4ViewModel(await verifyV4Report(value));
  assert.equal(view.analysis.complete, false);
  assert.equal(view.analysis.incompleteReasons[0].code, 'unsupported');
});
test('V3-only product modules are marked legacy-only and never fabricated', async () => {
  const view = createV4ViewModel(await verifyV4Report(report()));
  for (const name of ['privacyGenome', 'attackLab', 'forgePlan', 'privacyPassport', 'proofPublication']) assert.deepEqual(view.legacyModules[name], { status: 'legacy-only', reason: 'unavailable-in-v4' });
  assert.equal('score' in view, false);
  assert.equal('grade' in view, false);
});
