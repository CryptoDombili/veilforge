import { canonicalJson, compareCodePoints } from './standard-json.js';

export const COMPILATION_SNAPSHOT_SCHEMA_VERSION = '1.0.0';
export const V4_ENGINE_VERSION = '4.0.0-gc.1';

function contractArtifacts(output) {
  const contracts = [];
  for (const sourcePath of Object.keys(output?.contracts ?? {}).sort(compareCodePoints)) {
    for (const contractName of Object.keys(output.contracts[sourcePath]).sort(compareCodePoints)) {
      const artifact = output.contracts[sourcePath][contractName];
      contracts.push({
        fullyQualifiedName: `${sourcePath}:${contractName}`,
        sourcePath,
        contractName,
        abi: artifact.abi ?? [],
        storageLayout: artifact.storageLayout ?? { storage: [], types: null },
        bytecode: artifact.evm?.bytecode?.object ?? '',
        deployedBytecode: artifact.evm?.deployedBytecode?.object ?? '',
        methodIdentifiers: Object.fromEntries(Object.entries(artifact.evm?.methodIdentifiers ?? {}).sort(([a], [b]) => compareCodePoints(a, b))),
      });
    }
  }
  return contracts;
}

export function createCompilationSnapshot({ compilerVersion, compilerLongVersion, compilerInputHash, canonicalSourceHash, settings, sources, diagnostics, output, astIndex }) {
  const sourceMetadata = sources.map((source) => ({ path: source.path, sourceId: output.sources?.[source.path]?.id ?? null, byteLength: Buffer.byteLength(source.content, 'utf8') }));
  return {
    schemaVersion: COMPILATION_SNAPSHOT_SCHEMA_VERSION,
    engineVersion: V4_ENGINE_VERSION,
    status: 'compiled',
    compilerVersion,
    compilerLongVersion,
    compilerInputHash,
    canonicalSourceHash,
    settings,
    sources: sourceMetadata,
    diagnostics,
    contracts: contractArtifacts(output),
    astIndexSummary: astIndex.summary(),
  };
}

export function canonicalSnapshotJson(snapshot) {
  return canonicalJson(snapshot);
}

export function createIncompleteResult({ compilerVersion, compilerLongVersion, compilerInputHash, canonicalSourceHash, diagnostics, reason = 'compiler-error' }) {
  return {
    schemaVersion: COMPILATION_SNAPSHOT_SCHEMA_VERSION,
    engineVersion: V4_ENGINE_VERSION,
    status: 'analysis-incomplete',
    reason,
    compilerVersion,
    compilerLongVersion,
    compilerInputHash,
    canonicalSourceHash,
    diagnostics,
  };
}
