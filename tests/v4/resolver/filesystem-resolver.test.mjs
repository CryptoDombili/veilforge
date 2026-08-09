import assert from 'node:assert/strict';
import test from 'node:test';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { discoverProject } from '../../../packages/cli/src/source-discovery.js';
import { runCli } from '../../../packages/cli/src/index.js';
import { compileProject } from '../../../packages/analyzer/src/v4/frontend/index.js';
import { browserFilesToScanInput } from '../../../apps/web/v4/input-adapter.js';

const fixtureRoot = path.resolve('tests/fixtures/resolver');
async function temporaryFixture(name) {
  const root = await mkdtemp(path.join(tmpdir(), `veilforge-resolver-${name}-`));
  await cp(path.join(fixtureRoot, name), root, { recursive: true });
  if (name === 'hardhat') {
    await cp(path.join(root, 'package-sources'), path.join(root, 'node_modules'), { recursive: true });
    await rm(path.join(root, 'package-sources'), { recursive: true, force: true });
  }
  return { root, cleanup: () => rm(root, { recursive: true, force: true }) };
}
async function scan(root, id) {
  let stdout = ''; let stderr = '';
  const exitCode = await runCli(['scan', '--project-id', id, '--source', '.', '--no-export', '--json'], { cwd: root, stdout: (value) => { stdout += value; }, stderr: (value) => { stderr += value; } });
  return { exitCode, stdout: JSON.parse(stdout), stderr };
}
function browserFile(pathname, content) {
  return { name: pathname.split('/').at(-1), webkitRelativePath: pathname, async text() { return content; } };
}

for (const name of ['hardhat', 'foundry', 'relative']) test(`real ${name} fixture resolves, compiles, and scans`, async () => {
  const fixture = await temporaryFixture(name);
  try {
    const project = await discoverProject({ source: ['.'], cwd: fixture.root });
    assert.equal(compileProject({ sources: project.sources, settings: project.settings }).result.status, 'compiled');
    const result = await scan(fixture.root, `resolver-${name}`);
    assert.equal(result.exitCode, 0, JSON.stringify(result.stdout));
    assert.equal(result.stdout.status, 'completed');
  } finally { await fixture.cleanup(); }
});

test('missing transitive dependency returns a structured fail-closed result', async () => {
  const fixture = await temporaryFixture('relative');
  try {
    await rm(path.join(fixture.root, 'src/lib/nested/Math.sol'));
    await assert.rejects(discoverProject({ source: ['.'], cwd: fixture.root }), (error) => error.code === 'CLI_SOURCE_INVALID' && error.causeCode === 'MISSING_IMPORT');
  } finally { await fixture.cleanup(); }
});

test('malicious remapping escape is rejected before dependency reads', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'veilforge-resolver-remap-'));
  try {
    await mkdir(path.join(root, 'src'));
    await writeFile(path.join(root, 'src/A.sol'), 'pragma solidity 0.8.24; import "evil/A.sol"; contract A {}');
    await writeFile(path.join(root, 'remappings.txt'), 'evil/=../../outside/\n');
    await assert.rejects(discoverProject({ source: ['.'], cwd: root }), (error) => error.code === 'CLI_SOURCE_INVALID' && error.causeCode === 'INVALID_REMAPPING');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('dependency symlink escaping the project root fails closed', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'veilforge-resolver-symlink-'));
  const outside = await mkdtemp(path.join(tmpdir(), 'veilforge-resolver-outside-'));
  try {
    await mkdir(path.join(root, 'src')); await mkdir(path.join(root, 'node_modules'), { recursive: true });
    await writeFile(path.join(root, 'src/A.sol'), 'pragma solidity 0.8.24; import "evil/Secret.sol"; contract A {}');
    await writeFile(path.join(outside, 'Secret.sol'), 'pragma solidity 0.8.24; contract Secret {}');
    try { await symlink(outside, path.join(root, 'node_modules/evil'), process.platform === 'win32' ? 'junction' : 'dir'); }
    catch { t.skip('Symlink creation is unavailable on this platform.'); return; }
    await assert.rejects(discoverProject({ source: ['.'], cwd: root }), (error) => error.code === 'CLI_SOURCE_INVALID' && error.causeCode === 'SYMLINK_ESCAPE');
  } finally { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
});

test('filesystem resolver never searches parent or global node_modules', async () => {
  const parent = await mkdtemp(path.join(tmpdir(), 'veilforge-resolver-parent-'));
  const root = path.join(parent, 'project');
  try {
    await mkdir(path.join(root, 'src'), { recursive: true }); await mkdir(path.join(parent, 'node_modules/pkg'), { recursive: true });
    await writeFile(path.join(root, 'src/A.sol'), 'pragma solidity 0.8.24; import "pkg/OnlyParent.sol"; contract A {}');
    await writeFile(path.join(parent, 'node_modules/pkg/OnlyParent.sol'), 'pragma solidity 0.8.24; contract OnlyParent {}');
    await assert.rejects(discoverProject({ source: ['.'], cwd: root }), (error) => error.causeCode === 'MISSING_IMPORT');
  } finally { await rm(parent, { recursive: true, force: true }); }
});

test('CLI and browser collectors produce identical canonical dependency closure for every selected root name', async () => {
  const fixture = await temporaryFixture('hardhat');
  try {
    const cli = await discoverProject({ source: ['.'], cwd: fixture.root });
    const contract = await readFile(path.join(fixture.root, 'contracts/Vault.sol'), 'utf8');
    const ownable = await readFile(path.join(fixture.root, 'node_modules/@openzeppelin/contracts/access/Ownable.sol'), 'utf8');
    const context = await readFile(path.join(fixture.root, 'node_modules/@openzeppelin/contracts/utils/Context.sol'), 'utf8');
    for (const selectedRoot of ['demo', 'project', 'foo-bar']) {
      const browser = await browserFilesToScanInput([
        browserFile(`${selectedRoot}/contracts/Vault.sol`, contract),
        browserFile(`${selectedRoot}/node_modules/@openzeppelin/contracts/access/Ownable.sol`, ownable),
        browserFile(`${selectedRoot}/node_modules/@openzeppelin/contracts/utils/Context.sol`, context),
      ], { projectId: 'collector-parity', compilerVersion: '0.8.24' });
      assert.deepEqual(browser.sources, cli.sources);
      assert.deepEqual(browser.settings, cli.settings);
      const cliCompilation = compileProject({ sources: cli.sources, settings: cli.settings }).result;
      const browserCompilation = compileProject({ sources: browser.sources, settings: browser.settings }).result;
      assert.equal(browserCompilation.canonicalSourceHash, cliCompilation.canonicalSourceHash);
      assert.equal(browserCompilation.compilerInputHash, cliCompilation.compilerInputHash);
    }
  } finally { await fixture.cleanup(); }
});

test('unsupported contextual remapping fails closed in the real CLI collector with all candidate combinations', async () => {
  for (const [index, candidates] of [[], ['lib'], ['node_modules'], ['lib', 'node_modules']].entries()) {
    const root = await mkdtemp(path.join(tmpdir(), `veilforge-resolver-context-${index}-`));
    try {
      await mkdir(path.join(root, 'src'));
      await writeFile(path.join(root, 'src/A.sol'), 'pragma solidity 0.8.24; import "@oz/B.sol"; contract A is B {}');
      await writeFile(path.join(root, 'remappings.txt'), 'src/:@oz/=lib/intended/\n');
      if (candidates.includes('lib')) { await mkdir(path.join(root, 'lib/intended'), { recursive: true }); await writeFile(path.join(root, 'lib/intended/B.sol'), 'pragma solidity 0.8.24; contract B {}'); }
      if (candidates.includes('node_modules')) { await mkdir(path.join(root, 'node_modules/@oz'), { recursive: true }); await writeFile(path.join(root, 'node_modules/@oz/B.sol'), 'pragma solidity 0.8.24; contract B {}'); }
      await assert.rejects(discoverProject({ source: ['.'], cwd: root }), (error) => error.code === 'CLI_SOURCE_INVALID' && error.causeCode === 'INVALID_REMAPPING');
    } finally { await rm(root, { recursive: true, force: true }); }
  }
});

test('filesystem seed byte budget accepts limit boundaries and stops before decoding the first over-budget file', async () => {
  async function boundary(size, limit) {
    const root = await mkdtemp(path.join(tmpdir(), 'veilforge-resolver-budget-'));
    try {
      await mkdir(path.join(root, 'src'));
      await writeFile(path.join(root, 'src/A.sol'), ' '.repeat(size));
      return await discoverProject({ source: ['.'], cwd: root, maxProjectBytes: limit });
    } finally { await rm(root, { recursive: true, force: true }); }
  }
  await boundary(127, 128);
  await boundary(128, 128);
  await assert.rejects(boundary(129, 128), (error) => error.code === 'CLI_SOURCE_LIMIT_EXCEEDED' && error.causeCode === 'LIMIT_EXCEEDED');

  const root = await mkdtemp(path.join(tmpdir(), 'veilforge-resolver-budget-many-'));
  try {
    await mkdir(path.join(root, 'src'));
    await writeFile(path.join(root, 'src/A.sol'), 'a'.repeat(64));
    await writeFile(path.join(root, 'src/B.sol'), 'b'.repeat(64));
    await writeFile(path.join(root, 'src/C.sol'), Buffer.from([0]));
    await assert.rejects(discoverProject({ source: ['.'], cwd: root, maxFileBytes: 64, maxProjectBytes: 128 }),
      (error) => error.code === 'CLI_SOURCE_LIMIT_EXCEEDED' && error.causeCode === 'LIMIT_EXCEEDED');
  } finally { await rm(root, { recursive: true, force: true }); }

  const dependencyRoot = await mkdtemp(path.join(tmpdir(), 'veilforge-resolver-budget-dependency-'));
  try {
    await mkdir(path.join(dependencyRoot, 'src')); await mkdir(path.join(dependencyRoot, 'node_modules/pkg'), { recursive: true });
    const base = 'pragma solidity 0.8.24; import "pkg/B.sol"; contract A {}';
    await writeFile(path.join(dependencyRoot, 'src/A.sol'), base + ' '.repeat(128 - Buffer.byteLength(base)));
    await writeFile(path.join(dependencyRoot, 'node_modules/pkg/B.sol'), Buffer.from([0]));
    await assert.rejects(discoverProject({ source: ['.'], cwd: dependencyRoot, maxFileBytes: 128, maxProjectBytes: 128 }),
      (error) => error.code === 'CLI_SOURCE_LIMIT_EXCEEDED' && error.causeCode === 'LIMIT_EXCEEDED');
  } finally { await rm(dependencyRoot, { recursive: true, force: true }); }
});

test('seed file and nested source-directory symlinks fail closed before source reads', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'veilforge-resolver-seed-symlink-'));
  const outside = await mkdtemp(path.join(tmpdir(), 'veilforge-resolver-seed-outside-'));
  try {
    await mkdir(path.join(root, 'src')); await writeFile(path.join(root, 'src/Safe.sol'), 'pragma solidity 0.8.24; contract Safe {}');
    await writeFile(path.join(outside, 'Secret.sol'), 'pragma solidity 0.8.24; contract Secret {}');
    try { await symlink(outside, path.join(root, 'src/nested'), process.platform === 'win32' ? 'junction' : 'dir'); }
    catch { t.skip('Symlink creation is unavailable on this platform.'); return; }
    await assert.rejects(discoverProject({ file: ['src/nested/Secret.sol'], cwd: root }), (error) => error.causeCode === 'SYMLINK_ESCAPE');
    await assert.rejects(discoverProject({ source: ['.'], cwd: root }), (error) => error.causeCode === 'SYMLINK_ESCAPE');
  } finally { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
});
