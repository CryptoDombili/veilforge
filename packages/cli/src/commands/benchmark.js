import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runBenchmark } from '../../../benchmark/src/index.js';
import { benchmarkJson, benchmarkMarkdown } from '../../../benchmark/src/report.js';
import { writeAtomicFile } from '../file-writer.js';
import { cliError } from '../errors.js';
function positive(value,fallback){if(value===undefined)return fallback;const number=Number(value);if(!Number.isInteger(number)||number<=0)throw cliError('CLI_ARGUMENT_INVALID');return number;}
async function json(filename){if(!filename)return undefined;try{return JSON.parse(await readFile(filename,'utf8'));}catch{throw cliError('CLI_CONFIG_INVALID');}}
export async function benchmarkCommand(options,io={}){
  if(!options.output)throw cliError('CLI_ARGUMENT_INVALID',{safeDetails:{reason:'output-required'}});
  const releaseGate=await json(options['release-gate']);const caseTimeoutMs=positive(options['case-timeout'],120000),globalTimeoutMs=positive(options['global-timeout'],900000);const started=Date.now();
  const progress=options.progress&&!options.quiet?(event)=>io.writeProgress?.(`${JSON.stringify(event)}\n`):undefined;
  const report=await runBenchmark({manifestPath:options.corpus??'tests/corpus/manifest.json',caseId:options.case,domain:Array.isArray(options.domain)?options.domain[0]:options.domain,caseTimeoutMs,releaseGate,onProgress:event=>{if(Date.now()-started>globalTimeoutMs)throw cliError('CLI_BENCHMARK_FAILED',{safeDetails:{reason:'global-timeout'}});progress?.(event);}});
  const output=path.resolve(io.cwd??process.cwd(),options.output);await writeAtomicFile(path.join(output,'veilforge-benchmark-v4.json'),benchmarkJson(report),{overwrite:Boolean(options.overwrite)});await writeAtomicFile(path.join(output,'veilforge-benchmark-v4.md'),benchmarkMarkdown(report),{overwrite:Boolean(options.overwrite)});
  const failed=report.releaseGate.status==='failed'&&options['fail-on-regression'];return{ok:!failed,status:report.releaseGate.status,exitCode:failed?14:report.releaseGate.status==='conditional'?13:0,outputDirectory:output,outputFiles:['veilforge-benchmark-v4.json','veilforge-benchmark-v4.md'],reportHash:report.integrity.reportHash,releaseGate:report.releaseGate,benchmark:report};
}
