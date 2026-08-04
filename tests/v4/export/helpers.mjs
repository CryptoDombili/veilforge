import{report as buildFixture,context,projection}from'../report/helpers.mjs';
import{buildReport}from'../../../packages/analyzer/src/v4/report/index.js';
import{buildExportPackage}from'../../../packages/analyzer/src/v4/export/index.js';
export const report=(overrides={},options={})=>buildFixture(overrides,options);
export function threeDomainReport(){const values=['arc-payments','arc-treasury','arc-private-credit'].map((domain,index)=>projection(domain,`export-${index}`).presentationRun.findings[0]);const raw=context();raw.presentationRun={findings:values};raw.findingRun=null;return buildReport(raw);}
export const pkg=value=>buildExportPackage(value??report());
export function copyPackage(value){return{manifest:structuredClone(value.manifest),files:value.files.map(file=>({...file,bytes:Buffer.from(file.bytes)}))};}
