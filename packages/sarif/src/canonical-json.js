function normalized(value) {
  if (Array.isArray(value)) return value.map(normalized);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter((key) => value[key] !== undefined).map((key) => [key, normalized(value[key])]));
  return value;
}
export function canonicalSarifJson(value) { return `${JSON.stringify(normalized(value), null, 2)}\n`; }
