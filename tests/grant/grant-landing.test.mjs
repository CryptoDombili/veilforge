import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildV4GrantLanding } from '../../scripts/lib/v4-grant-landing.mjs';

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const source = read('apps/web/index.html');
const landing = buildV4GrantLanding(source
  .replace(/<h1>[\s\S]*?<\/h1>/u, '<h1>Find privacy exposure.<br />Verify the evidence.<br /><em>Ship with confidence.</em></h1>')
  .replace(/<a class="release-badge"[^>]*>[\s\S]*?<\/a>/u, '<a class="release-badge" href="#product"><i></i> VeilForge V4 - Grant Candidate <span>-&gt;</span></a>')
  .replace('Launch the Privacy OS', 'Launch V4 Scanner'));

test('grant landing keeps the required hero, navigation and bounded proof strip', () => {
  for (const value of [
    'Find privacy exposure.', 'Verify the evidence.', 'Ship with confidence.',
    'Deterministic Solidity analysis that runs locally, preserves source privacy, and produces verifiable release evidence for Arc teams.',
    'Launch V4 Scanner', 'Read Whitepaper', 'Executive Brief', 'Technical Evidence', 'Open Source',
    '60/60', '56 TP / 0 FP / 0 FN', 'Arc Testnet', 'analysis runs without source upload',
  ]) assert.match(landing, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  assert.equal((landing.match(/class="actions hero-actions"/gu) ?? []).length, 1);
  assert.equal((landing.match(/class="(?:launch|secondary)"/gu) ?? []).length >= 3, true);
});

test('grant sections present Arc relevance, evidence boundaries and final call to action', () => {
  for (const value of ['Payments', 'Treasury', 'Private credit', 'Release evidence', 'EVIDENCE, NOT PROMISES', 'Schema 4.1.0', 'veilforge.report.hash.v2', 'Fail-closed mainnet', 'Built evidence-first.', 'Ready for the next measurable stage.']) assert.match(landing, new RegExp(value, 'u'));
  assert.match(landing, /not an audit, formal verification, a confidentiality guarantee, or proof of universal correctness/u);
  assert.doesNotMatch(landing, /production mainnet|universal correctness is proven|Arc endorses/u);
});

test('preview-only stylesheet preserves the default V3 source and feature flag', () => {
  assert.doesNotMatch(source, /v4-grant-landing/u);
  assert.match(source, /VeilForge v3\.2\.2/u);
  assert.match(read('apps/web/config.js'), /WEB_V4_ENABLED = false/u);
  assert.match(read('scripts/build-web-v4-preview.mjs'), /VEILFORGE_WEB_V4_ENABLED = 'true'/u);
});

test('responsive spacing targets and accessible layout are encoded', () => {
  const css = read('apps/web/v4-grant-landing.css');
  assert.match(css, /padding:88px 0 82px/u);
  assert.match(css, /margin:0 0 76px/u);
  assert.match(css, /padding:58px 0 72px/u);
  assert.match(css, /margin-bottom:46px/u);
  assert.match(css, /padding:38px 0 58px/u);
  assert.match(css, /margin-bottom:34px/u);
  assert.match(css, /prefers-reduced-motion/u);
});
