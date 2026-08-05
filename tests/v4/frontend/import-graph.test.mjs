import assert from 'node:assert/strict';
import test from 'node:test';
import { buildImportGraph, resolveImportPath } from '../../../packages/analyzer/src/v4/frontend/index.js';

test('import graph resolves relative, nested, root, remapped, and shared imports', () => {
  const sources = {
    'src/Main.sol': 'import "./nested/B.sol"; import "src/Shared.sol"; import "@lib/Util.sol";',
    'src/Other.sol': 'import "./Shared.sol";',
    'src/nested/B.sol': 'import "../Shared.sol";',
    'src/Shared.sol': 'contract Shared {}',
    'lib/Util.sol': 'library Util {}',
  };
  const graph = buildImportGraph(sources, ['@lib/=lib/']);
  assert.equal(graph.diagnostics.length, 0);
  assert.equal(graph.edges.length, 5);
  assert.equal(graph.edges.every((edge) => edge.resolved), true);
  assert.equal(resolveImportPath('src/Main.sol', '@lib/Util.sol', ['@lib/=lib/']), 'lib/Util.sol');
});

test('missing imports produce diagnostics and import cycles terminate', () => {
  const graph = buildImportGraph({
    'src/A.sol': 'import "./B.sol"; import "./Missing.sol";',
    'src/B.sol': 'import "./A.sol";',
  });
  assert.equal(graph.diagnostics.length, 1);
  assert.equal(graph.diagnostics[0].errorCode, 'import-not-found');
  assert.deepEqual(graph.cycles, [['src/A.sol', 'src/B.sol', 'src/A.sol']]);
});

test('commented import-like text is not treated as an import', () => {
  const graph = buildImportGraph({
    'src/A.sol': '// import "./Fake.sol";\n/* import "./AlsoFake.sol"; */\ncontract A {}',
  });
  assert.deepEqual(graph.edges, []);
  assert.deepEqual(graph.diagnostics, []);
});
