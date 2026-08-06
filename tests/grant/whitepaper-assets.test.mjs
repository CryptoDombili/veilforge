import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const figureNames = ['veilforge-architecture.svg', 'configure-to-export-workflow.svg', 'arc-testnet-proof-lifecycle.svg', 'open-core-sustainability-loop.svg', 'mainnet-staged-rollout.svg'];

test('five semantic SVG figures are real, accessible and integrated', () => {
  const whitepaper = read('docs/whitepaper/veilforge-v4-whitepaper.md');
  for (const name of figureNames) {
    const source = read(`docs/whitepaper/figures/${name}`);
    assert.match(source, /<svg[^>]+role="img"/u);
    assert.match(source, /<title id="title">[^<]+<\/title><desc id="desc">[^<]+<\/desc>/u);
    assert.match(whitepaper, new RegExp(`figures/${name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}`, 'u'));
    assert.equal(fs.readFileSync(path.join(root, 'apps/web/whitepaper/figures', name)).equals(fs.readFileSync(path.join(root, 'docs/whitepaper/figures', name))), true);
  }
  assert.doesNotMatch(whitepaper, /Figure \d placeholder/iu);
});

test('HTML readers expose real navigation, PDF downloads and source identities', () => {
  const pairs = [
    ['docs/whitepaper/veilforge-v4-whitepaper.md', 'apps/web/whitepaper/index.html', 'VeilForge_V4_Whitepaper.pdf'],
    ['docs/whitepaper/veilforge-v4-whitepaper-executive-brief.md', 'apps/web/whitepaper/executive-brief.html', 'VeilForge_V4_Executive_Brief.pdf'],
  ];
  for (const [source, reader, pdf] of pairs) {
    const sourceText = read(source).replace(/\r\n?/gu, '\n');
    const digest = `sha256:${crypto.createHash('sha256').update(sourceText).digest('hex')}`;
    const html = read(reader);
    assert.match(html, new RegExp(digest, 'u'));
    assert.match(html, new RegExp(pdf, 'u'));
    assert.match(html, /Skip to document/u);
    assert.match(html, /Launch V4 Scanner/u);
  }
  const generator = read('scripts/generate-whitepaper-assets.py');
  const build = read('scripts/build-web.mjs');
  assert.match(generator, /src="\/whitepaper\/figures\//u);
  assert.match(generator, /href="\/whitepaper\/\{pdf_name\}"/u);
  assert.match(build, /replaceAll\('src="\.\/figures\/', 'src="\/whitepaper\/figures\/'\)/u);
  assert.match(build, /replaceAll\('href="\.\/VeilForge_', 'href="\/whitepaper\/VeilForge_'\)/u);
  assert.match(build, /replaceAll\('href="\.\/executive-brief\.html"', 'href="\/whitepaper\/executive-brief"'\)/u);
});

test('reader CSS contains the mobile overflow boundary', () => {
  const css = read('apps/web/whitepaper/reader.css');
  for (const rule of ['overflow-x:hidden', 'overflow-wrap:anywhere', 'word-break:break-word', 'max-width:100%', 'overflow-x:auto']) assert.match(css, new RegExp(rule.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
});

test('PDF assets are non-empty documents with accessible metadata', () => {
  for (const name of ['VeilForge_V4_Whitepaper.pdf', 'VeilForge_V4_Executive_Brief.pdf']) {
    const buffer = fs.readFileSync(path.join(root, 'apps/web/whitepaper', name));
    assert.equal(buffer.subarray(0, 5).toString('ascii'), '%PDF-');
    assert.ok(buffer.byteLength > 30_000, `${name}: ${buffer.byteLength}`);
    const ascii = buffer.toString('latin1');
    assert.match(ascii, /\/Author \(VeilForge\)/u);
    assert.match(ascii, /\/Title \(/u);
    assert.match(ascii, /\/Subject \(/u);
  }
});

test('static server declares PDF and SVG MIME types', () => {
  const server = read('scripts/serve.mjs');
  assert.match(server, /\['\.pdf', 'application\/pdf'\]/u);
  assert.match(server, /\['\.svg', 'image\/svg\+xml; charset=utf-8'\]/u);
});
