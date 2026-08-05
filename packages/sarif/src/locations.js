import path from 'node:path';
import { sarifError } from './errors.js';
export function safeArtifactUri(value) {
  if (typeof value !== 'string' || !value || value.includes('\0') || /^[a-z][a-z0-9+.-]*:/i.test(value) || path.win32.isAbsolute(value) || path.posix.isAbsolute(value)) throw sarifError('SARIF_LOCATION_UNSAFE');
  const uri = value.replaceAll('\\', '/');
  if (uri.split('/').some((part) => part === '..' || part === '')) throw sarifError('SARIF_LOCATION_UNSAFE');
  return uri;
}
export function physicalLocation(location, artifactIndexes) {
  const uri = safeArtifactUri(location.sourcePath);
  const region = {};
  if (Number.isInteger(location.startLine) && location.startLine > 0) region.startLine = location.startLine;
  if (Number.isInteger(location.startColumn) && location.startColumn > 0) region.startColumn = location.startColumn;
  if (Number.isInteger(location.endLine) && location.endLine > 0) region.endLine = location.endLine;
  if (Number.isInteger(location.endColumn) && location.endColumn > 0) region.endColumn = location.endColumn;
  return { artifactLocation: { uri, index: artifactIndexes.get(uri) }, ...(Object.keys(region).length ? { region } : {}), properties: { byteStart: location.byteStart ?? null, byteEnd: location.byteEnd ?? null } };
}
