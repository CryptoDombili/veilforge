export const WEB_V4_FLAG = 'VEILFORGE_WEB_V4_ENABLED';
export const DEFAULT_WEB_V4_ENABLED = false;

export function parseWebV4BuildFlag(value) {
  if (value === undefined || value === null || value === '') return DEFAULT_WEB_V4_ENABLED;
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  throw new TypeError(`${WEB_V4_FLAG} must be true or false.`);
}

export function webV4Enabled(config = {}) {
  return config.WEB_V4_ENABLED === true;
}

export function selectWebRuntime({ enabled, v3Runtime, v4Runtime }) {
  if (!v3Runtime || !v4Runtime) throw new TypeError('Both runtime contracts are required.');
  return enabled === true ? v4Runtime : v3Runtime;
}
