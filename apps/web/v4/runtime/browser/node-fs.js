export function readFileSync() { throw Object.assign(new Error('Filesystem access is unavailable in the browser runtime.'), { code: 'WEB_V4_FILESYSTEM_UNAVAILABLE' }); }
