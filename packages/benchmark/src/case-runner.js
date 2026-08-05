import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { scanProject } from '../../sdk/src/scan.js';
import { renderSarif, verifySarif } from '../../sarif/src/index.js';
import { benchmarkError } from './errors.js';
async function sources(root, directory=root, output={}) { for (const item of await readdir(directory,{withFileTypes:true})) { const absolute=path.join(directory,item.name); if(item.isSymbolicLink())throw benchmarkError('BENCHMARK_CASE_INVALID','Symlink is not allowed.',{}); if(item.isDirectory())await sources(root,absolute,output); else if(item.isFile()&&item.name.endsWith('.sol'))output[path.relative(root,absolute).replaceAll('\\','/')]=await readFile(absolute,'utf8'); } return output; }
export async function loadCorpusCase(entry) {
  const compiler=JSON.parse(await readFile(path.join(entry.path,'compiler.json'),'utf8'));
  const policy=JSON.parse(await readFile(path.join(entry.path,'policy.json'),'utf8'));
  const sourceMap=await sources(path.join(entry.path,'project'));
  if (Array.isArray(compiler.declaredSourcePaths)) {
    const canonicalContent=sourceMap[compiler.sourcePath];
    if (canonicalContent===undefined) throw benchmarkError('BENCHMARK_CASE_INVALID','Declared canonical source is missing.',{caseId:entry.id});
    for (const declaredPath of compiler.declaredSourcePaths) if (!(declaredPath in sourceMap)) sourceMap[declaredPath]=canonicalContent;
  }
  return { entry, compiler, policy, sources:sourceMap };
}
function synthetic(caseId, disposition, status, reasons, code = null) { return { caseId, compileDisposition:disposition, analysisStatus:status, findings:[], incompleteReasons:[...reasons].sort(), reportHash:null, reportIntegrityVerified:false, sarifIntegrityVerified:false, errorCode:code }; }
export async function executeBenchmarkCase(entry, options = {}) {
  let loaded; try { loaded=await loadCorpusCase(entry); } catch(error) { return synthetic(entry.id,'input-invalid','incomplete',['source-input-invalid'],error.code??'BENCHMARK_CASE_INVALID'); }
  if(loaded.compiler.version!=='0.8.24')return synthetic(entry.id,'unsupported-compiler','unsupported',[],'SDK_VERSION_UNSUPPORTED');
  try {
    const result=await scanProject({projectId:entry.id,canonicalSourceRootId:`corpus-${entry.id}`,sources:loaded.sources,compiler:{version:loaded.compiler.version},settings:loaded.compiler.settings,policy:loaded.policy,domains:[entry.domain],evaluationTime:'2026-08-05T00:00:00Z'}, {stageTimeoutMs:options.caseTimeoutMs??120000,globalTimeoutMs:options.caseTimeoutMs??120000,throwOnError:false,export:false,onProgress:options.onProgress});
    if(!result.report){const compileFailed=result.errors.some(item=>item.stage==='compilation');return synthetic(entry.id,compileFailed?'compiler-error':'input-invalid',compileFailed?'compiler-error':'incomplete',compileFailed?[]:['source-input-invalid'],result.errors[0]?.causeCode??result.errors[0]?.code??null);}
    const sarif=renderSarif(result.report),sarifVerification=verifySarif(sarif,{reportHash:result.report.integrity.reportHash});
    return {caseId:entry.id,compileDisposition:'compiled',analysisStatus:result.report.analysis.complete?'supported':'incomplete',findings:result.report.findings, incompleteReasons:[...(result.report.analysis.incompleteReasons??[])].sort(),reportHash:result.report.integrity.reportHash,reportIntegrityVerified:result.reportIntegrity?.verified===true,sarifIntegrityVerified:sarifVerification.verified===true,errorCode:null};
  } catch(error) { if(error.code==='SDK_INPUT_INVALID')return synthetic(entry.id,'input-invalid','incomplete',['source-input-invalid'],error.code); return synthetic(entry.id,'input-invalid','incomplete',['runner-failure'],error.code??'BENCHMARK_INTERNAL_ERROR'); }
}
