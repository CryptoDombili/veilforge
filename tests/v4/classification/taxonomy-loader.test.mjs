import test from 'node:test'; import assert from 'node:assert/strict';
import { loadFinancialTaxonomy } from '../../../packages/analyzer/src/v4/classification/index.js';
import { taxonomy, taxonomyText } from './helpers.mjs';
test('taxonomy exact alias', () => assert.ok(taxonomy.domains['arc-payments'].sensitiveClasses.includes('payer')));
test('taxonomy preserves every normative domain', () => assert.deepEqual(Object.keys(taxonomy.domains), ['arc-payments', 'arc-private-credit', 'arc-treasury']));
test('Windows path/LF/CRLF/BOM etkisizliği', () => assert.deepEqual(loadFinancialTaxonomy(`\uFEFF${taxonomyText.replace(/\n/gu, '\r\n')}`), taxonomy));
