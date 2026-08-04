export class Terminator {
  constructor({ kind, astNodeId = null, location = null, targetBlockIds = [], conditionAstId = null }) {
    this.kind = kind;
    this.astNodeId = astNodeId;
    this.location = location;
    this.targetBlockIds = [...targetBlockIds];
    this.conditionAstId = conditionAstId;
  }
}

export class BasicBlock {
  constructor(fields) {
    Object.assign(this, {
      blockId: fields.blockId,
      callableId: fields.callableId,
      kind: fields.kind,
      statementAstIds: [...(fields.statementAstIds ?? [])],
      location: fields.location ?? null,
      predecessorIds: [],
      successorIds: [],
      terminator: fields.terminator ?? null,
      unreachable: Boolean(fields.unreachable),
    });
  }
}

export class ControlFlowEdge {
  constructor(fields) {
    Object.assign(this, {
      edgeId: fields.edgeId,
      cfgId: fields.cfgId,
      fromBlockId: fields.fromBlockId,
      toBlockId: fields.toBlockId,
      edgeKind: fields.edgeKind,
      conditionAstId: fields.conditionAstId ?? null,
      reachable: fields.reachable !== false,
    });
  }
}

export class ControlFlowGraph {
  constructor(fields) {
    Object.assign(this, {
      cfgId: fields.cfgId,
      callableId: fields.callableId,
      callableCanonicalName: fields.callableCanonicalName,
      entryBlockId: fields.entryBlockId,
      normalExitBlockId: fields.normalExitBlockId,
      revertExitBlockId: fields.revertExitBlockId,
      blocks: fields.blocks ?? [],
      edges: fields.edges ?? [],
      unsupportedControlFlow: fields.unsupportedControlFlow ?? [],
      modifierOrder: fields.modifierOrder ?? [],
    });
  }
}
