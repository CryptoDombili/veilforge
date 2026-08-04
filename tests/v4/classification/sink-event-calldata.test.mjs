import test from 'node:test'; import assert from 'node:assert/strict'; import { classify, classes } from './helpers.mjs';
const source = 'contract PaymentCase { event Paid(address beneficiary); function publish(address beneficiary) public { emit Paid(beneficiary); } function ingest(address payee) external {} }';
test('event argument sink', () => { const { classification } = classify(source); assert.ok(classes(classification.sinkCandidates, 'sinkClass').has('event')); });
test('public calldata parameter sink', () => { const { classification } = classify(source); assert.ok(classification.sinkCandidates.some((item) => item.sinkClass === 'calldata')); });
test('external calldata parameter sink', () => { const { classification } = classify(source); assert.ok(classification.sinkCandidates.filter((item) => item.sinkClass === 'calldata').length >= 2); });
