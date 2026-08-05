import test from 'node:test'; import assert from 'node:assert/strict'; import { createWorkerScan } from '../../../packages/cli/src/index.js';
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
test('normal worker completion leaves no live child', async () => { const worker = createWorkerScan({ projectId: 'cleanup', sources: { 'A.sol': { content: 'pragma solidity 0.8.24; contract A {}' } } }); await worker.promise; await delay(100); let alive = false; try { process.kill(worker.pid, 0); alive = true; } catch {} assert.equal(alive, false); });
