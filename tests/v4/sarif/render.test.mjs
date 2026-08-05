import test from 'node:test';
import assert from 'node:assert/strict';
import { report } from '../report/helpers.mjs';
import { renderSarif, SARIF_SCHEMA, SARIF_VERSION } from '../../../packages/sarif/src/index.js';

test('renders the supported SARIF 2.1.0 profile without source snippets', () => {
  const source = report(); const sarif = renderSarif(source); const run = sarif.runs[0];
  assert.equal(sarif.version, SARIF_VERSION); assert.equal(sarif.$schema, SARIF_SCHEMA); assert.equal(sarif.runs.length, 1);
  assert.equal(run.properties.reportHash, source.integrity.reportHash); assert.equal(run.results.length, 1); assert.equal(run.tool.driver.rules.length, 1);
  assert.equal(run.results[0].level, 'error'); assert.equal(run.results[0].properties.originalSeverity, source.findings[0].severity); assert.equal(run.results[0].properties.confidence, source.findings[0].confidence);
  assert.equal(JSON.stringify(sarif).includes('contract Case'), false); assert.equal(JSON.stringify(sarif).includes('snippet'), false);
});

test('emits safe artifacts, fingerprints, and a stable rule reference', () => {
  const result = renderSarif(report()).runs[0].results[0];
  assert.equal(result.ruleId, 'arc-payments.event-disclosure'); assert.equal(result.ruleIndex, 0);
  assert.equal(result.locations[0].physicalLocation.artifactLocation.uri, 'src/Case.sol');
  assert.ok(result.partialFingerprints.primaryLocationLineHash.startsWith('sha256:'));
  assert.ok(result.partialFingerprints['veilforge/v4/findingFingerprint']); assert.ok(result.partialFingerprints['veilforge/v4/occurrenceFingerprint'].startsWith('sha256:'));
  assert.ok(result.codeFlows[0].threadFlows[0].locations.length >= 2);
});
