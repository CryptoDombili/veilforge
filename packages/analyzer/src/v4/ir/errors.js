export class IRError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.details = details;
  }
}

export class IRInputError extends IRError {
  constructor(message, details) { super('invalid-ir-input', message, details); }
}

export class IRInvariantError extends IRError {
  constructor(message, details) { super('invalid-ir-invariant', message, details); }
}
