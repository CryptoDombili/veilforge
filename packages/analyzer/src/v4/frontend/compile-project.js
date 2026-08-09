import { createAstIndex } from './ast-index.js';
import { compileStandardJson, getCompiler } from './compiler-provider.js';
import { createCompilationSnapshot, createIncompleteResult } from './compilation-snapshot.js';
import { collectDiagnostics, hasCompilerErrors } from './diagnostics.js';
import { buildImportGraph } from './import-graph.js';
import { ProjectResolutionError, resolveVirtualProject } from './project-resolver.js';
import { buildStandardJsonInput, canonicalSourceHash, compilerInputHash } from './standard-json.js';

export function compileProject({ sources, compilerVersion = '0.8.24', settings = {}, compiler = null }) {
  let resolved;
  try { resolved = resolveVirtualProject({ sources, settings }); }
  catch (error) {
    if (!(error instanceof ProjectResolutionError)) throw error;
    const fallbackSettings = error.code === 'INVALID_REMAPPING' ? { ...settings, remappings: [] } : settings;
    const standard = buildStandardJsonInput({ sources, settings: fallbackSettings });
    const provider = getCompiler({ requestedVersion: compilerVersion, compiler });
    const diagnostic = {
      severity: 'error', errorCode: error.code, type: 'ImportResolutionError', component: 'veilforge-resolver',
      message: 'Project dependency resolution failed.', formattedMessage: 'Project dependency resolution failed.',
      sourcePath: error.details?.importer ?? null, byteStart: null, byteLength: null, line: null, column: null,
    };
    return {
      result: createIncompleteResult({
        compilerVersion: provider.version,
        compilerLongVersion: provider.longVersion,
        compilerInputHash: compilerInputHash(standard.input, compilerVersion),
        canonicalSourceHash: canonicalSourceHash(standard.sources),
        diagnostics: [diagnostic],
        reason: 'import-resolution-error',
      }),
      input: standard.input,
      importGraph: { nodes: standard.sources.map((source) => source.path), edges: [], cycles: [], diagnostics: [diagnostic] },
      output: { errors: [diagnostic], sources: {}, contracts: {} },
      astIndex: null,
      resolutionError: Object.freeze({ code: error.code }),
    };
  }
  const standard = buildStandardJsonInput({ sources: resolved.sources, settings: resolved.settings });
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
