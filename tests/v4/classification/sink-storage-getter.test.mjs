import test from 'node:test'; import assert from 'node:assert/strict'; import { classify, classes } from './helpers.mjs';
test('public state variable sink', () => { const { classification } = classify('contract PaymentCase { address public payer; }'); assert.ok(classes(classification.sinkCandidates, 'sinkClass').has('public-storage')); });
test('public getter sink', () => { const { classification } = classify('contract PaymentCase { address public payer; }'); assert.ok(classes(classification.sinkCandidates, 'sinkClass').has('public-getter')); });
test('private state is not public storage sink', () => { const { classification } = classify('contract PaymentCase { address private payer; }'); assert.equal(classification.sinkCandidates.length, 0); });
