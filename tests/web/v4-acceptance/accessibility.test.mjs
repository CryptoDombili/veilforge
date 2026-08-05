import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { v4UiTemplate } from '../../../apps/web/v4/ui.js';

test('acceptance controls preserve labels, live regions, alert recovery, and disabled semantics', () => {
  const html = v4UiTemplate();
  assert.match(html, /aria-live="polite"/u); assert.match(html, /role="status"/u); assert.match(html, /<progress[^>]+aria-label=/u); assert.match(html, /id="v4-cancel"[^>]+disabled/u);
  assert.match(html, /<dialog[^>]+aria-labelledby=/u); assert.match(html, /for="v4-project-name"/u);
});
test('focus, focus trap, Escape-native dialog, reduced motion and non-color status are implemented', () => {
  const ui = fs.readFileSync(new URL('../../../apps/web/v4/ui.js', import.meta.url), 'utf8'); const css = fs.readFileSync(new URL('../../../apps/web/styles.css', import.meta.url), 'utf8');
  assert.match(ui, /event\.key !== 'Tab'/u); assert.match(ui, /showModal\(\)/u); assert.match(css, /:focus-visible/u); assert.match(css, /prefers-reduced-motion/u);
  assert.match(ui, /Scan cancelled|History recovery blocked/u);
});
