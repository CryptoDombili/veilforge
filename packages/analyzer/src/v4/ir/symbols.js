import { compareCodePoints } from '../frontend/standard-json.js';
import { createSymbolId } from './ids.js';
import { Symbol } from './model.js';
import { IRInvariantError } from './errors.js';

export function symbolFromDeclaration(declaration, scopeId) {
  const symbolId = createSymbolId({
    kind: declaration.kind,
    declarationId: declaration.id,
    scopeId,
    name: declaration.name ?? '',
    canonicalName: declaration.canonicalName,
  });
  return new Symbol({
    symbolId,
    name: declaration.name ?? '',
    kind: declaration.kind,
    declarationId: declaration.id,
    scopeId,
    location: declaration.location,
    sourcePath: declaration.sourcePath,
    astNodeId: declaration.astNodeId,
    parentId: declaration.parentId,
    contractContext: declaration.contractContext,
    canonicalName: declaration.canonicalName,
    typeDescription: declaration.typeDescription ?? null,
    visibility: declaration.visibility ?? null,
    mutability: declaration.mutability ?? null,
    storageLocation: declaration.storageLocation ?? null,
  });
}

export class SymbolTable {
  constructor() {
    this.symbols = [];
    this.byId = new Map();
    this.byDeclarationAstId = new Map();
  }

  add(symbol) {
    if (this.byId.has(symbol.symbolId)) throw new IRInvariantError(`Duplicate symbol ID: ${symbol.symbolId}`);
    this.symbols.push(symbol);
    this.byId.set(symbol.symbolId, symbol);
    if (Number.isInteger(symbol.astNodeId)) this.byDeclarationAstId.set(symbol.astNodeId, symbol);
    return symbol;
  }

  get(symbolId) { return this.byId.get(symbolId) ?? null; }
  getByAstId(astNodeId) { return this.byDeclarationAstId.get(astNodeId) ?? null; }

  finalize() {
    this.symbols.sort((left, right) => compareCodePoints(left.symbolId, right.symbolId));
    return this.symbols;
  }
}
