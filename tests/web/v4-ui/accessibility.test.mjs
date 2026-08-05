import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { v4UiTemplate } from '../../../apps/web/v4/ui.js';

test('V4 template has named controls, live status, progress and modal semantics', () => {
  const html = v4UiTemplate();
  assert.match(html, /aria-labelledby="v4-intake-title"/u);
  assert.match(html, /role="status"/u);
  assert.match(html, /aria-live="polite"/u);
  assert.match(html, /<progress[^>]+aria-label="Scan progress"/u);
  assert.match(html, /<dialog[^>]+aria-labelledby="v4-detail-title"/u);
  assert.match(html, /aria-label="Close finding detail"/u);
});

test('responsive, keyboard focus and reduced-motion rules are scoped to V4 mode', () => {
  const css = fs.readFileSync(new URL('../../../apps/web/styles.css', import.meta.url), 'utf8');
  assert.match(css, /body\.v4-ui-mode :focus-visible/u);
  assert.match(css, /@media \(max-width: 1100px\)/u);
  assert.match(css, /@media \(max-width: 760px\)/u);
  assert.match(css, /@media \(max-width: 430px\)/u);
  assert.match(css, /prefers-reduced-motion/u);
});
