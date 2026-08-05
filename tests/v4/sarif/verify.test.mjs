import test from 'node:test';
import assert from 'node:assert/strict';
import { report } from '../report/helpers.mjs';
import { canonicalSarifJson, renderSarif, renderSarifJson, safeArtifactUri, verifySarif } from '../../../packages/sarif/src/index.js';

test('verifies canonical bytes and report-hash binding', () => {
  const source = report(); const text = renderSarifJson(source); const result = verifySarif(JSON.parse(text), { reportHash: source.integrity.reportHash, canonicalBytes: text });
  assert.equal(result.verified, true); assert.equal(result.resultCount, 1); assert.equal(text, canonicalSarifJson(JSON.parse(text)));
});
test('rejects unsafe URIs, missing rules, fingerprints, and wrong report hash', () => {
  for (const uri of ['../secret.sol', '/tmp/Case.sol', 'C:\\Case.sol', 'file:///Case.sol']) assert.throws(() => safeArtifactUri(uri), { code: 'SARIF_LOCATION_UNSAFE' });
  const unknownRule = renderSarif(report()); unknownRule.runs[0].results[0].ruleId = 'unknown'; assert.throws(() => verifySarif(unknownRule), { code: 'SARIF_RULE_INVALID' });
  const missingFingerprint = renderSarif(report()); delete missingFingerprint.runs[0].results[0].partialFingerprints['veilforge/v4/occurrenceFingerprint']; assert.throws(() => verifySarif(missingFingerprint), { code: 'SARIF_RESULT_INVALID' });
  assert.throws(() => verifySarif(renderSarif(report()), { reportHash: 'sha256:wrong' }), { code: 'SARIF_INTEGRITY_MISMATCH' });
});
