import test from 'node:test'; import assert from 'node:assert/strict'; import { detect, results } from './helpers.mjs';
const source='contract TreasuryCase {uint public treasuryBalance;}';
test('treasury balance to public storage',()=>{const {detectorRun}=detect(source); assert.ok(results(detectorRun,'public-storage-disclosure').length);});
test('treasury balance to public getter',()=>{const {detectorRun}=detect(source); assert.ok(results(detectorRun,'public-getter-disclosure').length);});
test('storage and getter are separate occurrences',()=>{const {detectorRun}=detect(source); assert.notEqual(results(detectorRun,'public-storage-disclosure')[0].detectorResultId,results(detectorRun,'public-getter-disclosure')[0].detectorResultId);});
test('allowance to public getter',()=>{const {detectorRun}=detect('contract TreasuryCase {uint public allowance;}'); assert.ok(results(detectorRun,'public-getter-disclosure').length);});
