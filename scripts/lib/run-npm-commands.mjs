import { spawnSync } from 'node:child_process';
import process from 'node:process';

export function runNpmCommands(commands) {
  const npmCli = process.env.npm_execpath;
  const command = npmCli ? process.execPath : process.platform === 'win32' ? 'npm.cmd' : 'npm';
  for (const args of commands) {
    const commandArgs = npmCli ? [npmCli, ...args] : args;
    console.log(`\n> ${command} ${commandArgs.join(' ')}`);
    const result = spawnSync(command, commandArgs, { stdio: 'inherit', shell: false });
    if (result.error) console.error(result.error.message);
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}
