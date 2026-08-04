import { CatalogMissingError } from './errors.js';
import { COMMON_CATALOG, DATA_LABELS, EVIDENCE_LABELS, SURFACE_LABELS } from './catalogs/common.js';
import { PAYMENTS_CATALOG } from './catalogs/payments.js'; import { TREASURY_CATALOG } from './catalogs/treasury.js'; import { PRIVATE_CREDIT_CATALOG } from './catalogs/private-credit.js';

export const CATALOG_VERSION = '1.0.0';
export const DEFAULT_CATALOG = Object.freeze({ version: CATALOG_VERSION, messages: COMMON_CATALOG, dataLabels: DATA_LABELS, surfaceLabels: SURFACE_LABELS, evidenceLabels: EVIDENCE_LABELS,
  domains: Object.freeze({ 'arc-payments': PAYMENTS_CATALOG, 'arc-treasury': TREASURY_CATALOG, 'arc-private-credit': PRIVATE_CREDIT_CATALOG }) });

export function catalogValue(catalog, section, key) { const value = catalog?.[section]?.[key]; if (value === undefined) throw new CatalogMissingError(`${section}.${key}`); return value; }
export function catalogMessage(catalog, key, parameters = {}) { let value = catalogValue(catalog, 'messages', key); for (const name of [...Object.keys(parameters)].sort()) value = value.replaceAll(`{${name}}`, String(parameters[name])); return value; }
export function domainTerminology(catalog, domain) { const value = catalog?.domains?.[domain]?.terminology; if (!value) throw new CatalogMissingError(`domains.${domain}.terminology`); return value; }
