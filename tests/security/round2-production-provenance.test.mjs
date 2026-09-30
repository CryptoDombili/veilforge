import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { assertFreshProductionOutput, assertProductionArtifactMatchesTrustedSnapshot, assertProductionArtifactProvenance, assertProductionCheckout, createProductionSnapshot } from '../../scripts/lib/production-provenance.mjs';

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'veilforge-provenance-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'apps', 'web'), { recursive: true });
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules/\n.vercel/\ndist-mainnet-production/\n*.ignored.js\n');
  fs.writeFileSync(path.join(root, 'apps', 'web', 'app.js'), 'export const trusted = true;\n');
  fs.writeFileSync(path.join(root, 'scripts', 'trusted.mjs'), 'export const trusted = true;\n');
  fs.writeFileSync(path.join(root, 'package-lock.json'), '{"lockfileVersion":3}\n');
  fs.writeFileSync(path.join(root, 'RELEASE_MANIFEST.sha256'), 'trusted  apps/web/app.js\n');
  fs.writeFileSync(path.join(root, 'vercel.json'), `${JSON.stringify({
    installCommand: 'npm ci --ignore-scripts',
    buildCommand: 'npm run build:arc-mainnet-production',
    outputDirectory: 'dist-mainnet-production',
    headers: [{
      source: '/(.*)',
      headers: [{ key: 'Content-Security-Policy', value: "default-src 'self'" }],
    }],
  }, null, 2)}\n`);
  git(root, ['init', '--initial-branch=main']);
  git(root, ['config', 'user.email', 'security-test@example.invalid']);
  git(root, ['config', 'user.name', 'Security Test']);
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'fixture']);
  return root;
}

test('AUDIT-ROUND2-HIGH-PROVENANCE-01 accepts only a clean exact commit identity', (t) => {
  const root = fixture(t);
  const provenance = assertProductionCheckout(root);
  assert.equal(provenance.sourceCommit, git(root, ['rev-parse', 'HEAD']));
  assert.match(provenance.sourceTreeDigest, /^sha256:[0-9a-f]{64}$/u);
  assert.match(provenance.packageLockDigest, /^sha256:[0-9a-f]{64}$/u);
  assert.match(provenance.releaseManifestDigest, /^sha256:[0-9a-f]{64}$/u);
  assert.throws(() => assertProductionCheckout(root, { GITHUB_SHA: '0'.repeat(40) }), /exact checked-out source commit/u);
});

test('AUDIT-ROUND2-HIGH-PROVENANCE-01 permits deterministic install output and explicit Vercel metadata only outside trusted source roots', async (t) => {
  await t.test('root dependency install output remains outside the committed source snapshot', (child) => {
    const root = fixture(child);
    fs.mkdirSync(path.join(root, 'node_modules', 'installed-package'), { recursive: true });
    fs.writeFileSync(path.join(root, 'node_modules', 'installed-package', 'index.js'), 'export default true;\n');
    assert.equal(git(root, ['status', '--porcelain=v1', '--untracked-files=all']), '');
    assert.doesNotThrow(() => assertProductionCheckout(root));
  });

  await t.test('explicitly ignored Vercel platform metadata is allowed outside trusted source roots', (child) => {
    const root = fixture(child);
    fs.mkdirSync(path.join(root, '.vercel', 'output'), { recursive: true });
    fs.writeFileSync(path.join(root, '.vercel', 'project.json'), '{"projectId":"preview-fixture"}\n');
    fs.writeFileSync(path.join(root, '.vercel', 'README.txt'), 'Vercel platform metadata.\n');
    fs.writeFileSync(path.join(root, '.vercel', 'output', 'config.json'), '{}\n');
    assert.equal(git(root, ['status', '--porcelain=v1', '--untracked-files=all']), '');
    assert.doesNotThrow(() => assertProductionCheckout(root));
  });

  await t.test('arbitrary untracked root content is not treated as platform metadata', (child) => {
    const root = fixture(child);
    fs.writeFileSync(path.join(root, 'vercel-override.js'), 'throw new Error();\n');
    assert.throws(() => assertProductionCheckout(root), /Production checkout dirty:\n\?\? vercel-override\.js/u);
  });
});

test('AUDIT-ROUND2-HIGH-PROVENANCE-01 rejects dirty tracked and untracked production inputs', async (t) => {
  await t.test('dirty tracked source', (child) => {
    const root = fixture(child); fs.appendFileSync(path.join(root, 'apps', 'web', 'app.js'), '// diagnostic-must-not-print-file-content\n');
    assert.throws(
      () => assertProductionCheckout(root),
      (error) => /Production checkout dirty:\n M apps\/web\/app\.js/u.test(error.message)
        && !error.message.includes('diagnostic-must-not-print-file-content'),
    );
  });
  await t.test('dirty tracked scripts source', (child) => {
    const root = fixture(child); fs.appendFileSync(path.join(root, 'scripts', 'trusted.mjs'), '// rejected\n');
    assert.throws(() => assertProductionCheckout(root), /Production checkout dirty:\n M scripts\/trusted\.mjs/u);
  });
  await t.test('untracked override', (child) => {
    const root = fixture(child); fs.writeFileSync(path.join(root, 'apps', 'web', 'override.js'), 'throw new Error();\n');
    assert.throws(() => assertProductionCheckout(root), /Production checkout dirty:\n\?\? apps\/web\/override\.js/u);
  });
  await t.test('staged tracked source', (child) => {
    const root = fixture(child); fs.appendFileSync(path.join(root, 'apps', 'web', 'app.js'), '// staged dirty\n');
    git(root, ['add', 'apps/web/app.js']);
    assert.throws(() => assertProductionCheckout(root), /Production checkout dirty:\nM  apps\/web\/app\.js/u);
  });
  await t.test('untracked scripts override', (child) => {
    const root = fixture(child); fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(root, 'scripts', 'override.mjs'), 'throw new Error();\n');
    assert.throws(() => assertProductionCheckout(root), /Production checkout dirty:\n\?\? scripts\/override\.mjs/u);
  });
  await t.test('secret-like filename fragments are redacted from diagnostics', (child) => {
    const root = fixture(child); fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(root, 'scripts', 'token=do-not-print-this-value.mjs'), 'throw new Error();\n');
    assert.throws(
      () => assertProductionCheckout(root),
      (error) => error.message.includes('?? scripts/token=[redacted]')
        && !error.message.includes('do-not-print-this-value'),
    );
  });
  await t.test('ignored JavaScript injection', (child) => {
    const root = fixture(child); fs.writeFileSync(path.join(root, 'apps', 'web', 'override.ignored.js'), 'throw new Error();\n');
    assert.throws(() => assertProductionCheckout(root), /ignored source overrides/u);
  });
  await t.test('source-tree node_modules shadow', (child) => {
    const root = fixture(child); fs.mkdirSync(path.join(root, 'apps', 'web', 'node_modules', 'shadow'), { recursive: true });
    fs.writeFileSync(path.join(root, 'apps', 'web', 'node_modules', 'shadow', 'index.js'), 'export default false;\n');
    assert.throws(() => assertProductionCheckout(root), /ignored source overrides|shadow modules/u);
  });
});

test('AUDIT-ROUND5-PROVENANCE-DIAGNOSTICS safely tolerates only format-only vercel.json normalization', async (t) => {
  await t.test('clean vercel.json passes', (child) => {
    const root = fixture(child);
    assert.doesNotThrow(() => assertProductionCheckout(root));
  });

  await t.test('same JSON with whitespace changed passes', (child) => {
    const root = fixture(child);
    const committed = fs.readFileSync(path.join(root, 'vercel.json'), 'utf8');
    const formatted = `${JSON.stringify(JSON.parse(committed), null, 4)}\r\n`;
    fs.writeFileSync(path.join(root, 'vercel.json'), formatted);
    assert.notEqual(formatted, committed);
    assert.doesNotThrow(() => assertProductionCheckout(root));
  });

  await t.test('same JSON with property ordering changed passes', (child) => {
    const root = fixture(child);
    const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
    const reordered = {
      headers: config.headers,
      outputDirectory: config.outputDirectory,
      buildCommand: config.buildCommand,
      installCommand: config.installCommand,
    };
    fs.writeFileSync(path.join(root, 'vercel.json'), `${JSON.stringify(reordered)}\n`);
    assert.doesNotThrow(() => assertProductionCheckout(root));
  });

  for (const [label, key, value] of [
    ['buildCommand changed', 'buildCommand', 'npm run build'],
    ['installCommand changed', 'installCommand', 'npm install'],
    ['outputDirectory changed', 'outputDirectory', 'dist'],
  ]) {
    await t.test(`${label} fails`, (child) => {
      const root = fixture(child);
      const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
      config[key] = value;
      fs.writeFileSync(path.join(root, 'vercel.json'), `${JSON.stringify(config, null, 2)}\n`);
      assert.throws(
        () => assertProductionCheckout(root),
        (error) => /semanticEquivalent: false/u.test(error.message)
          && /formatOnly: false/u.test(error.message)
          && error.message.includes(`- ${key}:`),
      );
    });
  }

  await t.test('CSP header changed fails', (child) => {
    const root = fixture(child);
    const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
    config.headers[0].headers[0].value = "default-src 'none'";
    fs.writeFileSync(path.join(root, 'vercel.json'), `${JSON.stringify(config, null, 2)}\n`);
    assert.throws(
      () => assertProductionCheckout(root),
      (error) => /semanticEquivalent: false/u.test(error.message)
        && /formatOnly: false/u.test(error.message)
        && error.message.includes('- headers[0].headers[0].value:'),
    );
  });

  await t.test('arbitrary new JSON key fails', (child) => {
    const root = fixture(child);
    const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
    config.untrustedOverride = true;
    fs.writeFileSync(path.join(root, 'vercel.json'), `${JSON.stringify(config, null, 2)}\n`);
    assert.throws(
      () => assertProductionCheckout(root),
      (error) => /semanticEquivalent: false/u.test(error.message)
        && error.message.includes('- untrustedOverride: [missing] -> true'),
    );
  });

  await t.test('invalid working vercel.json fails', (child) => {
    const root = fixture(child);
    fs.writeFileSync(path.join(root, 'vercel.json'), '{ invalid json\n');
    assert.throws(
      () => assertProductionCheckout(root),
      (error) => /semanticEquivalent: false/u.test(error.message)
        && /formatOnly: false/u.test(error.message)
        && /\$: valid-json -> invalid-json/u.test(error.message),
    );
  });

  await t.test('format-only vercel.json plus another dirty source file fails', (child) => {
    const root = fixture(child);
    const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
    fs.writeFileSync(path.join(root, 'vercel.json'), `${JSON.stringify(config, null, 4)}\r\n`);
    fs.appendFileSync(path.join(root, 'apps', 'web', 'app.js'), '// still rejected\n');
    assert.throws(() => assertProductionCheckout(root), / M apps\/web\/app\.js/u);
  });

  await t.test('staged format-only vercel.json fails', (child) => {
    const root = fixture(child);
    const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
    fs.writeFileSync(path.join(root, 'vercel.json'), `${JSON.stringify(config, null, 4)}\r\n`);
    git(root, ['add', 'vercel.json']);
    assert.throws(() => assertProductionCheckout(root), /Production checkout dirty/u);
  });

  await t.test('secret-like scalar mutation is redacted', (child) => {
    const root = fixture(child);
    const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
    config.installCommand = 'token=do-not-print-this-value';
    fs.writeFileSync(path.join(root, 'vercel.json'), `${JSON.stringify(config, null, 2)}\n`);
    assert.throws(
      () => assertProductionCheckout(root),
      (error) => error.message.includes('- installCommand: "npm ci --ignore-scripts" -> "token=[redacted]"')
        && !error.message.includes('do-not-print-this-value'),
    );
  });
});

test('AUDIT-ROUND2-HIGH-PROVENANCE-01 Git archive excludes stale dist and local dependency overrides', (t) => {
  const root = fixture(t);
  fs.mkdirSync(path.join(root, 'dist-mainnet-production'), { recursive: true });
  fs.writeFileSync(path.join(root, 'dist-mainnet-production', 'stale.js'), 'stale\n');
  assert.throws(() => assertFreshProductionOutput(root), /stale production output/u);
  fs.mkdirSync(path.join(root, 'node_modules', 'override'), { recursive: true });
  fs.writeFileSync(path.join(root, 'node_modules', 'override', 'index.js'), 'local override\n');
  const provenance = assertProductionCheckout(root);
  const snapshot = createProductionSnapshot(root, provenance);
  try {
    assert.equal(fs.existsSync(path.join(snapshot, 'dist-mainnet-production', 'stale.js')), false);
    assert.equal(fs.existsSync(path.join(snapshot, 'node_modules', 'override', 'index.js')), false);
    assert.equal(fs.readFileSync(path.join(snapshot, 'apps', 'web', 'app.js'), 'utf8').replace(/\r\n?/gu, '\n'), 'export const trusted = true;\n');
  } finally { fs.rmSync(snapshot, { recursive: true, force: true }); }
});

test('AUDIT-ROUND2-HIGH-PROVENANCE-01 rejects wrong commit, profile, lock, tree and manifest evidence', (t) => {
  const root = fixture(t);
  const provenance = assertProductionCheckout(root);
  const base = {
    sourceCommit: provenance.sourceCommit,
    sourceTreeDigest: provenance.sourceTreeDigest,
    packageLockDigest: provenance.packageLockDigest,
  };
  const build = { ...base, buildProfile: 'arc-mainnet-production' };
  const metadata = { ...base, releaseManifestDigest: provenance.releaseManifestDigest, verificationCommand: 'npm run verify:arc-mainnet-production' };
  const attestation = { ...base, releaseManifestDigest: provenance.releaseManifestDigest, sourceSnapshot: 'git-archive-v1', dependencyInstall: 'npm-ci-lockfile' };
  assert.equal(assertProductionArtifactProvenance({ build, metadata, attestation }, provenance), true);
  for (const mutation of [
    { area: 'build', field: 'sourceCommit', value: '0'.repeat(40) },
    { area: 'metadata', field: 'sourceTreeDigest', value: `sha256:${'0'.repeat(64)}` },
    { area: 'attestation', field: 'packageLockDigest', value: `sha256:${'0'.repeat(64)}` },
    { area: 'metadata', field: 'releaseManifestDigest', value: `sha256:${'0'.repeat(64)}` },
    { area: 'build', field: 'buildProfile', value: 'development' },
  ]) {
    const evidence = { build: { ...build }, metadata: { ...metadata }, attestation: { ...attestation } };
    evidence[mutation.area][mutation.field] = mutation.value;
    assert.throws(() => assertProductionArtifactProvenance(evidence, provenance));
  }
});

test('AUDIT-ROUND3-HIGH-PROVENANCE-02 rejects artifact mutation even after its mutable attestation is recomputed', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'veilforge-artifact-anchor-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const trusted = path.join(root, 'trusted');
  const attacked = path.join(root, 'attacked');
  fs.mkdirSync(path.join(trusted, 'v4'), { recursive: true });
  fs.writeFileSync(path.join(trusted, 'v4', 'proof-send-boundary.js'), 'export const trusted = true;\n');
  fs.writeFileSync(path.join(trusted, 'production-attestation.json'), '{"artifactDigest":"trusted-build-output"}\n');
  fs.mkdirSync(path.join(attacked, 'v4'), { recursive: true });
  fs.copyFileSync(path.join(trusted, 'v4', 'proof-send-boundary.js'), path.join(attacked, 'v4', 'proof-send-boundary.js'));
  fs.copyFileSync(path.join(trusted, 'production-attestation.json'), path.join(attacked, 'production-attestation.json'));

  const criticalPath = path.join(attacked, 'v4', 'proof-send-boundary.js');
  fs.writeFileSync(criticalPath, 'export const trusted = false;\n');
  const recomputed = createHash('sha256').update(fs.readFileSync(criticalPath)).digest('hex');
  fs.writeFileSync(path.join(attacked, 'production-attestation.json'), `${JSON.stringify({ artifactDigest: `sha256:${recomputed}` })}\n`);

  assert.throws(
    () => assertProductionArtifactMatchesTrustedSnapshot(attacked, trusted),
    /independently rebuilt trusted source snapshot/u,
  );
});

test('AUDIT-ROUND4-HIGH-PROVENANCE-03 authenticates trusted bytes before candidate config import', () => {
  const verifier = fs.readFileSync(path.resolve('scripts/verify-arc-mainnet-production.mjs'), 'utf8');
  const trustBoundary = verifier.indexOf('const trustedArtifact = verifyProductionArtifactAgainstTrustedSnapshot({ root });');
  const candidateRead = verifier.indexOf("const read = (relative) => fs.readFileSync(path.join(output, relative), 'utf8');");
  const candidateImport = verifier.indexOf('const config = await import(');
  assert.ok(trustBoundary >= 0, 'trusted snapshot verification must be explicit');
  assert.ok(candidateRead > trustBoundary, 'candidate metadata must not be read before trusted verification');
  assert.ok(candidateImport > trustBoundary, 'candidate config must not be imported before trusted verification');
});

test('AUDIT-ROUND4-HIGH-PROVENANCE-04 candidate metadata cannot define the trusted release expectation', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'veilforge-release-expectation-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const trusted = path.join(root, 'trusted');
  const candidate = path.join(root, 'candidate');
  fs.mkdirSync(trusted, { recursive: true });
  fs.mkdirSync(candidate, { recursive: true });
  fs.writeFileSync(path.join(trusted, 'config.js'), 'export const release = "trusted";\n');
  fs.writeFileSync(path.join(trusted, 'production-attestation.json'), '{"artifactDigest":"trusted"}\n');
  fs.writeFileSync(path.join(candidate, 'config.js'), 'export const release = "candidate";\n');
  fs.writeFileSync(path.join(candidate, 'production-attestation.json'), '{"artifactDigest":"candidate-self-declared"}\n');
  assert.throws(
    () => assertProductionArtifactMatchesTrustedSnapshot(candidate, trusted),
    /independently rebuilt trusted source snapshot/u,
  );
});
