import test from 'node:test';
import assert from 'node:assert/strict';
import { browserFilesToScanInput } from '../../../apps/web/v4/input-adapter.js';
import { browserFile, bytes } from './helpers.mjs';

const options = { projectId: 'project-1', projectName: 'Project', domains: ['arc-treasury', 'arc-payments'], compilerVersion: '0.8.24', policy: { policyId: 'p' }, taxonomy: { version: 1 }, analysisLimits: { maxEdges: 10 } };

test('valid browser files become deterministic V4 ScanInput', async () => {
  const input = await browserFilesToScanInput([browserFile('project/src\\B.sol'), browserFile('project/src/A.sol')], options);
  assert.deepEqual(Object.keys(input.sources), ['src/A.sol', 'src/B.sol']);
  assert.deepEqual(input.domains, ['arc-payments', 'arc-treasury']);
  assert.equal(input.compiler.version, '0.8.24');
  assert.equal(input.policy.policyId, 'p');
});
test('traversal and absolute paths are rejected', async () => {
  await assert.rejects(browserFilesToScanInput([browserFile('../Case.sol')], options), { code: 'WEB_V4_INPUT_INVALID' });
  await assert.rejects(browserFilesToScanInput([browserFile('C:\\Case.sol')], options), { code: 'WEB_V4_INPUT_INVALID' });
});
test('duplicate and case-fold collisions are rejected', async () => {
  await assert.rejects(browserFilesToScanInput([browserFile('project/src/A.sol'), browserFile('project/src/A.sol')], options), { code: 'WEB_V4_INPUT_INVALID' });
  await assert.rejects(browserFilesToScanInput([browserFile('project/src/A.sol'), browserFile('project/src/a.sol')], options), { code: 'WEB_V4_INPUT_INVALID' });
});
test('binary NUL and invalid UTF-8 are rejected', async () => {
  await assert.rejects(browserFilesToScanInput([browserFile('project/Case.sol', bytes([65, 0, 66]))], options), { code: 'WEB_V4_INPUT_INVALID' });
  await assert.rejects(browserFilesToScanInput([browserFile('project/Case.sol', bytes([0xc3, 0x28]))], options), { code: 'WEB_V4_INPUT_INVALID' });
});
test('file count, per-file and project limits are enforced', async () => {
  await assert.rejects(browserFilesToScanInput([browserFile('project/A.sol'), browserFile('project/B.sol')], { ...options, limits: { maxFileCount: 1 } }), { code: 'WEB_V4_INPUT_LIMIT' });
  await assert.rejects(browserFilesToScanInput([browserFile('project/A.sol', '1234')], { ...options, limits: { maxPerFileBytes: 3 } }), { code: 'WEB_V4_INPUT_LIMIT' });
  await assert.rejects(browserFilesToScanInput([browserFile('project/A.sol', '12'), browserFile('project/B.sol', '34')], { ...options, limits: { maxProjectBytes: 3 } }), { code: 'WEB_V4_INPUT_LIMIT' });
});
test('declared browser file size is checked before reading while actual bytes remain bounded', async () => {
  const makeFile = ({ size, data = 'contract Case {}' }) => {
    let reads = 0;
    return {
      file: { name: 'Case.sol', webkitRelativePath: 'project/Case.sol', ...(size === undefined ? {} : { size }), async arrayBuffer() { reads += 1; return new TextEncoder().encode(data).buffer; } },
      reads: () => reads,
    };
  };
  const oversized = makeFile({ size: 65, data: 'x' });
  await assert.rejects(browserFilesToScanInput([oversized.file], { ...options, limits: { maxPerFileBytes: 64 } }), { code: 'WEB_V4_INPUT_LIMIT' });
  assert.equal(oversized.reads(), 0);

  for (const size of [63, 64, undefined, Number.NaN]) {
    const candidate = makeFile({ size });
    await browserFilesToScanInput([candidate.file], { ...options, limits: { maxPerFileBytes: 64 } });
    assert.equal(candidate.reads(), 1);
  }

  const lying = makeFile({ size: 1, data: 'x'.repeat(65) });
  await assert.rejects(browserFilesToScanInput([lying.file], { ...options, limits: { maxPerFileBytes: 64 } }), { code: 'WEB_V4_INPUT_LIMIT' });
  assert.equal(lying.reads(), 1);
});
test('browser file aliases are rejected', async () => {
  const file = browserFile('project/Case.sol'); file.isSymbolicLink = true;
  await assert.rejects(browserFilesToScanInput([file], options), { code: 'WEB_V4_INPUT_INVALID' });
});
