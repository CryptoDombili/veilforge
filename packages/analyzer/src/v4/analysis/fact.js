import { analysisId, locationAnchor } from './value-node.js';

export class DataflowFact {
  constructor(fields = {}) {
    Object.assign(this, {
      factId: fields.factId,
      callableId: fields.callableId,
      blockId: fields.blockId ?? null,
      bindingKey: fields.bindingKey,
      symbolId: fields.symbolId ?? null,
      expressionIdentity: fields.expressionIdentity ?? null,
      valueKind: fields.valueKind ?? 'unknown',
      originIds: [...(fields.originIds ?? [])],
      currentLocation: fields.currentLocation ?? null,
      pathConditions: [...(fields.pathConditions ?? [])],
      confidence: fields.confidence ?? 'exact',
      provenance: fields.provenance ?? 'intraprocedural',
    });
  }
}

export function createFact(fields) {
  const originIds = [...new Set(fields.originIds ?? [])].sort();
  const pathConditions = [...(fields.pathConditions ?? [])].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const semantic = {
    callableId: fields.callableId, blockId: fields.blockId ?? null, bindingKey: fields.bindingKey,
    symbolId: fields.symbolId ?? null, expressionIdentity: fields.expressionIdentity ?? null,
    valueKind: fields.valueKind ?? 'unknown', originIds, location: locationAnchor(fields.currentLocation),
    pathConditions, confidence: fields.confidence ?? 'exact', provenance: fields.provenance ?? 'intraprocedural',
  };
  return new DataflowFact({ ...fields, ...semantic, factId: analysisId('fact', semantic) });
}

export class AnalysisIncomplete {
  constructor(fields = {}) {
    const semantic = {
      callableId: fields.callableId, reason: fields.reason, astNodeId: fields.astNodeId ?? null,
      blockId: fields.blockId ?? null, location: locationAnchor(fields.location), details: fields.details ?? null,
    };
    Object.assign(this, {
      incompleteId: fields.incompleteId ?? analysisId('analysis-incomplete', semantic),
      ...semantic,
      location: fields.location ?? null,
      recoverable: fields.recoverable !== false,
    });
  }
}

export class CallableAnalysis {
  constructor(fields = {}) {
    Object.assign(this, {
      callableId: fields.callableId,
      callableCanonicalName: fields.callableCanonicalName,
      cfgId: fields.cfgId,
      status: fields.status ?? 'complete',
      facts: fields.facts ?? [],
      valueNodes: fields.valueNodes ?? [],
      valueFlowEdges: fields.valueFlowEdges ?? [],
      traces: fields.traces ?? [],
      incomplete: fields.incomplete ?? [],
      iterations: fields.iterations ?? 0,
      converged: fields.converged !== false,
      summary: fields.summary ?? null,
    });
  }
}
