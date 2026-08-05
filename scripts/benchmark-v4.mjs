import path from 'node:path';
import { runBenchmark, benchmarkJson, benchmarkMarkdown } from '../packages/benchmark/src/index.js';
import { writeAtomicFile } from '../packages/cli/src/file-writer.js';
const args=process.argv.slice(2),value=name=>{const index=args.indexOf(name);return index<0?undefined:args[index+1];};const output=value('--output')??'output/benchmark-v4';
const report=await runBenchmark({caseId:value('--case'),domain:value('--domain'),caseTimeoutMs:Number(value('--case-timeout')??120000),onProgress:event=>{if(event.type==='case-completed')process.stderr.write(`${event.caseId}: ${event.status}\n`);}});
await writeAtomicFile(path.join(output,'veilforge-benchmark-v4.json'),benchmarkJson(report),{overwrite:true});await writeAtomicFile(path.join(output,'veilforge-benchmark-v4.md'),benchmarkMarkdown(report),{overwrite:true});process.stdout.write(JSON.stringify({cases:report.results.length,status:report.releaseGate.status,reportHash:report.integrity.reportHash})+'\n');
