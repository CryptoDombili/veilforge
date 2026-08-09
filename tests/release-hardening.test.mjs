import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8').replace(/\r\n?/gu, '\n');
const yamlFiles = (directory) => fs.existsSync(directory) ? fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? yamlFiles(path.join(directory, entry.name)) : /\.ya?ml$/u.test(entry.name) ? [path.join(directory, entry.name)] : []) : [];
function unpinnedExternalActions(text, filename = '<fixture>') {
  const violations = [];
  for (const [index, line] of text.replace(/\r\n?/gu, '\n').split('\n').entries()) {
    const match = line.match(/^\s*(?:-\s*)?uses:\s*(?:"([^"]+)"|'([^']+)'|([^\s#]+))(?:\s+#.*)?$/u);
    if (!match) continue;
    const reference = match[1] ?? match[2] ?? match[3];
    if (reference.startsWith('./') || reference.startsWith('docker://')) continue;
    const separator = reference.lastIndexOf('@');
    const ref = separator < 0 ? '' : reference.slice(separator + 1);
    if (!/^[0-9a-f]{40}$/u.test(ref)) violations.push(`${filename}:${index + 1}: ${reference}`);
  }
  return violations;
}

test('reviewer release identities are explicit and compatibility-safe', async () => {
  const pkg = JSON.parse(read('package.json'));
  const version = await import('../apps/web/v4/version.js');
  const documents = [read('docs/RELEASE_STATUS.md'), read('SECURITY.md'), read('README.md')];
  assert.equal(pkg.version, '3.2.2');
  assert.equal(pkg.dependencies.solc, '0.8.24');
  assert.equal(pkg.overrides.tmp, '0.2.7');
  assert.equal(version.V4_PRODUCT_VERSION, '4.0.0-gc.1');
  assert.equal(version.V4_REPORT_VERSION, '4.1.0');
  for (const text of documents) {
    assert.match(text, /v4\.0\.0-gc\.2/u);
    assert.match(text, /4\.0\.0-gc\.1/u);
    assert.match(text, /4\.1\.0/u);
  }
  assert.doesNotMatch(documents[1], /actively validated release is `3\.2\.2`/u);
});

test('canonical grant build and verifier are explicit and fail closed', () => {
  const pkg = JSON.parse(read('package.json'));
  const build = read('scripts/build-grant-release.mjs');
  const verifier = read('scripts/verify-grant-release-artifact.mjs');
  assert.equal(pkg.scripts['build:grant-release'], 'node scripts/build-grant-release.mjs');
  assert.equal(pkg.scripts['verify:grant-release'], 'node scripts/verify-grant-release.mjs');
  assert.match(build, /manifest:check/u);
  assert.match(build, /VEILFORGE_WEB_V4_ENABLED = 'true'/u);
  assert.match(build, /dist-grant-release/u);
  for (const identity of ['4.0.0-gc.1', '4.1.0', 'veilforge.report.hash.v2']) assert.ok(verifier.includes(identity));
  assert.match(verifier, /ARC_MAINNET_UNRESOLVED/u);
});

test('checked-in dist is explicitly noncanonical and generated outputs stay excluded', () => {
  const marker = read('dist/README.md');
  assert.match(marker, /not the canonical V4 Grant Candidate reviewer artifact/u);
  assert.match(marker, /npm run build:grant-release/u);
  assert.match(read('.gitignore'), /dist-grant-release\//u);
  assert.match(read('scripts/release-manifest.mjs'), /'dist-grant-release'/u);
});

test('release browser policy executes the real supported matrix on V4 tags', () => {
  const workflow = read('.github/workflows/v4-web-cross-browser-acceptance.yml');
  for (const browser of ['chromium', 'firefox', 'webkit', 'edge']) assert.ok(workflow.includes(browser), `Missing browser: ${browser}`);
  assert.match(workflow, /tags:\n\s+- 'v4\.\*'/u);
  assert.match(workflow, /pull_request:[\s\S]*?branches:[\s\S]*?- main/u);
  assert.match(workflow, /push:[\s\S]*?branches:[\s\S]*?- main/u);

  assert.match(workflow, /npm run build:grant-release/u);
  assert.match(workflow, /node scripts\/smoke-web-v4-cross-browser\.mjs --browser=\$\{\{ matrix\.browser \}\}/u);
  assert.match(workflow, /edge:[\s\S]*?runs-on: windows-latest/u);
  assert.match(workflow, /npm run verify:grant-release-artifact/u);
  assert.match(workflow, /npm run smoke:grant-release-app/u);
});

test('repository-controlled external GitHub Actions are immutable while local actions remain allowed', () => {
  const candidates = [
    ...yamlFiles(path.join(root, '.github', 'workflows')),
    ...yamlFiles(path.join(root, 'action')),
    ...yamlFiles(path.join(root, 'examples', 'github-actions')),
    ...['action.yml', 'action.yaml'].map((name) => path.join(root, name)).filter(fs.existsSync),
  ];
  const violations = candidates.flatMap((filename) => unpinnedExternalActions(fs.readFileSync(filename, 'utf8'), path.relative(root, filename).replaceAll('\\', '/')));
  assert.deepEqual(violations, [], `Unpinned external GitHub Actions:\n${violations.join('\n')}`);
});

test('Action pinning regression rejects mutable refs without rejecting local actions or comments', () => {
  const sha = 'a'.repeat(40);
  assert.deepEqual(unpinnedExternalActions(`steps:\n  - uses: actions/checkout@${sha}\n  - uses: ./\n  - uses: ./action\n  # uses: actions/setup-node@v4\n`), []);
  assert.deepEqual(unpinnedExternalActions('steps:\n  - uses: actions/checkout@v4\n', 'mutable.yml'), ['mutable.yml:2: actions/checkout@v4']);
  assert.deepEqual(unpinnedExternalActions('steps:\n  - uses: owner/action@main\n', 'branch.yml'), ['branch.yml:2: owner/action@main']);
});

test('resolver security failures propagate through the release verifier and canonical gate', () => {
  const verifier = read('scripts/verify-grant-release.mjs');
  const gate = read('.github/workflows/v4-gc-release-gate.yml');
  const helper = read('scripts/lib/run-npm-commands.mjs');
  assert.match(verifier, /\['run', 'test:v4-project-resolver'\]/u);
  assert.match(gate, /name: Dedicated V4 resolver security suite\n\s+run: npm run test:v4-project-resolver/u);
  assert.doesNotMatch(gate, /continue-on-error:\s*true/u);
  assert.match(helper, /if \(result\.status !== 0\) process\.exit\(result\.status \?\? 1\)/u);

  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'veilforge-command-failure-'));
  try {
    const failingNpm = path.join(fixture, 'failing-npm.mjs');
    fs.writeFileSync(failingNpm, 'process.exit(7);\n');
    const helperUrl = pathToFileURL(path.join(root, 'scripts', 'lib', 'run-npm-commands.mjs')).href;
    const probe = spawnSync(process.execPath, ['--input-type=module', '--eval', `import { runNpmCommands } from '${helperUrl}'; runNpmCommands([['run','test:v4-project-resolver']]);`], { env: { ...process.env, npm_execpath: failingNpm }, encoding: 'utf8' });
    assert.equal(probe.status, 7, `${probe.stdout}\n${probe.stderr}`);
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

test('release manifest provenance is identity, not a forged verification assertion', () => {
  const build = read('scripts/build-web.mjs');
  assert.match(build, /releaseManifestMeaning: 'Digest identity/u);
  assert.doesNotMatch(build, /manifestVerified:\s*true/u);
  assert.match(read('docs/RELEASE_STATUS.md'), /does not prove that trusted CI verified/u);
});
