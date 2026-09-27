import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('example workflow uploads verified SARIF and preserves artifacts', async () => {
  const yaml = await readFile('examples/github-actions/veilforge.yml', 'utf8');
  assert.match(yaml, /actions\/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4\.4\.0/u);
  assert.match(yaml, /actions\/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4\.4\.0/u);
  assert.match(yaml, /github\/codeql-action\/upload-sarif@c4dd10e44af883a891fe31ced449bcb4a6728b9b # v3\.37\.6/u);
  assert.match(yaml, /actions\/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4\.6\.2/u);
  assert.match(yaml, /steps\.veilforge\.outputs\.sarif-path/u);
});
