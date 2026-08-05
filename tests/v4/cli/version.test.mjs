import test from 'node:test'; import assert from 'node:assert/strict'; import { capture } from './helpers.mjs';
test('version exposes CLI SDK engine and report versions', async () => { const result = await capture(['--version']); assert.equal(result.exitCode, 0); for (const label of ['CLI', 'SDK', 'Engine', 'Report']) assert.match(result.stdout, new RegExp(label)); });
