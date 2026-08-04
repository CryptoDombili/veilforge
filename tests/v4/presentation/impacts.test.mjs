import test from'node:test';import assert from'node:assert/strict';import{projection}from'./helpers.mjs';
test('Payments impact names payment correlation concepts',()=>assert.match(projection().impact,/payment parties.*amounts.*settlement/u));
test('Treasury impact names signer approval and limits',()=>assert.match(projection({domain:'arc-treasury',detectorId:'arc-treasury.event-disclosure'}).impact,/signer.*approver.*limits/u));
test('Private Credit impact names borrower rates and collateral',()=>assert.match(projection({domain:'arc-private-credit',detectorId:'arc-private-credit.event-disclosure'}).impact,/borrower.*rates.*collateral/u));
