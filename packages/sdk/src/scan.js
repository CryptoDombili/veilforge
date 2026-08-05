import { createScanSession, runRemainingStages } from './session.js';

export async function scanProject(input, options = {}, clientDefaults = {}) {
  const session = createScanSession(input, options, clientDefaults);
  return runRemainingStages(session);
}
