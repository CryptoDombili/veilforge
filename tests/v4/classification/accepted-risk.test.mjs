import test from 'node:test'; import assert from 'node:assert/strict'; import { validateAcceptedRisks } from '../../../packages/analyzer/src/v4/classification/index.js'; import { policy } from './helpers.mjs';
const risk = { id: 'R1', owner: 'security@example.test', justification: 'bounded pilot', scope: 'PaymentCase.forward(address)', expiresAt: '2027-01-01T00:00:00Z' };
test('valid accepted-risk', () => assert.equal(validateAcceptedRisks({ ...policy, acceptedRisks: [risk] }, '2026-08-04T00:00:00Z')[0].valid, true));
test('expired accepted-risk', () => assert.equal(validateAcceptedRisks({ ...policy, acceptedRisks: [risk] }, '2028-01-01T00:00:00Z')[0].valid, false));
test('missing owner/reason/scope', () => assert.equal(validateAcceptedRisks({ ...policy, acceptedRisks: [{ id: 'R2', expiresAt: '2027-01-01T00:00:00Z' }] }, '2026-08-04T00:00:00Z')[0].valid, false));
