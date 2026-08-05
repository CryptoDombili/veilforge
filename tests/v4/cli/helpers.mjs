import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { runCli } from '../../../packages/cli/src/index.js';

export async function fixture(content = 'pragma solidity 0.8.24; contract Tiny { uint256 private value; }') {
  const root = await mkdtemp(path.join(tmpdir(), 'veilforge-cli-test-')); const contracts = path.join(root, 'contracts'); await mkdir(contracts); await writeFile(path.join(contracts, 'Tiny.sol'), content);
  return { root, contracts, output: path.join(root, 'export'), cleanup: () => rm(root, { recursive: true, force: true }) };
}
export async function capture(args, cwd) {
  let stdout = ''; let stderr = ''; const exitCode = await runCli(args, { cwd, stdout: (text) => { stdout += text; }, stderr: (text) => { stderr += text; } });
  return { exitCode, stdout, stderr };
}
export const baseArgs = (output) => ['scan', '--project-id', 'cli-test', '--source', 'contracts', '--output', output, '--json'];
export function spawnCli(args, options = {}) { return spawnSync(process.execPath, ['packages/cli/bin/veilforge.js', ...args], { cwd: process.cwd(), encoding: 'utf8', timeout: 120_000, ...options }); }
export async function exported(directory) { return { json: JSON.parse(await readFile(path.join(directory, 'veilforge-report-v4.json'), 'utf8')), markdown: await readFile(path.join(directory, 'veilforge-report-v4.md')), manifest: await readFile(path.join(directory, 'veilforge-export-manifest.json')) }; }
