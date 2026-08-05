const split = (value) => String(value).replaceAll('\\', '/').split('/');
function normalize(value) {
  const output = [];
  for (const part of split(value)) {
    if (!part || part === '.') continue;
    if (part === '..') output.pop(); else output.push(part);
  }
  return output.join('/');
}
const posix = Object.freeze({
  dirname(value) { const parts = split(value); parts.pop(); return normalize(parts.join('/')) || '.'; },
  join(...values) { return normalize(values.join('/')); },
});
export default Object.freeze({ posix });
