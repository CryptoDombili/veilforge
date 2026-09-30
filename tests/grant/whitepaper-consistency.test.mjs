import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const whitepaperPath = 'docs/whitepaper/veilforge-v4-whitepaper.md';
const briefPath = 'docs/whitepaper/veilforge-v4-whitepaper-executive-brief.md';
const whitepaper = read(whitepaperPath);
const brief = read(briefPath);
const manifest = JSON.parse(read('docs/grant/final/grant-evidence-manifest.json'));
const words = (value) => (value.match(/[A-Za-z0-9]+(?:[’'./-][A-Za-z0-9]+)*/gu) ?? []).length;

test('whitepaper and executive brief have valid hierarchy and reviewable length', () => {
  assert.ok(words(whitepaper) >= 6000 && words(whitepaper) <= 10000, words(whitepaper));
  assert.ok(words(brief) >= 1000 && words(brief) <= 1500, words(brief));
  assert.match(whitepaper, /^# VeilForge V4$/mu);
  const sectionNumbers = [...whitepaper.matchAll(/^## (\d+)\. /gmu)].map((match) => Number(match[1]));
  assert.deepEqual(sectionNumbers, Array.from({ length: 26 }, (_, index) => index + 1));
  assert.doesNotMatch(whitepaper, /^####+ /mu);
});

test('whitepaper internal evidence references resolve', () => {
  for (const document of [whitepaper, brief]) {
    for (const match of document.matchAll(/`((?:docs|apps|packages|benchmarks|tests|schemas)\/[^`\s,;]+)`/gu)) {
      const relative = match[1].replace(/[.:]+$/u, '');
      assert.equal(fs.existsSync(path.join(root, relative)), true, relative);
    }
  }
});

test('historical Testnet transaction, report and benchmark identities are preserved', () => {
  for (const value of [
    '0xdb674c986195ed9b3950f34d058637fbb2b887f58ca724400225ba177884192c',
    '55469453',
    '0x60B6333a0722bBEA39d4026b284Ae1E142bEb914',
    '0x88B4055eaB061CEa9BdfeFF524f65ff461B5401d',
    'sha256:fce5ffa529c79d185a6013a362e25658020d1691550557d59173c9acc6a417ea',
  ]) assert.match(whitepaper, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  for (const value of ['60/60', '56 true positives', 'zero false positives', 'zero false negatives', 'passed / allow', 'zero nondeterministic results']) assert.match(whitepaper, new RegExp(value, 'iu'));
});

test('canonical proof evidence uses the supplied verified Mainnet publication, not historical Testnet values', () => {
  const canonical = whitepaper.split('### 11.1 Canonical Arc Mainnet evidence')[1]?.split('### 11.2')[0];
  assert.ok(canonical, 'Canonical Arc Mainnet evidence section is required');
  const values = [
    'Arc Mainnet',
    '0x312501dcf496583aedc043bcc5b8b1eb4df60548c56ed5046afb44cbf14b971e',
    '23531676',
    '0x60B6333a0722bBEA39d4026b284Ae1E142bEb914',
    '0x43D76BfCa31eAd660C5d804FEe20d14C0c577337',
    'publishReport', '0 USDC', '0.0036560965 USDC', 'Success',
    'not a guaranteed future transaction cost',
  ];
  for (const document of [canonical, brief]) {
    for (const value of values) assert.ok(document.includes(value), `Missing Mainnet publication value: ${value}`);
    assert.doesNotMatch(document, /0xdb674c986195|55469453|0x88B4055|0\.001175966|Arc Testnet only|Observed Testnet fee|ARC TESTNET PROOF LIFECYCLE/iu);
  }
  assert.match(canonical, /Receipt, event, publisher, registry, and report identity verified/u);
  assert.match(canonical, /Already published; second transaction blocked/u);
  assert.match(brief, /already-published and blocks a second transaction/u);
  assert.match(whitepaper, /Historical Testnet transaction:/u);
  const figure = read('docs/whitepaper/figures/arc-testnet-proof-lifecycle.svg');
  assert.match(figure, /ARC MAINNET PROOF LIFECYCLE/u);
  assert.doesNotMatch(figure, /Arc Testnet|Testnet only|ARC TESTNET PROOF LIFECYCLE/u);
});

test('version, runtime and mainnet boundaries remain explicit', () => {
  for (const value of ['4.0.0-gc.1', 'V4 RC1', 'V4 Grant Candidate', 'schema 4.1.0', 'veilforge.report.hash.v2', 'solc 0.8.24', '1 MiB']) assert.match(whitepaper, new RegExp(value.replaceAll('.', '\\.'), 'u'));
  for (const value of ['5042', '0x43D76BfCa31eAd660C5d804FEe20d14C0c577337', 'enabled=true', 'proofReadEnabled=true', 'publishEnabled=true']) assert.match(whitepaper, new RegExp(value, 'u'));
  for (const value of ['enabled=false', 'proofReadEnabled=false', 'publishEnabled=false']) assert.doesNotMatch(`${whitepaper}\n${brief}`, new RegExp(value, 'u'));
  assert.match(read('apps/web/config.js'), /WEB_V4_ENABLED = false/u);
  assert.match(read('scripts/build-web.mjs'), /v4-preview-pending/u);
});

test('commercial and grant arithmetic match the final evidence package', () => {
  for (const value of ['$588', '$3,997', '$14,705', '$19–39', '$99–249']) assert.match(whitepaper, new RegExp(value.replace('$', '\\$'), 'u'));
  assert.equal(Object.values(manifest.budgetAllocationPercent).reduce((sum, value) => sum + value, 0), 100);
  for (const value of ['35% product engineering', '15% hosted CI infrastructure', '15% security validation', '10% documentation and onboarding', '15% Arc ecosystem integrations', '10% developer support and operations']) assert.match(whitepaper, new RegExp(value, 'u'));
  assert.match(whitepaper, /Paid capabilities are roadmap hypotheses/u);
  assert.match(whitepaper, /production billing are not live/u);
});

test('unsupported claims and secret-shaped material are absent', () => {
  const corpus = `${whitepaper}\n${brief}`;
  for (const unsupported of [/Circle endorses VeilForge/iu, /Arc endorses VeilForge/iu, /grant (?:is )?guaranteed/iu, /universal correctness is proven/iu, /production billing is live/iu]) assert.doesNotMatch(corpus, unsupported);
  for (const secret of [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u, /\b(?:seed phrase|private key)\s*[:=]\s*\S+/iu, /\b(?:api[_-]?key|password|bearer token)\s*[:=]\s*\S+/iu]) assert.doesNotMatch(corpus, secret);
});

test('whitepaper files are registered in the canonical evidence manifest', () => {
  assert.equal(manifest.evidenceFiles.includes(whitepaperPath), true);
  assert.equal(manifest.evidenceFiles.includes(briefPath), true);
  assert.equal(manifest.claims.some((claim) => claim.id === 'grant-whitepaper-package' && claim.status === 'shipped-and-verified'), true);
});

test('responsive spacing and accessible version labels are encoded in preview sources', () => {
  const css = read('apps/web/v4-grant-landing.css');
  const build = read('scripts/build-web.mjs');
  const ui = read('apps/web/v4/ui.js');
  assert.match(css, /padding:88px 0 82px/u);
  assert.match(css, /margin:0 0 76px/u);
  assert.match(css, /margin-bottom:46px/u);
  assert.match(css, /margin-bottom:34px/u);
  assert.match(css, /prefers-reduced-motion/u);
  assert.match(build, /V4_PRODUCT_NAME/u);
  assert.match(ui, /release \$\{V4_PRODUCT_VERSION\}, report schema \$\{V4_REPORT_VERSION\}/u);
});

test('all five whitepaper figures replace placeholders and resolve', () => {
  const figures = [...whitepaper.matchAll(/\]\(figures\/([^)]+\.svg)\)/gu)].map((match) => match[1]);
  assert.equal(figures.length, 5);
  assert.equal(new Set(figures).size, 5);
  for (const figure of figures) assert.equal(fs.existsSync(path.join(root, 'docs/whitepaper/figures', figure)), true, figure);
  assert.doesNotMatch(whitepaper, /Figure \d placeholder/iu);
});
