import test from 'node:test';
import assert from 'node:assert/strict';
import { scanProject } from 'veilforge';

const rejects = (input, code = 'SDK_INPUT_INVALID') => assert.rejects(() => scanProject(input), { code });
test('absolute and traversal paths are rejected', async () => {
  await rejects({ projectId: 'x', sources: { 'C:\\secret\\A.sol': { content: 'x' } } });
  await rejects({ projectId: 'x', sources: { '../A.sol': { content: 'x' } } });
});
test('empty, binary, control, and duplicate canonical sources are rejected', async () => {
  await rejects({ projectId: 'x', sources: {} });
  await rejects({ projectId: 'x', sources: { 'A.sol': Buffer.from('x') } });
  await rejects({ projectId: 'x', sources: { 'A\0.sol': { content: 'x' } } });
  await rejects({ projectId: 'x', sources: { 'a/A.sol': { content: 'x' }, 'a\\A.sol': { content: 'x' } } });
});
test('unsupported compiler and secret metadata are rejected', async () => {
  await rejects({ projectId: 'x', sources: { 'A.sol': { content: 'x' } }, compiler: { version: '0.8.25' } }, 'SDK_VERSION_UNSUPPORTED');
  await rejects({ projectId: 'x', sources: { 'A.sol': { content: 'x' } }, metadata: { apiToken: 'do-not-expose' } });
});
