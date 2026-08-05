import test from 'node:test';
import assert from 'node:assert/strict';
import { browserScan, nodeScan } from './helpers.mjs';

for (const caseId of ['PAY-POS-001', 'TRE-NEG-001', 'CRD-ADV-001']) test(`Node/browser canonical parity: ${caseId}`, async () => {
  const [node, browser] = await Promise.all([nodeScan(caseId), browserScan(caseId)]);
  assert.equal(browser.reportHash, node.report.integrity.reportHash);
  assert.deepEqual(browser.report, node.report);
  assert.deepEqual(browser.incompleteReasons, node.incompleteReasons);
});
