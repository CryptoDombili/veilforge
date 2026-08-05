import test from 'node:test';
import assert from 'node:assert/strict';
import { VeilForgeV4BrowserRuntime } from './helpers.mjs';

const tiny = () => ({ projectId: 'runtime-tiny', sources: { 'src/Tiny.sol': { content: 'pragma solidity 0.8.24; contract Tiny { uint256 public value; }' } }, compiler: { version: '0.8.24' }, domains: ['arc-payments'] });
test('pre-aborted real scan produces no report', async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(() => VeilForgeV4BrowserRuntime.scanProject(tiny(), { signal: controller.signal }), { code: 'WEB_V4_ABORTED' });
});
test('real scan obeys stage timeout', async () => await assert.rejects(() => VeilForgeV4BrowserRuntime.scanProject(tiny(), { limits: { stageTimeoutMs: 1, globalTimeoutMs: 300_000 } }), { code: 'WEB_V4_TIMEOUT' }));
test('real scan obeys global timeout', async () => await assert.rejects(() => VeilForgeV4BrowserRuntime.scanProject(tiny(), { limits: { stageTimeoutMs: 120_000, globalTimeoutMs: 1 } }), { code: 'WEB_V4_TIMEOUT' }));
test('oversize projects are rejected before compilation', async () => {
  const sources = Object.fromEntries(Array.from({ length: 11 }, (_, index) => [`src/Large${index}.sol`, { content: `pragma solidity 0.8.24; contract Large${index} {} /*${'x'.repeat(510_000)}*/` }]));
  await assert.rejects(() => VeilForgeV4BrowserRuntime.scanProject({ ...tiny(), sources }), { code: 'WEB_V4_INPUT_LIMIT' });
});
test('small and medium projects complete', async () => {
  const small = await VeilForgeV4BrowserRuntime.scanProject(tiny());
  const medium = await VeilForgeV4BrowserRuntime.scanProject({ ...tiny(), projectId: 'runtime-medium', sources: { 'src/Medium.sol': { content: `pragma solidity 0.8.24; contract Medium { uint256 public value; } /*${'m'.repeat(400_000)}*/` } } });
  assert.equal(small.verification.verified, true); assert.equal(medium.verification.verified, true);
});
test('a project near the supported 1 MiB limit completes without a silent failure', async () => {
  const sources = Object.fromEntries(Array.from({ length: 2 }, (_, index) => [`src/Near${index}.sol`, { content: `pragma solidity 0.8.24; contract Near${index} { uint256 public value; } /*${String(index).repeat(480_000)}*/` }]));
  const result = await VeilForgeV4BrowserRuntime.scanProject({ ...tiny(), projectId: 'runtime-near-limit', sources });
  assert.equal(result.verification.verified, true);
  assert.equal(result.report.compiler.sourceUnitIds.length, 2);
});
