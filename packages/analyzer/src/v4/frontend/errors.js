export class FrontendError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.details = details;
  }
}

export class CompilerUnavailableError extends FrontendError {
  constructor(message = 'The exact solc compiler package is unavailable.', details) {
    super('compiler-unavailable', message, details);
  }
}

export class UnsupportedCompilerError extends FrontendError {
  constructor(requestedVersion, actualVersion = null) {
    super('unsupported-compiler', `VeilForge v4 supports exact solc 0.8.24; requested ${requestedVersion ?? 'unknown'}.`, {
      requestedVersion: requestedVersion ?? null,
      actualVersion,
      supportedVersion: '0.8.24',
    });
  }
}

export class SourceNormalizationError extends FrontendError {
  constructor(code, message, details) {
    super(code, message, details);
  }
}

export class CompilerOutputError extends FrontendError {
  constructor(message, details) {
    super('invalid-compiler-output', message, details);
  }
}
