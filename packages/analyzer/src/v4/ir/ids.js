import { domainHash } from '../frontend/standard-json.js';

export const IR_ID_DOMAIN = 'veilforge:v4:ir-id:1';

export function deterministicId(kind, semanticContext) {
  return domainHash(IR_ID_DOMAIN, { kind, semanticContext });
}

export function locationAnchor(location) {
  if (!location) return null;
  return {
    sourcePath: location.sourcePath,
    byteStart: location.byteStart,
    byteEnd: location.byteEnd,
  };
}

export function declarationId({ kind, sourcePath, contractContext, canonicalName, location }) {
  return deterministicId('declaration', { kind, sourcePath, contractContext, canonicalName, anchor: locationAnchor(location) });
}

export function createScopeId({ scopeType, ownerId, parentScopeId, sourcePath, location }) {
  return deterministicId('scope', { scopeType, ownerId, parentScopeId, sourcePath, anchor: locationAnchor(location) });
}

export function createSymbolId({ kind, declarationId: ownerDeclarationId, scopeId, name, canonicalName }) {
  return deterministicId('symbol', { kind, declarationId: ownerDeclarationId, scopeId, name, canonicalName });
}

export function createOperationId({ nodeType, sourcePath, contractContext, callableId, location }) {
  return deterministicId('operation', { nodeType, sourcePath, contractContext, callableId, anchor: locationAnchor(location) });
}

export function createStorageAccessId({ contractId, callableId, symbolId, accessKind, pathSegments, location }) {
  return deterministicId('storage-access', { contractId, callableId, symbolId, accessKind, pathSegments, anchor: locationAnchor(location) });
}
