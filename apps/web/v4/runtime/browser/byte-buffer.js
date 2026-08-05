const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

function bytesFromString(value, encoding) {
  if (encoding === 'hex') {
    if (!/^(?:[0-9a-f]{2})*$/iu.test(value)) throw new TypeError('Invalid hexadecimal bytes.');
    return Uint8Array.from(value.match(/../gu) ?? [], (pair) => Number.parseInt(pair, 16));
  }
  if (encoding === 'base64') {
    const binary = globalThis.atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  }
  return encoder.encode(value);
}

export class BrowserBuffer extends Uint8Array {
  static from(value, encoding = 'utf8') {
    if (typeof value === 'string') return new BrowserBuffer(bytesFromString(value, encoding));
    if (value instanceof ArrayBuffer) return new BrowserBuffer(value.slice(0));
    if (ArrayBuffer.isView(value)) return new BrowserBuffer(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
    return new BrowserBuffer(Uint8Array.from(value ?? []));
  }

  static isBuffer(value) { return value instanceof BrowserBuffer; }
  static byteLength(value, encoding = 'utf8') { return BrowserBuffer.from(value, encoding).byteLength; }

  toString(encoding = 'utf8') {
    if (encoding === 'hex') return [...this].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    if (encoding === 'base64') return globalThis.btoa(String.fromCharCode(...this));
    return decoder.decode(this);
  }

  equals(other) {
    const right = BrowserBuffer.from(other);
    return this.byteLength === right.byteLength && this.every((byte, index) => byte === right[index]);
  }
}

export function installBrowserBuffer(scope = globalThis) {
  if (!scope.Buffer) Object.defineProperty(scope, 'Buffer', { value: BrowserBuffer, configurable: true });
  return scope.Buffer;
}
