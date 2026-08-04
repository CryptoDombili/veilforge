import { domainHash } from '../frontend/standard-json.js';

export const ANALYSIS_ID_DOMAIN = 'veilforge:v4:dataflow-id:1';

export function analysisId(kind, semanticContext) {
  return domainHash(ANALYSIS_ID_DOMAIN, { kind, semanticContext });
}

export function locationAnchor(location) {
  return location ? { sourcePath: location.sourcePath, byteStart: location.byteStart, byteEnd: location.byteEnd } : null;
}

export class ValueNode {
  constructor(fields = {}) {
    Object.assign(this, {
      valueNodeId: fields.valueNodeId,
      callableId: fields.callableId,
      valueKind: fields.valueKind ?? 'unknown',
      symbolId: fields.symbolId ?? null,
      expressionAstId: fields.expressionAstId ?? null,
      storageAccessId: fields.storageAccessId ?? null,
      storagePath: [...(fields.storagePath ?? [])],
      location: fields.location ?? null,
      blockId: fields.blockId ?? null,
      boundary: fields.boundary ?? null,
      unknown: Boolean(fields.unknown),
      provenance: fields.provenance ?? null,
    });
  }
}

export class ValueFlowEdge {
  constructor(fields = {}) {
    Object.assign(this, {
      edgeId: fields.edgeId,
      callableId: fields.callableId,
      fromValueNodeId: fields.fromValueNodeId,
      toValueNodeId: fields.toValueNodeId,
      flowKind: fields.flowKind,
      location: fields.location ?? null,
      blockId: fields.blockId ?? null,
      pathConditions: [...(fields.pathConditions ?? [])],
      boundary: fields.boundary ?? null,
    });
  }
}
