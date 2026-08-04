import test from'node:test';import assert from'node:assert/strict';import{report}from'./helpers.mjs';
test('all mandatory layers are required for complete analysis',()=>assert.equal(report().analysis.complete,true));
test('one incomplete layer prevents complete=true',()=>assert.equal(report({analysis:{statuses:{frontend:'complete',ir:'complete',graphs:'complete',intraprocedural:'complete',interprocedural:'incomplete',classification:'complete',detectors:'complete',findings:'complete'},incompleteReasons:['trace-budget-exceeded']}}).analysis.complete,false));
