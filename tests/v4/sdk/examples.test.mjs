import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const examples = ['scan-project.mjs', 'staged-scan.mjs', 'scan-with-progress.mjs', 'scan-with-timeout.mjs'];
test('examples import the public API and execute successfully', async (t) => {
  for (const name of examples) await t.test(name, async () => {
    const file = `examples/sdk/${name}`; const source = await readFile(file, 'utf8');
    assert.match(source, /from 'veilforge(?:\/scan|\/session)?'/u); assert.equal(source.includes('packages/analyzer'), false);
    const result = spawnSync(process.execPath, [file], { encoding: 'utf8', timeout: 120_000 });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  });
});
