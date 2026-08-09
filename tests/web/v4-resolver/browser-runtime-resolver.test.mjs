import assert from 'node:assert/strict';
import test from 'node:test';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { browserFilesToScanInput } from '../../../apps/web/v4/input-adapter.js';
import { buildWebV4Runtime } from '../../../scripts/build-web-v4-runtime.mjs';

const pragma = 'pragma solidity 0.8.24; ';
const file = (virtualPath, content) => ({
  name: virtualPath.split('/').at(-1), webkitRelativePath: virtualPath,
  size: new TextEncoder().encode(content).byteLength, async text() { return content; },
});

test('built browser runtime preserves canonical package selection and structured resolver failures', async () => {
  const dist = await mkdtemp(path.join(tmpdir(), 'veilforge-browser-resolver-'));
  try {
    await cp('apps/web/v4', path.join(dist, 'v4'), { recursive: true });
    buildWebV4Runtime({ root: process.cwd(), dist });
    const module = await import(`${pathToFileURL(path.join(dist, 'v4/runtime/browser-scanner-entry.js')).href}?resolver-test`);
    const input = await browserFilesToScanInput([
      file('demo/contracts/Vault.sol', `${pragma}import "pkg/B.sol"; contract Vault is B {}`),
      file('demo/node_modules/pkg/B.sol', `${pragma}abstract contract B {}`),
    ], { projectId: 'browser-runtime-resolver', compilerVersion: '0.8.24' });
    const result = await module.VeilForgeV4BrowserRuntime.scanProject(input);
    assert.equal(result.status, 'completed');
    assert.equal(result.verification.verified, true);
    assert.equal(result.report.reportVersion, '4.1.0');

    await assert.rejects(module.VeilForgeV4BrowserRuntime.scanProject({
      projectId: 'nested-only',
      sources: {
        'src/A.sol': { content: `${pragma}import "pkg/B.sol"; contract A is B {}` },
        'vendor/node_modules/pkg/B.sol': { content: `${pragma}contract B {}` },
      },
      compiler: { version: '0.8.24' }, domains: ['arc-payments'],
    }), (error) => error.code === 'SCAN_STAGE_FAILED' && error.causeCode === 'MISSING_IMPORT' && error.stage === 'compilation');

    await assert.rejects(module.VeilForgeV4BrowserRuntime.scanProject({
      projectId: 'root-shadow-only',
      sources: {
        'src/A.sol': { content: `${pragma}import "pkg/B.sol"; contract A is B {}` },
        'pkg/B.sol': { content: `${pragma}contract B {}` },
      },
      compiler: { version: '0.8.24' }, domains: ['arc-payments'],
    }), (error) => error.code === 'SCAN_STAGE_FAILED' && error.causeCode === 'MISSING_IMPORT' && error.stage === 'compilation');

    const packageBeatsRootShadow = await module.VeilForgeV4BrowserRuntime.scanProject({
      projectId: 'package-beats-root-shadow',
      sources: {
        'src/A.sol': { content: `${pragma}import "pkg/B.sol"; contract A is B {}` },
        'pkg/B.sol': { content: 'not valid Solidity' },
        'node_modules/pkg/B.sol': { content: `${pragma}contract B {}` },
      },
      compiler: { version: '0.8.24' }, domains: ['arc-payments'],
    });
    assert.equal(packageBeatsRootShadow.status, 'completed');
    assert.equal(packageBeatsRootShadow.verification.verified, true);
    assert.equal(packageBeatsRootShadow.report.analysis.complete, true);
    assert.deepEqual(packageBeatsRootShadow.report.analysis.incompleteReasons, []);

    const rootWins = await module.VeilForgeV4BrowserRuntime.scanProject({
      projectId: 'root-wins',
      sources: {
        'src/A.sol': { content: `${pragma}import "pkg/B.sol"; contract A is B {}` },
        'node_modules/pkg/B.sol': { content: `${pragma}contract B {}` },
        'vendor/node_modules/pkg/B.sol': { content: 'not valid Solidity' },
      },
      compiler: { version: '0.8.24' }, domains: ['arc-payments'],
    });
    assert.equal(rootWins.status, 'completed');
    assert.equal(rootWins.verification.verified, true);

    await assert.rejects(module.VeilForgeV4BrowserRuntime.scanProject({
      projectId: 'invalid-context-remapping',
      sources: {
        'src/A.sol': { content: `${pragma}import "@oz/B.sol"; contract A is B {}` },
        'node_modules/@oz/B.sol': { content: `${pragma}contract B {}` },
        'lib/intended/B.sol': { content: `${pragma}contract B {}` },
      },
      settings: { remappings: ['src/:@oz/=lib/intended/'] },
      compiler: { version: '0.8.24' }, domains: ['arc-payments'],
    }), (error) => error.code === 'SCAN_STAGE_FAILED' && error.causeCode === 'INVALID_REMAPPING' && error.stage === 'compilation');
  } finally { await rm(dist, { recursive: true, force: true }); }
});
