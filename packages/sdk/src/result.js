import { getExportFile as internalGetExportFile } from '../../analyzer/src/v4/export/index.js';
import { deterministicSessionResult } from '../../analyzer/src/v4/orchestration/index.js';
import { immutablePublic } from './types.js';

function compilationSummary(value) {
  const item = value?.result;
  if (!item) return null;
  const severities = {};
  for (const diagnostic of item.diagnostics ?? []) severities[diagnostic.severity ?? 'unknown'] = (severities[diagnostic.severity ?? 'unknown'] ?? 0) + 1;
  return {
    schemaVersion: item.schemaVersion ?? null,
    engineVersion: item.engineVersion ?? null,
    status: item.status ?? null,
    reason: item.reason ?? null,
    compilerVersion: item.compilerVersion ?? null,
    compilerLongVersion: item.compilerLongVersion ?? null,
    compilerInputHash: item.compilerInputHash ?? null,
    canonicalSourceHash: item.canonicalSourceHash ?? null,
    sourceCount: item.sources?.length ?? 0,
    contractCount: item.contracts?.length ?? 0,
    diagnosticSummary: Object.fromEntries(Object.entries(severities).sort()),
  };
}

function analysisSummary(interprocedural) {
  if (!interprocedural) return null;
  return {
    schemaVersion: interprocedural.schemaVersion ?? null,
    engineVersion: interprocedural.engineVersion ?? null,
    complete: (interprocedural.incomplete?.length ?? 0) === 0,
    callableCount: interprocedural.callables?.length ?? interprocedural.summaries?.length ?? 0,
    budget: interprocedural.budget ?? null,
    incompleteReasons: [...new Set((interprocedural.incomplete ?? []).map((item) => item.reason))].sort(),
  };
}

function classificationSummary(classifications) {
  if (!classifications) return null;
  return Object.fromEntries(Object.keys(classifications).sort().map((domain) => {
    const value = classifications[domain];
    return [domain, {
      domain,
      complete: (value.incomplete?.length ?? 0) === 0,
      candidateTraceCount: value.candidateTraces?.length ?? 0,
      acceptedRiskCount: value.acceptedRisks?.length ?? 0,
      policyValid: value.policy?.valid ?? false,
      incompleteReasons: [...new Set((value.incomplete ?? []).map((item) => item.reason))].sort(),
    }];
  }));
}

function detectorSummary(value) {
  if (!value) return null;
  return {
    schemaVersion: value.schemaVersion ?? null,
    engineVersion: value.engineVersion ?? null,
    domains: Object.fromEntries(Object.keys(value.domains ?? {}).sort().map((domain) => [domain, {
      domain,
      resultCount: value.domains[domain].results?.length ?? 0,
      complete: !(value.domains[domain].results ?? []).some((item) => item.complete === false),
    }])),
    resultCount: value.results?.length ?? 0,
    incompleteResultCount: (value.results ?? []).filter((item) => item.complete === false).length,
  };
}

function stageSummary(session) {
  return deterministicSessionResult(session).stages.map((stage) => ({
    stage: stage.stageName,
    status: stage.status,
    inputDigest: stage.inputDigest,
    outputDigest: stage.outputDigest,
    budget: stage.budget,
    incompleteReasons: [...stage.incompleteReasons],
    errorCode: stage.errorCode,
  }));
}

function value(session, stage) { return session.results.get(stage)?.value ?? null; }
function publicStatus(session, override) {
  if (override) return override;
  return ['completed', 'incomplete', 'failed', 'aborted'].includes(session.status) ? session.status : 'failed';
}

export function projectScanResult(session, { status, errors = [], includeExport = true } = {}) {
  const report = value(session, 'report');
  const exportPackage = includeExport ? value(session, 'markdown-export') : null;
  const internalVerification = value(session, 'export-verification');
  const verification = includeExport ? internalVerification : null;
  let markdown = null;
  if (exportPackage) {
    try { markdown = internalGetExportFile(exportPackage, 'veilforge-report-v4.md').toString('utf8'); } catch { markdown = null; }
  }
  const finalStatus = publicStatus(session, status);
  const result = {
    ok: finalStatus === 'completed' && value(session, 'report-integrity')?.verified === true && internalVerification?.verified === true,
    status: finalStatus,
    scanId: report?.scan?.scanId ?? session.sessionId,
    compilation: compilationSummary(value(session, 'compilation')),
    analysis: analysisSummary(value(session, 'interprocedural')),
    classification: classificationSummary(value(session, 'classification')),
    detectorRun: detectorSummary(value(session, 'detectors')),
    findingRun: value(session, 'findings'),
    presentation: value(session, 'presentation'),
    report,
    reportIntegrity: value(session, 'report-integrity'),
    markdown,
    exportPackage,
    exportVerification: verification,
    incompleteReasons: [...session.incompleteReasons].sort(),
    stageSummary: stageSummary(session),
    warnings: [],
    errors,
  };
  return immutablePublic(result);
}

export function projectSessionSnapshot(session, includeExport = true) {
  const completedStages = [...session.results.keys()];
  const stageResults = Object.fromEntries(completedStages.map((stage) => {
    const item = session.results.get(stage);
    return [stage, {
      stage,
      status: item.status,
      outputDigest: item.outputDigest,
      incompleteReasons: [...item.incompleteReasons],
    }];
  }));
  return immutablePublic({
    sessionId: session.sessionId,
    status: session.status,
    currentStage: session.currentStage,
    completedStages,
    pendingStages: session.stageOrder.slice(session.stageCursor),
    stageResults,
    telemetrySummary: stageSummary(session),
    partialResult: projectScanResult(session, { includeExport }),
    aborted: session.signal.aborted,
  });
}
