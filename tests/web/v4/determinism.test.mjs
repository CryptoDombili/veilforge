import test from 'node:test';
import assert from 'node:assert/strict';
import { report } from '../../v4/report/helpers.mjs';
import { canonicalJson } from '../../../apps/web/v4/canonical.js';
import { createV4WebExport } from '../../../apps/web/v4/export-adapter.js';
import { browserFilesToScanInput } from '../../../apps/web/v4/input-adapter.js';
import { verifyV4Report } from '../../../apps/web/v4/report-adapter.js';
import { semanticScanPayload } from '../../../apps/web/v4/runtime/protocol.js';
import { createV4ViewModel } from '../../../apps/web/v4/view-models.js';
import { browserFile, bytes } from './helpers.mjs';

const options = { projectId: 'p', domains: ['arc-payments'], limits: { stageTimeoutMs: 10, globalTimeoutMs: 20 } };
test('LF, CRLF and BOM produce identical input DTO', async () => {
  const a = await browserFilesToScanInput([browserFile('src/Case.sol', 'contract X {}\n')], options);
  const b = await browserFilesToScanInput([browserFile('src/Case.sol', bytes([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('contract X {}\r\n')]))], options);
  assert.equal(canonicalJson(a), canonicalJson(b));
});
test('Windows and POSIX paths produce identical input DTO', async () => {
  const a = await browserFilesToScanInput([browserFile('src\\Case.sol')], options);
  const b = await browserFilesToScanInput([browserFile('src/Case.sol')], options);
  assert.equal(canonicalJson(a), canonicalJson(b));
});
test('object insertion order does not alter canonical semantic payload', () => {
  const left = semanticScanPayload({ projectId: 'p', sources: { 'A.sol': { content: 'x' } } }, { stageTimeoutMs: 1, globalTimeoutMs: 2 });
  const right = semanticScanPayload({ sources: { 'A.sol': { content: 'x' } }, projectId: 'p' }, { globalTimeoutMs: 2, stageTimeoutMs: 1 });
  assert.equal(canonicalJson(left), canonicalJson(right));
});
test('report adapter, view model and export bytes are deterministic', async () => {
  const firstVerification = await verifyV4Report(report()); const secondVerification = await verifyV4Report(report());
  const firstView = createV4ViewModel(firstVerification); const secondView = createV4ViewModel(secondVerification);
  const first = await createV4WebExport(firstVerification, firstView); const second = await createV4WebExport(secondVerification, secondView);
  assert.equal(canonicalJson(firstView), canonicalJson(secondView));
  assert.deepEqual(first.files.map((item) => [...item.bytes]), second.files.map((item) => [...item.bytes]));
});
