import { createHash, randomUUID } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SOURCE_ROOTS = Object.freeze([
  '.github', 'action', 'apps', 'contracts', 'deployment', 'docs', 'examples',
  'packages', 'schemas', 'scripts', 'tests',
]);

function git(root, args, options = {}) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', ...options }).replace(/\r\n?/gu, '\n');
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function sanitizeGitDiagnosticPath(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/gu, '?')
    .replace(/(https?:\/\/)[^/@\s]+@/giu, '$1[redacted]@')
    .replace(/\b(api[_-]?key|access[_-]?token|token|secret|password|credential|private[_-]?key|mnemonic|seed[_-]?phrase)=([^/\\\s"]+)/giu, '$1=[redacted]')
    .replace(/(?:ghp_|github_pat_|glpat-|xox[baprs]-|sk_(?:live|test)_)[A-Za-z0-9_-]+/giu, '[redacted-token]');
}

function gitPathRecords(value, code) {
  return String(value ?? '').split('\n').map((line) => line.trim()).filter(Boolean)
    .map((relativePath) => ({ code, relativePath: sanitizeGitDiagnosticPath(relativePath) }));
}

function dirtyCheckoutMessage({ status, unstaged, staged, untracked }) {
  const statusRecords = String(status ?? '').split('\n').map((line) => line.trimEnd()).filter(Boolean)
    .filter((line) => line.length >= 4)
    .map((line) => ({ code: line.slice(0, 2), relativePath: sanitizeGitDiagnosticPath(line.slice(3)) }));
  const fallbackRecords = [
    ...gitPathRecords(unstaged, ' M'),
    ...gitPathRecords(staged, 'M '),
    ...gitPathRecords(untracked, '??'),
  ];
  const records = statusRecords.length > 0 ? statusRecords : fallbackRecords;
  const unique = [...new Map(records.map((record) => [`${record.code}\0${record.relativePath}`, record])).values()];
  return `Production checkout dirty:\n${unique.map(({ code, relativePath }) => `${code} ${relativePath}`).join('\n')}`;
}

function listArtifactFiles(directory) {
  const files = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) files.push(path.relative(directory, full).replaceAll(path.sep, '/'));
      else throw new Error(`Production artifact contains an unsupported filesystem entry: ${entry.name}`);
    }
  };
  walk(directory);
  return files;
}

export function productionArtifactDigest(directory) {
  if (!fs.statSync(directory, { throwIfNoEntry: false })?.isDirectory()) throw new Error('Production artifact directory is missing.');
  const files = listArtifactFiles(directory);
  const digest = createHash('sha256');
  for (const relative of files) {
    digest.update(relative);
    digest.update('\0');
    digest.update(fs.readFileSync(path.join(directory, relative)));
    digest.update('\0');
  }
  return Object.freeze({ artifactDigest: `sha256:${digest.digest('hex')}`, fileCount: files.length, files: Object.freeze(files) });
}

export function assertProductionArtifactMatchesTrustedSnapshot(actualDirectory, trustedDirectory) {
  const actual = productionArtifactDigest(actualDirectory);
  const trusted = productionArtifactDigest(trustedDirectory);
  if (actual.fileCount !== trusted.fileCount || actual.artifactDigest !== trusted.artifactDigest
    || actual.files.some((file, index) => file !== trusted.files[index])) {
    throw new Error('Production artifact does not match the independently rebuilt trusted source snapshot.');
  }
  return Object.freeze({ expectedArtifactDigest: trusted.artifactDigest, expectedFileCount: trusted.fileCount });
}

export function productionSourceTreeDigest(root, commit) {
  const tree = execFileSync('git', ['ls-tree', '-r', '--full-tree', '-z', commit], { cwd: root, encoding: 'buffer' });
  if (tree.length === 0) throw new Error('Production source tree is empty.');
  return sha256(tree);
}

export function committedFileDigest(root, commit, relativePath) {
  const bytes = execFileSync('git', ['show', `${commit}:${relativePath}`], { cwd: root, encoding: 'buffer' });
  return sha256(bytes);
}

export function assertProductionCheckout(root, environment = process.env) {
  const head = git(root, ['rev-parse', 'HEAD']).trim();
  const expectedCommit = environment.VERCEL_GIT_COMMIT_SHA || environment.GITHUB_SHA || head;
  if (!/^[0-9a-f]{40}$/u.test(expectedCommit) || expectedCommit !== head) {
    throw new Error('Production build requires the exact checked-out source commit SHA.');
  }

  const dirty = git(root, ['status', '--porcelain=v1', '--untracked-files=all']).trimEnd();
  const unstaged = git(root, ['diff', '--name-only']).trimEnd();
  const staged = git(root, ['diff', '--cached', '--name-only']).trimEnd();
  const untracked = git(root, ['ls-files', '--others', '--exclude-standard']).trimEnd();
  if (dirty) throw new Error(dirtyCheckoutMessage({ status: dirty, unstaged, staged, untracked }));

  const ignored = git(root, ['ls-files', '--others', '--ignored', '--exclude-standard', '--', ...SOURCE_ROOTS])
    .split('\n').map((item) => item.trim()).filter(Boolean);
  if (ignored.length) throw new Error(`Production build rejects ignored source overrides: ${ignored[0]}`);

  for (const sourceRoot of SOURCE_ROOTS) {
    const shadow = path.join(root, sourceRoot, 'node_modules');
    if (fs.existsSync(shadow)) throw new Error(`Production build rejects source-tree shadow modules: ${sourceRoot}/node_modules`);
  }

  return Object.freeze({
    sourceCommit: head,
    sourceTreeDigest: productionSourceTreeDigest(root, head),
    packageLockDigest: committedFileDigest(root, head, 'package-lock.json'),
    releaseManifestDigest: committedFileDigest(root, head, 'RELEASE_MANIFEST.sha256'),
  });
}

export function assertProductionArtifactProvenance({ build, metadata, attestation }, provenance) {
  if (!build || !metadata || !attestation || !provenance) throw new Error('Production provenance evidence is incomplete.');
  for (const evidence of [build, metadata, attestation]) {
    if (evidence.sourceCommit !== provenance.sourceCommit
      || evidence.sourceTreeDigest !== provenance.sourceTreeDigest
      || evidence.packageLockDigest !== provenance.packageLockDigest) {
      throw new Error('Production artifact source commit binding is invalid.');
    }
  }
  if (metadata.releaseManifestDigest !== provenance.releaseManifestDigest
    || attestation.releaseManifestDigest !== provenance.releaseManifestDigest) {
    throw new Error('Production artifact release manifest digest is invalid.');
  }
  if (build.buildProfile !== 'arc-mainnet-production' || metadata.verificationCommand !== 'npm run verify:arc-mainnet-production'
    || attestation.sourceSnapshot !== 'git-archive-v1' || attestation.dependencyInstall !== 'npm-ci-lockfile') {
    throw new Error('Production artifact build profile provenance is invalid.');
  }
  return true;
}

export function assertFreshProductionOutput(root, outputDirectory = 'dist-mainnet-production') {
  const destination = path.resolve(root, outputDirectory);
  if (path.dirname(destination) !== path.resolve(root) || path.basename(destination) !== outputDirectory) {
    throw new Error('Production output path is invalid.');
  }
  if (fs.existsSync(destination) && fs.readdirSync(destination).length > 0) {
    throw new Error('Production build rejects a stale production output directory.');
  }
  if (fs.existsSync(destination)) fs.rmdirSync(destination);
  return destination;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: false, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status ?? 'unknown'}.`);
}

function buildTrustedSnapshotOutput({ root, outputDirectory, environment, provenance }) {
  const snapshot = createProductionSnapshot(root, provenance);
  try {
    const npmCli = environment.npm_execpath;
    const npmCommand = npmCli ? process.execPath : process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const npmArguments = npmCli
      ? [npmCli, 'ci', '--ignore-scripts', '--no-audit', '--no-fund']
      : ['ci', '--ignore-scripts', '--no-audit', '--no-fund'];
    run(npmCommand, npmArguments, { cwd: snapshot });
    run(process.execPath, ['scripts/release-manifest.mjs', '--check'], { cwd: snapshot });
    run(process.execPath, ['scripts/build-web.mjs'], {
      cwd: snapshot,
      env: {
        ...environment,
        VEILFORGE_BUILD_PROFILE: 'arc-mainnet-production',
        VEILFORGE_PROOF_NETWORK: 'arc-mainnet',
        VEILFORGE_WEB_V4_ENABLED: 'true',
        VEILFORGE_WEB_OUTPUT_DIR: outputDirectory,
        VEILFORGE_PRODUCTION_SNAPSHOT: 'git-archive-v1',
        VEILFORGE_TRUSTED_SOURCE_COMMIT: provenance.sourceCommit,
        VEILFORGE_TRUSTED_SOURCE_TREE_DIGEST: provenance.sourceTreeDigest,
        VEILFORGE_TRUSTED_PACKAGE_LOCK_DIGEST: provenance.packageLockDigest,
      },
    });
    const snapshotOutput = path.join(snapshot, outputDirectory);
    if (!fs.existsSync(path.join(snapshotOutput, 'production-attestation.json'))) throw new Error('Trusted snapshot did not produce a production attestation.');
    return { snapshot, snapshotOutput };
  } catch (error) {
    fs.rmSync(snapshot, { recursive: true, force: true });
    throw error;
  }
}

export function createProductionSnapshot(root, provenance) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'veilforge-production-source-'));
  const archive = execFileSync('git', ['archive', '--format=tar', provenance.sourceCommit], { cwd: root, encoding: 'buffer', maxBuffer: 256 * 1024 * 1024 });
  const tar = process.platform === 'win32' ? 'tar.exe' : 'tar';
  const extracted = spawnSync(tar, ['-xf', '-'], { cwd: temporaryRoot, input: archive, stdio: ['pipe', 'inherit', 'inherit'], shell: false });
  if (extracted.error || extracted.status !== 0) {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
    throw extracted.error ?? new Error('Trusted Git archive extraction failed.');
  }
  if (fs.existsSync(path.join(temporaryRoot, '.git'))) {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
    throw new Error('Production snapshot unexpectedly contains Git working-tree state.');
  }
  return temporaryRoot;
}

export function buildProductionSnapshot({ root, outputDirectory = 'dist-mainnet-production', environment = process.env } = {}) {
  const provenance = assertProductionCheckout(root, environment);
  const destination = assertFreshProductionOutput(root, outputDirectory);
  const { snapshot, snapshotOutput } = buildTrustedSnapshotOutput({ root, outputDirectory, environment, provenance });
  try {
    const staging = path.join(root, `.${outputDirectory}-staging-${randomUUID()}`);
    try { fs.renameSync(snapshotOutput, staging); }
    catch (error) {
      if (error?.code !== 'EXDEV') throw error;
      fs.cpSync(snapshotOutput, staging, { recursive: true, force: false, errorOnExist: true });
    }
    fs.renameSync(staging, destination);
    return provenance;
  } finally {
    fs.rmSync(snapshot, { recursive: true, force: true });
  }
}

export function verifyProductionArtifactAgainstTrustedSnapshot({ root, outputDirectory = 'dist-mainnet-production', environment = process.env } = {}) {
  const provenance = assertProductionCheckout(root, environment);
  const actualOutput = path.join(root, outputDirectory);
  const { snapshot, snapshotOutput } = buildTrustedSnapshotOutput({ root, outputDirectory, environment, provenance });
  try {
    return Object.freeze({ provenance, ...assertProductionArtifactMatchesTrustedSnapshot(actualOutput, snapshotOutput) });
  } finally {
    fs.rmSync(snapshot, { recursive: true, force: true });
  }
}

export const PRODUCTION_SOURCE_ROOTS = SOURCE_ROOTS;
