export class ClassificationInputError extends Error {
  constructor(message, details = null) { super(message); this.name = 'ClassificationInputError'; this.details = details; }
}

export class PolicyValidationError extends Error {
  constructor(message, details = null) { super(message); this.name = 'PolicyValidationError'; this.details = details; }
}
