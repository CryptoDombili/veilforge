import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
test('example workflow uploads verified SARIF and preserves artifacts', async () => { const yaml = await readFile('examples/github-actions/veilforge.yml', 'utf8'); assert.match(yaml, /actions\/checkout@v4/); assert.match(yaml, /actions\/setup-node@v4/); assert.match(yaml, /github\/codeql-action\/upload-sarif@v3/); assert.match(yaml, /actions\/upload-artifact@v4/); assert.match(yaml, /steps\.veilforge\.outputs\.sarif-path/); });
