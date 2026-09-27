import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildV4GrantLanding } from '../../scripts/lib/v4-grant-landing.mjs';

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const source = read('apps/web/index.html');
const testnetProfile = Object.freeze({
  chainName: 'Arc Testnet',
  chainId: 5042002,
  registryAddress: '0x88B4055eaB061CEa9BdfeFF524f65ff461B5401d',
});
const mainnetProfile = Object.freeze({
  chainName: 'Arc Mainnet',
  chainId: 5042,
  registryAddress: '0x43D76BfCa31eAd660C5d804FEe20d14C0c577337',
});
const landing = buildV4GrantLanding(source
  .replace(/<h1>[\s\S]*?<\/h1>/u, '<h1>Find privacy exposure.<br />Verify the evidence.<br /><em>Ship with confidence.</em></h1>')
  .replace(/<a class="release-badge"[^>]*>[\s\S]*?<\/a>/u, '<a class="release-badge" href="#product"><i></i> VeilForge V4 - Grant Candidate <span>-&gt;</span></a>')
  .replace('Launch the Privacy OS', 'Launch V4 Scanner'), testnetProfile);

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
  for (const value of ['Payments', 'Treasury', 'Private credit', 'Release evidence', 'EVIDENCE, NOT PROMISES', 'Schema 4.1.0', 'veilforge.report.hash.v2', 'Arc Testnet production profile', 'Built evidence-first.', 'Ready for the next measurable stage.']) assert.match(landing, new RegExp(value, 'u'));
  assert.match(landing, /not an audit, formal verification, a confidentiality guarantee, or proof of universal correctness/u);
  assert.doesNotMatch(landing, /production mainnet|universal correctness is proven|Arc endorses/u);
});

test('current product claims follow the selected runtime profile while Testnet history stays historical', () => {
  const mainnetLanding = buildV4GrantLanding(source, mainnetProfile);
  assert.match(mainnetLanding, /Arc Mainnet production profile/u);
  assert.match(mainnetLanding, /Chain 5042; verified Registry 0x43D76BfCa31eAd660C5d804FEe20d14C0c577337/u);
  assert.match(mainnetLanding, /Real Testnet evidence/u);
  assert.match(mainnetLanding, /Arc Testnet<\/strong><span>real proof publication verified/u);
  assert.doesNotMatch(read('scripts/build-web.mjs'), /<span>✓ Arc Testnet proof<\/span>/u);
});

test('preview-only stylesheet preserves the default V3 source and feature flag', () => {
  assert.doesNotMatch(source, /v4-grant-landing/u);
  assert.match(source, /VeilForge v3\.2\.2/u);
  assert.match(read('apps/web/config.js'), /WEB_V4_ENABLED = false/u);
  assert.match(read('scripts/build-web-v4-preview.mjs'), /VEILFORGE_WEB_V4_ENABLED = 'true'/u);
});

test('Vercel production build explicitly activates V4 without changing the source default', () => {
  const vercel = JSON.parse(read('vercel.json'));
  assert.equal(vercel.buildCommand, 'npm run build:arc-mainnet-production');
  assert.equal(vercel.outputDirectory, 'dist-mainnet-production');
  assert.match(read('apps/web/config.js'), /WEB_V4_ENABLED = false/u);
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
