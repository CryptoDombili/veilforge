import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { compileProject, UnsupportedCompilerError } from '../../packages/analyzer/src/v4/frontend/index.js';

function collectSoliditySources(projectRoot, directory = projectRoot) {
  const sources = {};
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) Object.assign(sources, collectSoliditySources(projectRoot, absolute));
    else if (entry.isFile() && entry.name.endsWith('.sol')) {
      sources[path.relative(projectRoot, absolute).replaceAll('\\', '/')] = fs.readFileSync(absolute);
    }
  }
  return sources;
}

export function compileCorpus(root = process.cwd()) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'tests/corpus/manifest.json'), 'utf8'));
  return manifest.cases.map((corpusCase) => {
    const caseRoot = path.join(root, corpusCase.path);
    const config = JSON.parse(fs.readFileSync(path.join(caseRoot, 'compiler.json'), 'utf8'));
    if (config.version !== '0.8.24') {
      return { id: corpusCase.id, status: 'unsupported', reason: `compiler-${config.version}` };
    }
    try {
      const compilation = compileProject({
        sources: collectSoliditySources(path.join(caseRoot, 'project')),
        compilerVersion: config.version,
        settings: config.settings,
      });
      return {
        id: corpusCase.id,
        status: compilation.result.status === 'compiled' ? 'compiled' : 'compiler-error',
        diagnostics: compilation.result.diagnostics.filter((item) => item.severity === 'error').map((item) => item.message),
      };
    } catch (error) {
      return {
        id: corpusCase.id,
        status: error instanceof UnsupportedCompilerError ? 'unsupported' : 'compiler-error',
        diagnostics: [error.message],
      };
    }
  });
}

test('all 60 Phase 1 corpus cases receive an explicit compiler disposition', () => {
  const results = compileCorpus();
  assert.equal(results.length, 60);
  assert.equal(new Set(results.map((item) => item.id)).size, 60);
  assert.equal(results.every((item) => ['compiled', 'compiler-error', 'unsupported'].includes(item.status)), true);
  const distribution = Object.fromEntries(['compiled', 'compiler-error', 'unsupported'].map((status) => [status, results.filter((item) => item.status === status).length]));
  console.log(`CORPUS_COMPILE_DISTRIBUTION ${JSON.stringify(distribution)}`);
  const exceptional = results.filter((item) => item.status !== 'compiled');
  console.log(`CORPUS_COMPILE_EXCEPTIONS ${JSON.stringify(exceptional)}`);
});
