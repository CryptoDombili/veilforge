import{exportError}from'./errors.js';
const CONTROL=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu;
export function normalizeMarkdownValue(value){if(value===null||value===undefined)return'Not available';let text=String(value).replace(/^\ufeff/u,'').normalize('NFC').replace(/\r\n?/gu,'\n').replace(CONTROL,'�').replace(/[\n\t]+/gu,' ');if(/\u0000/u.test(text))throw exportError('EXPORT_UNSAFE_MARKDOWN','NUL is not allowed in Markdown values.');return text.trim()||'Not available';}
export function escapeMarkdown(value){return normalizeMarkdownValue(value).replace(/&/gu,'&amp;').replace(/</gu,'&lt;').replace(/>/gu,'&gt;').replace(/\\/gu,'\\\\').replace(/([|`#*_[\]()!])/gu,'\\$1');}
export function markdownList(values=[]){return values.length?values.map(value=>`- ${escapeMarkdown(value)}`).join('\n'):'- None';}
