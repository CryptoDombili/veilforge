import test from 'node:test';
import assert from 'node:assert/strict';
import { functionSelector, keccakHex } from '../packages/analyzer/src/keccak.js';

test('keccak-256 matches canonical vectors', () => {
  assert.equal(keccakHex(''), '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470');
  assert.equal(keccakHex('abc'), '0x4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45');
});

test('function selector uses Ethereum keccak', () => {
  assert.equal(functionSelector('transfer(address,uint256)'), '0xa9059cbb');
});
