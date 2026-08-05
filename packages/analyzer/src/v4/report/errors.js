export class ReportError extends Error { constructor(code,message,details={}){super(message);this.name='ReportError';this.code=code;this.details=details;} }
export const reportError=(code,message,details)=>new ReportError(code,message,details);
export const REPORT_ERROR_CODES=Object.freeze(['REPORT_SCHEMA_INVALID','REPORT_CONSISTENCY_ERROR','REPORT_CANONICALIZATION_ERROR','REPORT_HASH_ERROR','REPORT_INTEGRITY_MISMATCH','REPORT_UNSAFE_METADATA','REPORT_VERSION_UNSUPPORTED']);
