import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('runtime manifest contains no host path, source fixture, or network/eval primitive', () => {
  const manifest = JSON.parse(fs.readFileSync('dist/v4/veilforge-v4-scanner.worker.manifest.json', 'utf8'));
  const text = manifest.generatedFiles.map((file) => fs.readFileSync(`dist/v4/${file}`, 'utf8')).join('\n');
  for (const forbidden of [process.cwd(), process.env.USERNAME, 'new Function', 'eval(', 'XMLHttpRequest', 'EventSource(', 'sendBeacon(', 'https://binaries.soliditylang.org']) if (forbidden) assert.equal(text.includes(forbidden), false);
  assert.equal(text.includes('contract Case'), false);
  assert.doesNotMatch(text, /from\s*['"]node:/u);
});
