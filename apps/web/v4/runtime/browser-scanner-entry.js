import { cloneValue, deepFreeze } from '../canonical.js';
import { createV4WebExport } from '../export-adapter.js';
import { webV4Error } from '../errors.js';
import { verifyV4Report } from '../report-adapter.js';
import { V4_HASH_PAYLOAD_VERSION, V4_REPORT_VERSION, WEB_V4_FOUNDATION_VERSION } from '../version.js';
import { createV4ViewModel } from '../view-models.js';
import { installBrowserBuffer } from './browser/byte-buffer.js';
import { COMPILER_DIGEST, COMPILER_VERSION, RELEASE_MANIFEST_DIGEST, TAXONOMY } from './browser/runtime-config.js';
import { normalizeWebV4Limits } from './limits.js';

installBrowserBuffer();
let dependencies;
let dependencyInitializationMs = 0;

async function loadDependencies() {
  if (!dependencies) {
    const started = globalThis.performance.now();
    dependencies = Promise.all([
      import('./browser-runtime-assets/engine/v4/orchestration/index.js'),
      import('./browser/solc-compiler.js'),
    ]).then(([orchestration, compiler]) => {
      const value = { orchestration, compiler: compiler.createBrowserCompiler() };
      dependencyInitializationMs = globalThis.performance.now() - started;
      return value;
    });
  }
  return dependencies;
}

function normalizedCoreInput(input, limits) {
  if (!input?.sources || typeof input.sources !== 'object') throw webV4Error('WEB_V4_INPUT_INVALID', 'A source map is required.');
  const sources = Object.fromEntries(Object.entries(input.sources).map(([path, value]) => [path, value?.content ?? value]));
  if (Object.keys(sources).length > limits.maxFileCount) throw webV4Error('WEB_V4_INPUT_LIMIT', 'Browser file count exceeds the safe limit.');
  let totalBytes = 0;
  for (const content of Object.values(sources)) {
    if (typeof content !== 'string') throw webV4Error('WEB_V4_INPUT_INVALID', 'Source content must be UTF-8 text.');
    const bytes = new TextEncoder().encode(content).byteLength;
    if (bytes > limits.maxPerFileBytes) throw webV4Error('WEB_V4_INPUT_LIMIT', 'A source file exceeds the safe byte limit.');
    totalBytes += bytes;
  }
  if (totalBytes > limits.maxProjectBytes) throw webV4Error('WEB_V4_INPUT_LIMIT', 'Project sources exceed the safe byte limit.');
  return {
    sources,
    compilerVersion: input.compiler?.version ?? input.compilerVersion ?? COMPILER_VERSION,
    settings: cloneValue(input.settings ?? {}),
    taxonomy: cloneValue(input.taxonomy ?? TAXONOMY),
    policy: input.policy === undefined ? undefined : cloneValue(input.policy),
    policies: input.policies === undefined ? undefined : cloneValue(input.policies),
    domains: [...(input.domains ?? [input.policy?.domain ?? 'arc-payments'])],
    evaluationTime: input.evaluationTime ?? '1970-01-01T00:00:00Z',
    project: {
      projectId: input.projectId,
      projectName: input.projectName ?? null,
      canonicalSourceRootId: input.canonicalSourceRootId ?? `sdk:${input.projectId}`,
    },
    scanner: { version: '3.2.2', engineVersion: '4.0.0-gc.1', releaseManifestDigest: RELEASE_MANIFEST_DIGEST },
    configuration: cloneValue(input.configuration ?? {}),
  };
}

function progressProjection(event) {
  const index = Number(event?.metadata?.index);
  const total = Number(event?.metadata?.total);
  return {
    stage: event?.stageName ?? 'scan',
    status: event?.type ?? 'progress',
    percent: Number.isFinite(index) && Number.isFinite(total) && total > 0 ? Math.round((index / total) * 100) : undefined,
    durationMs: Number.isFinite(event?.metadata?.durationMs) ? event.metadata.durationMs : undefined,
  };
}

async function scanProject(input, options = {}) {
  const initializedAt = globalThis.performance.now();
  const limits = normalizeWebV4Limits(options.limits);
  const { orchestration, compiler } = await loadDependencies();
  if (options.signal?.aborted) throw webV4Error('WEB_V4_ABORTED', 'Aborted before compiler initialization.');
  try {
    const result = await orchestration.scanProject(normalizedCoreInput(input, limits), {
      compiler,
      signal: options.signal,
      stageTimeoutMs: limits.stageTimeoutMs,
      globalTimeoutMs: limits.globalTimeoutMs,
      onProgress: (event) => options.onProgress?.(progressProjection(event)),
    });
    const verification = await verifyV4Report(result.report);
    const value = {
      status: result.status,
      report: verification.report,
      reportHash: verification.reportHash,
      verification: { verified: true, reportHash: verification.reportHash },
      incompleteReasons: [...result.incompleteReasons],
      runtime: { compilerInitializationMs: dependencyInitializationMs, initializationAndScanMs: globalThis.performance.now() - initializedAt },
    };
    return deepFreeze(cloneValue(value));
  } catch (error) {
    if (options.signal?.aborted || error?.code === 'SCAN_ABORTED') throw webV4Error('WEB_V4_ABORTED', 'The browser scan was aborted.');
    if (error?.code === 'SCAN_STAGE_TIMEOUT') throw webV4Error('WEB_V4_TIMEOUT', 'The browser scan exceeded its runtime limit.');
    throw error;
  }
}

async function createExport(report) {
  const verification = await verifyV4Report(report);
  return createV4WebExport(verification, createV4ViewModel(verification));
}

export const VeilForgeV4BrowserRuntime = deepFreeze({
  version: WEB_V4_FOUNDATION_VERSION,
  compilerVersion: COMPILER_VERSION,
  capabilities: {
    compiler: 'solc-js-worker', compilerDigest: COMPILER_DIGEST, reportVersion: V4_REPORT_VERSION,
    hashPayloadVersion: V4_HASH_PAYLOAD_VERSION, networkRequired: false, sourcePersistence: false,
  },
  scanProject,
  verifyReport: verifyV4Report,
  createExport,
});

globalThis.VeilForgeV4BrowserRuntime = VeilForgeV4BrowserRuntime;
