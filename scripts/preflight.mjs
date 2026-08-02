import { spawnSync } from 'node:child_process';
import process from 'node:process';

const npmCli = process.env.npm_execpath;
const npmCommand = npmCli ? process.execPath : process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npmArgs = (args) => npmCli ? [npmCli, ...args] : args;
const commands = [
  [npmCommand, npmArgs(['run', 'build:web'])],
  [npmCommand, npmArgs(['run', 'test'])],
  [npmCommand, npmArgs(['run', 'typecheck'])],
  [process.execPath, ['scripts/smoke-browser.mjs']],
  [npmCommand, npmArgs(['run', 'manifest:check'])],
];

for (const [command, args] of commands) {
  console.log(`\n> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { stdio: 'inherit', shell: false });
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log('\nVeilForge preflight completed successfully.');
