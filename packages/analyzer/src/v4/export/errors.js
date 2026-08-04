export const EXPORT_ERROR_CODES=Object.freeze(['EXPORT_RENDER_ERROR','EXPORT_UNSAFE_MARKDOWN','EXPORT_UNSAFE_FILENAME','EXPORT_MANIFEST_INVALID','EXPORT_INTEGRITY_MISMATCH','EXPORT_FILE_MISSING','EXPORT_FILE_UNEXPECTED','EXPORT_WRITE_ERROR']);
export class ExportError extends Error{constructor(code,message,details={}){super(message);this.name='ExportError';this.code=code;this.details=details;}}
export const exportError=(code,message,details={})=>new ExportError(code,message,details);
