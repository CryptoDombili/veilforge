export const bytes = (values) => new Uint8Array(values);
export function browserFile(path, content = 'contract Case {}') {
  const data = typeof content === 'string' ? new TextEncoder().encode(content) : content;
  return { name: path.split(/[\\/]/u).at(-1), webkitRelativePath: path, size: data.byteLength, async arrayBuffer() { return data.slice().buffer; } };
}

export function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  const writes = [];
  return {
    writes,
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { writes.push(key); values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    value(key) { return values.get(key); },
  };
}

export const wait = (milliseconds = 0) => new Promise((resolve) => setTimeout(resolve, milliseconds));
