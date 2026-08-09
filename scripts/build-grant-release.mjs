import process from 'node:process';
import { runNpmCommands } from './lib/run-npm-commands.mjs';

runNpmCommands([['run', 'manifest:check']]);
process.env.VEILFORGE_WEB_V4_ENABLED = 'true';
process.env.VEILFORGE_WEB_OUTPUT_DIR = 'dist-grant-release';
await import('./build-web.mjs');
await import('./verify-grant-release-artifact.mjs');
