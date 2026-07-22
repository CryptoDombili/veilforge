import { spawnSync } from 'node:child_process';
import process from 'node:process';

const commands = [
  ['npm', ['run', 'build:web']],
  ['npm', ['run', 'test']],
  ['npm', ['run', 'typecheck']],
  ['npm', ['run', 'smoke:browser']],
];

for (const [command, args] of commands) {
  console.log(`\n> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log('\nVeilForge preflight completed successfully.');
