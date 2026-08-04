export class DeterministicWorklist {
  constructor(initial = []) {
    this.pending = new Set(initial);
  }

  add(item) { this.pending.add(item); }

  take() {
    const next = [...this.pending].sort()[0];
    if (next !== undefined) this.pending.delete(next);
    return next;
  }

  get size() { return this.pending.size; }
}
