export const PROGRAM_IR_SCHEMA_VERSION = '1.0.0';
export const PROGRAM_IR_ENGINE_VERSION = '4.0.0-gc.1';

export class IRNode {
  constructor(fields = {}) {
    Object.assign(this, {
      id: fields.id,
      nodeType: fields.nodeType ?? new.target.name,
      kind: fields.kind ?? null,
      location: fields.location ?? null,
      sourcePath: fields.sourcePath ?? fields.location?.sourcePath ?? null,
      astNodeId: fields.astNodeId ?? null,
      parentId: fields.parentId ?? null,
      contractContext: fields.contractContext ?? null,
      canonicalName: fields.canonicalName ?? null,
    }, fields);
  }
}

export class ProgramIR extends IRNode {
  constructor(fields = {}) {
    super({
      schemaVersion: PROGRAM_IR_SCHEMA_VERSION,
      engineVersion: PROGRAM_IR_ENGINE_VERSION,
      status: 'complete',
      nodeType: 'ProgramIR', kind: 'program', canonicalName: 'program',
      sources: [], contracts: [], declarations: [], operations: [], symbols: [], scopes: [], inheritance: [],
      storageAccesses: [], unsupportedNodes: [], summary: null,
      ...fields,
    });
  }

  attachScopeGraph(scopeGraph) {
    Object.defineProperty(this, '_scopeGraph', { value: scopeGraph, enumerable: false, configurable: false });
    return this;
  }

  attachCompilationContext(compilation) {
    Object.defineProperty(this, '_compilation', { value: compilation, enumerable: false, configurable: false });
    return this;
  }

  lookupSymbols(name, scopeId) {
    return this._scopeGraph?.lookup(name, scopeId) ?? [];
  }
}

export class SourceUnitIR extends IRNode { constructor(fields = {}) { super({ nodeType: 'SourceUnitIR', kind: 'source-unit', ...fields }); } }
export class ContractIR extends IRNode { constructor(fields = {}) { super({ nodeType: 'ContractIR', kind: 'contract', ...fields }); } }

export class CallableIR extends IRNode { constructor(fields = {}) { super({ nodeType: 'CallableIR', ...fields }); } }
export class FunctionIR extends CallableIR { constructor(fields = {}) { super({ nodeType: 'FunctionIR', kind: 'function', ...fields }); } }
export class ModifierIR extends CallableIR { constructor(fields = {}) { super({ nodeType: 'ModifierIR', kind: 'modifier', ...fields }); } }
export class EventIR extends CallableIR { constructor(fields = {}) { super({ nodeType: 'EventIR', kind: 'event', ...fields }); } }
export class ErrorIR extends CallableIR { constructor(fields = {}) { super({ nodeType: 'ErrorIR', kind: 'error', ...fields }); } }
export class StructIR extends IRNode { constructor(fields = {}) { super({ nodeType: 'StructIR', kind: 'struct', ...fields }); } }
export class EnumIR extends IRNode { constructor(fields = {}) { super({ nodeType: 'EnumIR', kind: 'enum', ...fields }); } }
export class StateVariableIR extends IRNode { constructor(fields = {}) { super({ nodeType: 'StateVariableIR', kind: 'state-variable', ...fields }); } }
export class LocalVariableIR extends IRNode { constructor(fields = {}) { super({ nodeType: 'LocalVariableIR', kind: 'local-variable', ...fields }); } }
export class ParameterIR extends IRNode { constructor(fields = {}) { super({ nodeType: 'ParameterIR', kind: 'parameter', ...fields }); } }
export class ReturnParameterIR extends IRNode { constructor(fields = {}) { super({ nodeType: 'ReturnParameterIR', kind: 'return-parameter', ...fields }); } }

export class Symbol extends IRNode {
  constructor(fields = {}) {
    super({ nodeType: 'Symbol', id: fields.symbolId, canonicalName: fields.canonicalName ?? fields.name, ...fields });
    this.symbolId = fields.symbolId;
  }
}

export class Scope extends IRNode {
  constructor(fields = {}) {
    super({ nodeType: 'Scope', kind: fields.scopeType, id: fields.scopeId, parentId: fields.parentScopeId ?? null, ...fields });
    this.scopeId = fields.scopeId;
    this.symbolIds = [...(fields.symbolIds ?? [])];
    this.inheritedScopeIds = [...(fields.inheritedScopeIds ?? [])];
  }
}

export class StorageAccess extends IRNode {
  constructor(fields = {}) {
    super({ nodeType: 'StorageAccess', kind: 'storage-access', id: fields.accessId, ...fields });
    this.accessId = fields.accessId;
  }
}
