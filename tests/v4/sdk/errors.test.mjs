import test from 'node:test';
import assert from 'node:assert/strict';
import { scanProject, VeilForgeSdkError } from 'veilforge';

test('SDK errors are structured and never echo source or absolute path', async () => {
  const source = 'private-source-marker'; const absolute = 'C:\\private\\Secret.sol';
  await assert.rejects(() => scanProject({ projectId: 'x', sources: { [absolute]: { content: source } } }), (error) => {
    assert.equal(error instanceof VeilForgeSdkError, true);
    for (const key of ['name', 'code', 'message', 'stage', 'retryable', 'causeCode', 'incompleteReasons', 'partialResult', 'safeDetails']) assert.equal(key in error, true);
    const text = JSON.stringify(error); return !text.includes(source) && !text.includes(absolute);
  });
});
