export class PresentationInputError extends Error { constructor(message) { super(message); this.name = 'PresentationInputError'; } }
export class CatalogMissingError extends Error { constructor(key) { super(`Presentation catalog key is missing: ${key}`); this.name = 'CatalogMissingError'; this.code = 'PRESENTATION_CATALOG_MISSING'; this.key = key; } }
