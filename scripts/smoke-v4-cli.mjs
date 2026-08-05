import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const root = await mkdtemp(path.join(tmpdir(), 'veilforge-cli-smoke-'));
try {
  const output = path.join(root, 'export');
  const result = spawnSync(process.execPath, ['packages/cli/bin/veilforge.js', 'scan', '--project-id', 'cli-smoke', '--source', 'examples/cli/basic-scan/contracts', '--output', output, '--json'], { cwd: process.cwd(), encoding: 'utf8', timeout: 120_000 });
  if (result.status !== 0) throw new Error(`CLI smoke failed with exit ${result.status}.`);
  const parsed = JSON.parse(result.stdout); if (!parsed.ok || parsed.outputFiles.length !== 3) throw new Error('CLI smoke result is invalid.');
  console.log(JSON.stringify({ passed: true, status: parsed.status, outputFiles: parsed.outputFiles.length }));
} finally { await rm(root, { recursive: true, force: true }); }
