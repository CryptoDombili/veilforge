import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_WEB_V4_ENABLED, parseWebV4BuildFlag, selectWebRuntime, webV4Enabled } from '../../../apps/web/v4/feature-flags.js';
import { WEB_V4_ENABLED } from '../../../apps/web/config.js';

test('V4 feature flag defaults false', () => { assert.equal(DEFAULT_WEB_V4_ENABLED, false); assert.equal(WEB_V4_ENABLED, false); assert.equal(webV4Enabled({}), false); });
test('false selects unchanged V3 path and true selects only V4 path', () => {
  const v3 = { id: 'v3' }; const v4 = { id: 'v4' };
  assert.equal(selectWebRuntime({ enabled: false, v3Runtime: v3, v4Runtime: v4 }), v3);
  assert.equal(selectWebRuntime({ enabled: true, v3Runtime: v3, v4Runtime: v4 }), v4);
});
test('build flag accepts explicit values and rejects query-like values', () => {
  assert.equal(parseWebV4BuildFlag(undefined), false); assert.equal(parseWebV4BuildFlag('true'), true); assert.equal(parseWebV4BuildFlag('0'), false);
  assert.throws(() => parseWebV4BuildFlag('?v4=true'));
});
