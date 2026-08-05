import { readFile } from 'node:fs/promises';
import { cliError } from './errors.js';

const KEYS = new Set(['schemaVersion', 'project-id', 'project-name', 'compiler-version', 'settings', 'policy', 'taxonomy', 'output', 'stage-timeout', 'global-timeout', 'domain', 'source', 'file', 'max-file-bytes', 'max-project-bytes', 'overwrite', 'json', 'quiet', 'no-progress', 'include-operational-metadata', 'no-export']);
export async function mergeExplicitConfig(options) {
  if (!options.config) return { ...options };
  try {
    const parsed = JSON.parse(await readFile(options.config, 'utf8'));
    if (!parsed || parsed.schemaVersion !== '1.0.0' || Object.keys(parsed).some((key) => !KEYS.has(key))) throw cliError('CLI_CONFIG_INVALID');
    const { schemaVersion: _schemaVersion, ...config } = parsed;
    return { ...config, ...options, config: undefined };
  } catch (error) { if (error instanceof Error && error.code === 'CLI_CONFIG_INVALID') throw error; throw cliError('CLI_CONFIG_INVALID'); }
}
