import{exportError}from'./errors.js';
export const REPORT_JSON_FILENAME='veilforge-report-v4.json';
export const REPORT_MARKDOWN_FILENAME='veilforge-report-v4.md';
export const EXPORT_MANIFEST_FILENAME='veilforge-export-manifest.json';
const RESERVED=/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu;
export function assertSafeFilename(value){const filename=String(value??'');if(!filename||filename.length>128||/[\u0000-\u001f\u007f/\\]/u.test(filename)||filename==='.'||filename==='..'||filename.includes('..')||/^[A-Za-z]:/u.test(filename)||RESERVED.test(filename))throw exportError('EXPORT_UNSAFE_FILENAME',`Unsafe export filename: ${filename||'<empty>'}`,{filename});return filename;}
export function defaultExportFilenames(){return[REPORT_JSON_FILENAME,REPORT_MARKDOWN_FILENAME,EXPORT_MANIFEST_FILENAME];}
