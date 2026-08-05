import soljson from '../../soljson-v0.8.24.js';
import { COMPILER_DIGEST, COMPILER_VERSION } from './runtime-config.js';

let compiler;

function bind(name, result, parameters) {
  const value = soljson.cwrap(name, result, parameters);
  if (typeof value !== 'function') throw new Error(`Pinned Solidity compiler binding is unavailable: ${name}`);
  return value;
}

export function createBrowserCompiler() {
  if (compiler) return compiler;
  const version = bind('solidity_version', 'string', []);
  const compile = bind('solidity_compile', 'string', ['string', 'number', 'number']);
  const reset = typeof soljson._solidity_reset === 'function' ? bind('solidity_reset', null, []) : null;
  const longVersion = String(version());
  if (longVersion.split('+')[0] !== COMPILER_VERSION) throw new Error(`Pinned compiler version mismatch: ${longVersion}`);
  compiler = Object.freeze({
    compilerDigest: COMPILER_DIGEST,
    version: () => longVersion,
    compile(input) {
      const output = compile(String(input), 0, 0);
      reset?.();
      return output;
    },
  });
  return compiler;
}
