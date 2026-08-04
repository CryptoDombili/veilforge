import{reportError}from'./errors.js';
export function createReportContext(input){if(!input||typeof input!=='object')throw reportError('REPORT_SCHEMA_INVALID','Report builder input is required.');return input;}
