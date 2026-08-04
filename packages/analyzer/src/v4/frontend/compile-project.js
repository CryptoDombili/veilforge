import { createAstIndex } from './ast-index.js';
import { compileStandardJson } from './compiler-provider.js';
import { createCompilationSnapshot, createIncompleteResult } from './compilation-snapshot.js';
import { collectDiagnostics, hasCompilerErrors } from './diagnostics.js';
import { buildImportGraph } from './import-graph.js';
import { buildStandardJsonInput, canonicalSourceHash, compilerInputHash } from './standard-json.js';

export function compileProject({ sources, compilerVersion = '0.8.24', settings = {}, compiler = null }) {
  const standard = buildStandardJsonInput({ sources, settings });
  const sourceHash = canonicalSourceHash(standard.sources);
  const inputHash = compilerInputHash(standard.input, compilerVersion);
  const importGraph = buildImportGraph(standard.sources, standard.input.settings.remappings);
  const result = compileStandardJson(standard.canonicalJson, { requestedVersion: compilerVersion, compiler });
  const diagnostics = collectDiagnostics(result.output, standard.sources);
  if (hasCompilerErrors(diagnostics)) {
    return {
      result: createIncompleteResult({
        compilerVersion: result.version,
        compilerLongVersion: result.longVersion,
        compilerInputHash: inputHash,
        canonicalSourceHash: sourceHash,
        diagnostics,
      }),
      input: standard.input,
      importGraph,
      output: result.output,
      astIndex: null,
    };
  }
  const astIndex = createAstIndex(result.output, standard.sources);
  return {
    result: createCompilationSnapshot({
      compilerVersion: result.version,
      compilerLongVersion: result.longVersion,
      compilerInputHash: inputHash,
      canonicalSourceHash: sourceHash,
      settings: standard.input.settings,
      sources: standard.sources,
      diagnostics,
      output: result.output,
      astIndex,
    }),
    input: standard.input,
    importGraph,
    output: result.output,
    astIndex,
  };
}
