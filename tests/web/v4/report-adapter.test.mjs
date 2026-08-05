import test from 'node:test';
import assert from 'node:assert/strict';
import { report, clone } from '../../v4/report/helpers.mjs';
import { verifyV4Report } from '../../../apps/web/v4/report-adapter.js';

test('valid report schema 4.1.0 and hash v2 is verified', async () => assert.equal((await verifyV4Report(report())).verified, true));
test('tampered report is rejected', async () => { const value = clone(report()); value.summary.totalFindings += 1; await assert.rejects(verifyV4Report(value), { code: 'WEB_V4_REPORT_UNVERIFIED' }); });
test('wrong schema is rejected and V3 is not accepted', async () => { const value = clone(report()); value.schemaVersion = '3.2'; await assert.rejects(verifyV4Report(value), { code: 'WEB_V4_REPORT_INVALID' }); });
test('stable detector ID is required', async () => { const value = clone(report()); value.findings[0].detectorId = ''; await assert.rejects(verifyV4Report(value), { code: 'WEB_V4_REPORT_INVALID' }); });
test('unsafe source locations are rejected before render', async () => { const value = clone(report()); value.findings[0].primaryLocation.sourcePath = '../secret.sol'; await assert.rejects(verifyV4Report(value), { code: 'WEB_V4_LOCATION_UNSAFE' }); });
