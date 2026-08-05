import { cliError } from './errors.js';

const BOOLEAN = new Set(['overwrite', 'json', 'quiet', 'no-progress', 'include-operational-metadata', 'no-export']);
const MULTI = new Set(['domain', 'source', 'file']);
const VALUE = new Set(['project-id', 'project-name', 'compiler-version', 'settings', 'policy', 'taxonomy', 'output', 'stage-timeout', 'global-timeout', 'config', 'max-file-bytes', 'max-project-bytes']);
const COMMANDS = new Set(['scan', 'verify-report', 'verify-export']);
export function parseArgs(argv) {
  const tokens = [...argv];
  if (!tokens.length || tokens[0] === '--help' || tokens[0] === '-h') return { command: 'help', options: {}, positionals: [] };
  if (tokens[0] === '--version' || tokens[0] === '-v') return { command: 'version', options: {}, positionals: [] };
  const command = tokens.shift(); if (!COMMANDS.has(command)) throw cliError('CLI_ARGUMENT_INVALID', { safeDetails: { reason: 'unknown-command' } });
  const options = {}; const positionals = [];
  while (tokens.length) {
    const token = tokens.shift();
    if (!token.startsWith('--')) { positionals.push(token); continue; }
    const name = token.slice(2); if (BOOLEAN.has(name)) { options[name] = true; continue; }
    if (!VALUE.has(name) && !MULTI.has(name)) throw cliError('CLI_ARGUMENT_INVALID', { safeDetails: { reason: 'unknown-option' } });
    const value = tokens.shift(); if (value === undefined || value.startsWith('--')) throw cliError('CLI_ARGUMENT_INVALID', { safeDetails: { reason: 'missing-option-value' } });
    if (MULTI.has(name)) (options[name] ??= []).push(value); else options[name] = value;
  }
  return { command, options, positionals };
}
