import { createRequire } from 'node:module';
import { CompilerOutputError, CompilerUnavailableError, UnsupportedCompilerError } from './errors.js';

export const SUPPORTED_SOLC_VERSION = '0.8.24';
const require = createRequire(import.meta.url);

function loadBundledCompiler() {
  try {
    return require('solc');
  } catch (error) {
    throw new CompilerUnavailableError('The solc 0.8.24 package could not be loaded.', { cause: error.message });
  }
}

export function compilerVersionInfo(compiler) {
  if (!compiler || typeof compiler.version !== 'function' || typeof compiler.compile !== 'function') {
    throw new CompilerUnavailableError('The loaded solc package does not expose version() and compile().');
  }
  const longVersion = String(compiler.version());
  const version = longVersion.split('+')[0];
  return { version, longVersion };
}

export function getCompiler({ requestedVersion = SUPPORTED_SOLC_VERSION, compiler = null } = {}) {
  if (requestedVersion !== SUPPORTED_SOLC_VERSION) throw new UnsupportedCompilerError(requestedVersion);
  const instance = compiler ?? loadBundledCompiler();
  const info = compilerVersionInfo(instance);
  if (info.version !== SUPPORTED_SOLC_VERSION) throw new UnsupportedCompilerError(requestedVersion, info.longVersion);
  return { compiler: instance, ...info };
}

export function compileStandardJson(input, options = {}) {
  const provider = getCompiler(options);
  let rawOutput;
  try {
    rawOutput = provider.compiler.compile(typeof input === 'string' ? input : JSON.stringify(input));
  } catch (error) {
    throw new CompilerOutputError('solc failed before returning Standard JSON output.', { cause: error.message });
  }
  try {
    return { ...provider, output: JSON.parse(rawOutput), rawOutput };
  } catch (error) {
    throw new CompilerOutputError('solc returned invalid JSON.', { cause: error.message });
  }
}
