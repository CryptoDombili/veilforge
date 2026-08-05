import test from 'node:test';
import assert from 'node:assert/strict';
import * as sdk from 'veilforge';
import * as scan from 'veilforge/scan';
import * as session from 'veilforge/session';
import * as verify from 'veilforge/verify';
import * as version from 'veilforge/version';

test('public package entrypoint exposes the supported API only', () => {
  for (const name of ['createVeilForgeClient', 'scanProject', 'createScanSession', 'runScanStage', 'runRemainingStages', 'getScanProgress', 'abortScan', 'verifyReport', 'verifyExportPackage', 'getExportFile', 'listExportFiles']) assert.equal(typeof sdk[name], 'function');
  assert.equal('compileProject' in sdk, false);
  assert.equal(typeof scan.scanProject, 'function');
  assert.equal(typeof session.createScanSession, 'function');
  assert.equal(typeof verify.verifyReport, 'function');
});

test('version fields are fixed and separate', () => {
  for (const name of ['sdkVersion', 'apiVersion', 'engineVersion', 'reportVersion']) assert.match(version[name], /^\d+\.\d+\.\d+/u);
  assert.equal(version.sdkVersion, sdk.sdkVersion);
});

test('package export map contains all supported subpaths', async () => {
  const pkg = JSON.parse(await (await import('node:fs/promises')).readFile('packages/sdk/package.json', 'utf8'));
  assert.deepEqual(Object.keys(pkg.exports), ['.', './scan', './session', './verify', './types', './version']);
});
