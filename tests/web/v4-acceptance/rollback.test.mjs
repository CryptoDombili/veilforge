import test from 'node:test';
import assert from 'node:assert/strict';
import { selectWebRuntime } from '../../../apps/web/v4/feature-flags.js';
import { clearV4Reports, readV3Storage, V3_STORAGE_PREFIX, V4_STORAGE_PREFIX } from '../../../apps/web/v4/persistence.js';
import { memoryStorage } from '../v4/helpers.mjs';

test('rollback is a flag-only runtime selection', () => {
  assert.equal(selectWebRuntime({ enabled: true, v3Runtime: 'v3', v4Runtime: 'v4' }), 'v4');
  assert.equal(selectWebRuntime({ enabled: false, v3Runtime: 'v3', v4Runtime: 'v4' }), 'v3');
});
test('V3 never reads V4 history and V4 cleanup never removes V3 history', () => {
  const v3Key = `${V3_STORAGE_PREFIX}scan-history`; const storage = memoryStorage({ [v3Key]: '[{"id":"v3"}]', [`${V4_STORAGE_PREFIX}project`]: '{}' });
  assert.equal(readV3Storage(storage)[0].id, 'v3'); assert.equal(clearV4Reports(storage), 1); assert.equal(readV3Storage(storage)[0].id, 'v3');
});
