import{createHash}from'node:crypto';import{canonicalReportBytes}from'./canonical-json.js';import{reportError}from'./errors.js';
export const HASH_PAYLOAD_VERSION='veilforge.report.hash.v1';
export const HASH_EXCLUSIONS=Object.freeze(['scan.operational','integrity.reportHash','integrity.verified','integrity.signature','integrity.transactionHash','extensions.uiState']);
function clone(value){if(Array.isArray(value))return value.map(clone);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,clone(v)]));return value;}
export function reportHashPayload(report){const value=clone(report);if(value.scan)delete value.scan.operational;if(value.integrity){delete value.integrity.reportHash;delete value.integrity.verified;delete value.integrity.signature;delete value.integrity.transactionHash;}if(value.extensions)delete value.extensions.uiState;return value;}
export function sha256Digest(value){try{return`sha256:${createHash('sha256').update(canonicalReportBytes(value)).digest('hex')}`;}catch(error){if(error.code)throw error;throw reportError('REPORT_HASH_ERROR',error.message);}}
export function calculateReportHash(report){return sha256Digest(reportHashPayload(report));}
