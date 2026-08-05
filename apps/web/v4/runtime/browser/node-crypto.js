import { BrowserBuffer } from './byte-buffer.js';
import { sha256Bytes } from './sha256.js';

export function createHash(algorithm) {
  if (String(algorithm).toLowerCase() !== 'sha256') throw new TypeError('Only SHA-256 is available in the browser analyzer runtime.');
  const chunks = [];
  return {
    update(value) { chunks.push(BrowserBuffer.from(value)); return this; },
    digest(encoding) {
      const length = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      const digest = BrowserBuffer.from(sha256Bytes(bytes));
      return encoding ? digest.toString(encoding) : digest;
    },
  };
}
