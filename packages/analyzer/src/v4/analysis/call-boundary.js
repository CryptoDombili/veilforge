import { analysisId, locationAnchor } from './value-node.js';

export class CallBoundary {
  constructor(fields = {}) {
    const semantic = {
      callEdgeId: fields.callEdgeId,
      callerCallableId: fields.callerCallableId,
      calleeCallableId: fields.calleeCallableId ?? null,
      callKind: fields.callKind,
      resolutionStatus: fields.resolutionStatus,
      propagationStatus: fields.propagationStatus,
      reason: fields.reason,
      expressionAstId: fields.expressionAstId,
      location: locationAnchor(fields.location),
    };
    Object.assign(this, {
      boundaryId: fields.boundaryId ?? analysisId('call-boundary', semantic),
      ...semantic,
      location: fields.location ?? null,
      argumentMappings: [...(fields.argumentMappings ?? [])],
      returnMappings: [...(fields.returnMappings ?? [])],
      markers: [...(fields.markers ?? [])],
    });
  }
}

export class InterproceduralFlowEdge {
  constructor(fields = {}) {
    const semantic = {
      callEdgeId: fields.callEdgeId ?? null,
      fromCallableId: fields.fromCallableId,
      toCallableId: fields.toCallableId,
      fromValueNodeId: fields.fromValueNodeId,
      toValueNodeId: fields.toValueNodeId,
      flowKind: fields.flowKind,
      argumentIndex: fields.argumentIndex ?? null,
      returnIndex: fields.returnIndex ?? null,
      storagePath: fields.storagePath ?? null,
    };
    Object.assign(this, {
      edgeId: fields.edgeId ?? analysisId('interprocedural-flow-edge', semantic),
      ...semantic,
      callSiteLocation: fields.callSiteLocation ?? null,
      calleeLocation: fields.calleeLocation ?? null,
      confidence: fields.confidence ?? 'exact',
      provenance: fields.provenance ?? 'interprocedural',
    });
  }
}
