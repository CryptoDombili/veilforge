import test from 'node:test';
import assert from 'node:assert/strict';
import { createZip } from '../apps/web/lib/zip.js';
import { looksLikeSolidity, readZipEntries } from '../apps/web/lib/unzip.js';
import { analyzeProject } from '../apps/web/lib/project-xray.js';

function zipFile(name, entries) {
  const bytes = createZip(entries);
  return {
    name,
    type: 'application/zip',
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
}

test('ZIP project import finds Solidity contracts recursively', async () => {
  const file = zipFile('payroll-project.zip', [
    { name: 'contracts/Payroll.sol', data: 'pragma solidity ^0.8.24; contract Payroll {}' },
    { name: 'src/Settlement.contract', data: 'pragma solidity ^0.8.24; contract Settlement {}' },
    { name: 'README.md', data: '# Payroll' },
    { name: 'node_modules/vendor/Vendor.sol', data: 'contract Vendor {}' },
  ]);
  const entries = await readZipEntries(file);
  assert.deepEqual(entries.map((entry) => entry.path), [
    'contracts/Payroll.sol',
    'src/Settlement.contract.sol',
  ]);
});

test('content detection accepts Solidity source without a .sol extension', () => {
  assert.equal(looksLikeSolidity('pragma solidity ^0.8.24; interface Payroll {}'), true);
  assert.equal(looksLikeSolidity('{"name":"not a contract"}'), false);
});

test('Project X-Ray detects Foundry structure and narrows the scan scope', () => {
  const xray = analyzeProject([
    { path: 'src/Payroll.sol', content: 'pragma solidity ^0.8.24; import "./IPayroll.sol"; contract Payroll {}' },
    { path: 'src/IPayroll.sol', content: 'pragma solidity ^0.8.24; interface IPayroll {}' },
    { path: 'test/Payroll.t.sol', content: 'pragma solidity ^0.8.24; import "forge-std/Test.sol"; contract PayrollTest {}' },
    { path: 'script/Deploy.s.sol', content: 'pragma solidity ^0.8.24; contract Deploy {}' },
  ]);
  assert.equal(xray.framework, 'Foundry');
  assert.deepEqual(xray.scopeFiles.map((file) => file.path), ['src/IPayroll.sol', 'src/Payroll.sol']);
  assert.equal(xray.entryContracts[0].name, 'Payroll');
  assert.equal(xray.excluded.length, 2);
  assert.equal(xray.imports, 2);
});
