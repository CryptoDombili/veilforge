import{canonicalJson}from'../frontend/standard-json.js';import{plain}from'../classification/common.js';
export function serializePresentation(value){return canonicalJson(plain(value));}
