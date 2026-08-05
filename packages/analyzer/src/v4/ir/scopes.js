import { compareCodePoints } from '../frontend/standard-json.js';
import { Scope } from './model.js';
import { IRInvariantError } from './errors.js';

export class ScopeGraph {
  constructor(symbolTable) {
    this.symbolTable = symbolTable;
    this.scopes = [];
    this.byId = new Map();
  }

  add(scopeFields) {
    const scope = scopeFields instanceof Scope ? scopeFields : new Scope(scopeFields);
    if (this.byId.has(scope.scopeId)) throw new IRInvariantError(`Duplicate scope ID: ${scope.scopeId}`);
    if (scope.parentScopeId && !this.byId.has(scope.parentScopeId)) throw new IRInvariantError(`Unknown parent scope: ${scope.parentScopeId}`);
    this.scopes.push(scope);
    this.byId.set(scope.scopeId, scope);
    return scope;
  }

  addSymbol(scopeId, symbol) {
    const scope = this.byId.get(scopeId);
    if (!scope) throw new IRInvariantError(`Unknown symbol scope: ${scopeId}`);
    scope.symbolIds.push(symbol.symbolId);
  }

  setInheritedScopes(scopeId, inheritedScopeIds) {
    const scope = this.byId.get(scopeId);
    if (!scope) throw new IRInvariantError(`Unknown contract scope: ${scopeId}`);
    for (const inheritedScopeId of inheritedScopeIds) if (!this.byId.has(inheritedScopeId)) throw new IRInvariantError(`Unknown inherited scope: ${inheritedScopeId}`);
    scope.inheritedScopeIds = [...inheritedScopeIds];
  }

  symbolsNamed(scope, name) {
    return scope.symbolIds.map((symbolId) => this.symbolTable.get(symbolId)).filter((symbol) => symbol?.name === name);
  }

  lookup(name, startScopeId) {
    let scope = this.byId.get(startScopeId);
    while (scope) {
      const matches = this.symbolsNamed(scope, name);
      if (matches.length) return matches.sort((a, b) => compareCodePoints(a.canonicalName, b.canonicalName));
      if (scope.scopeType === 'contract') {
        for (const inheritedScopeId of scope.inheritedScopeIds) {
          const inheritedMatches = this.symbolsNamed(this.byId.get(inheritedScopeId), name);
          if (inheritedMatches.length) return inheritedMatches.sort((a, b) => compareCodePoints(a.canonicalName, b.canonicalName));
        }
      }
      scope = scope.parentScopeId ? this.byId.get(scope.parentScopeId) : null;
    }
    return [];
  }

  finalize() {
    for (const scope of this.scopes) {
      scope.symbolIds.sort(compareCodePoints);
      scope.inheritedScopeIds = [...scope.inheritedScopeIds];
    }
    this.scopes.sort((left, right) => compareCodePoints(left.scopeId, right.scopeId));
    return this.scopes;
  }
}
