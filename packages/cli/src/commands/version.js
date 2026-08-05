import { sdkVersion, engineVersion, reportVersion } from '../../../sdk/src/version.js';
export const cliVersion = '4.0.0-gc.1';
export function versionInfo() { return Object.freeze({ cliVersion, sdkVersion, engineVersion, reportVersion }); }
export function versionText() { const value = versionInfo(); return `CLI ${value.cliVersion}\nSDK ${value.sdkVersion}\nEngine ${value.engineVersion}\nReport ${value.reportVersion}\n`; }
