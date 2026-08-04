export class InterproceduralWorklist {
  constructor(initial = []) {
    this.pending = new Set(initial);
    this.revisits = new Map();
  }

  add(id) { this.pending.add(id); }

  take() {
    const id = [...this.pending].sort()[0];
    if (id === undefined) return null;
    this.pending.delete(id);
    this.revisits.set(id, (this.revisits.get(id) ?? 0) + 1);
    return id;
  }

  revisitCount(id) { return this.revisits.get(id) ?? 0; }
  totalRevisits() { return [...this.revisits.values()].reduce((sum, value) => sum + value, 0); }
  get size() { return this.pending.size; }
}
