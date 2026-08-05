import { byteOffsetToLineColumn } from './source-locations.js';

function integerOrNull(value) {
  return Number.isInteger(value) ? value : null;
}

export function normalizeDiagnostic(diagnostic, sourcesByPath = new Map()) {
  const location = diagnostic?.sourceLocation ?? {};
  const sourcePath = location.file ?? null;
  const byteStart = integerOrNull(location.start);
  const byteEnd = integerOrNull(location.end);
  const content = sourcePath ? sourcesByPath.get(sourcePath)?.content : null;
  const position = content !== null && content !== undefined && byteStart !== null
    ? byteOffsetToLineColumn(content, byteStart)
    : { line: null, column: null };
  return {
    severity: diagnostic?.severity ?? 'error',
    errorCode: diagnostic?.errorCode === undefined ? null : String(diagnostic.errorCode),
    type: diagnostic?.type ?? null,
    component: diagnostic?.component ?? null,
    message: diagnostic?.message ?? '',
    formattedMessage: diagnostic?.formattedMessage ?? diagnostic?.message ?? '',
    sourcePath,
    byteStart,
    byteLength: byteStart !== null && byteEnd !== null ? byteEnd - byteStart : null,
    line: position?.line ?? null,
    column: position?.column ?? null,
  };
}

export function collectDiagnostics(output, sources) {
  const byPath = new Map(sources.map((source) => [source.path, source]));
  return [...(output?.errors ?? [])].map((diagnostic) => normalizeDiagnostic(diagnostic, byPath));
}

export function hasCompilerErrors(diagnostics) {
  return diagnostics.some((diagnostic) => diagnostic.severity === 'error');
}
