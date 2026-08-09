import { runNpmCommands } from './lib/run-npm-commands.mjs';

runNpmCommands([
  ['run', 'test:release-hardening'],
  ['run', 'manifest:check'],
  ['audit', '--audit-level=low'],
  ['run', 'test:spec'],
  ['run', 'test:v4-action'],
  ['run', 'build:web-v4-runtime'],
  ['run', 'verify:web-v4-runtime'],
  ['run', 'test:web-v4-runtime'],
  ['run', 'test:web-v4-runtime-determinism'],
  ['run', 'test:v4-report'],
  ['run', 'test:v4-orchestration'],
  ['run', 'test:v4-benchmark'],
  ['run', 'benchmark:v4'],
  ['run', 'smoke:v4-release-gate'],
  ['run', 'test:v4-proof'],
  ['run', 'test:web-v4-proof-security'],
  ['run', 'test:web-v4-proof-arc-preflight'],
  ['run', 'test:web-v4-proof-transaction-acceptance'],
  ['run', 'test:grant-evidence'],
  ['run', 'test:mainnet-readiness'],
  ['run', 'build:grant-release'],
  ['run', 'verify:grant-release-artifact'],
]);

console.log('\nVeilForge V4 grant release verification completed successfully.');
