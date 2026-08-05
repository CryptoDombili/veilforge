import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { runBenchmark } from '../packages/benchmark/src/index.js';
import { writeAtomicFile } from '../packages/cli/src/file-writer.js';

const BASELINE_HASH = 'sha256:2c47004c6c9ed48f28f3afa71c1701c53497ada047372fe5ad1ab929fe48d82b';
const BASELINE = Object.freeze({ overall: [36, 190, 20], calldata: {
  'arc-payments.calldata-observation': [1, 39, 0], 'arc-treasury.calldata-observation': [1, 37, 0],
  'arc-private-credit.calldata-observation': [1, 36, 0],
}, nonCalldata: {
  'arc-payments.event-disclosure':[4,7,3], 'arc-payments.external-call-disclosure':[3,7,0], 'arc-payments.metadata-disclosure':[1,3,0],
  'arc-payments.public-getter-disclosure':[1,1,1], 'arc-payments.public-storage-disclosure':[1,1,1], 'arc-payments.return-disclosure':[0,4,1], 'arc-payments.revert-disclosure':[1,1,0],
  'arc-private-credit.collateral-disclosure':[0,4,0], 'arc-private-credit.event-disclosure':[1,1,3], 'arc-private-credit.external-call-disclosure':[3,11,1],
  'arc-private-credit.metadata-disclosure':[1,5,0], 'arc-private-credit.public-getter-disclosure':[2,1,1], 'arc-private-credit.public-storage-disclosure':[2,1,1],
  'arc-private-credit.return-disclosure':[1,7,1], 'arc-private-credit.revert-disclosure':[1,1,0], 'arc-treasury.event-disclosure':[2,6,4],
  'arc-treasury.external-call-disclosure':[3,7,0], 'arc-treasury.metadata-disclosure':[1,3,0], 'arc-treasury.public-getter-disclosure':[2,1,1],
  'arc-treasury.public-storage-disclosure':[2,1,1], 'arc-treasury.return-disclosure':[0,4,1], 'arc-treasury.revert-disclosure':[1,1,0],
} });
const tuple = (report, detectorId) => { const value=report.metrics.perDetector[detectorId]?.findingLevel??{}; return [value.truePositives??0,value.falsePositives??0,value.falseNegatives??0]; };
const metric = (values) => ({ truePositives:values[0], falsePositives:values[1], falseNegatives:values[2] });
const delta = (before, after) => ({ truePositives:after[0]-before[0], falsePositives:after[1]-before[1], falseNegatives:after[2]-before[2] });
const reportPath=process.argv[process.argv.indexOf('--from-report')+1];
const report = process.argv.includes('--from-report') ? JSON.parse(await readFile(reportPath,'utf8'))
  : await runBenchmark({ caseTimeoutMs:120000, onProgress:event=>{if(event.type==='case-completed')process.stderr.write(`${event.caseId}: ${event.status}\n`);} });
const currentOverall=[report.metrics.overall.findingLevel.truePositives,report.metrics.overall.findingLevel.falsePositives,report.metrics.overall.findingLevel.falseNegatives];
const calldata=Object.fromEntries(Object.entries(BASELINE.calldata).map(([id,before])=>{const after=tuple(report,id);return[id,{baseline:metric(before),current:metric(after),delta:delta(before,after)}];}));
const knownDetectorIds=new Set([...Object.keys(BASELINE.calldata),...Object.keys(BASELINE.nonCalldata)]);
const nonCalldataChanges=Object.entries(BASELINE.nonCalldata).flatMap(([id,before])=>{const after=tuple(report,id);return JSON.stringify(before)===JSON.stringify(after)?[]:[{detectorId:id,baseline:metric(before),current:metric(after)}];});
for(const id of Object.keys(report.metrics.perDetector).filter((item)=>!knownDetectorIds.has(item)).sort())nonCalldataChanges.push({detectorId:id,baseline:null,current:metric(tuple(report,id))});
const aggregate=(side)=>Object.values(calldata).reduce((out,item)=>({truePositives:out.truePositives+item[side].truePositives,falsePositives:out.falsePositives+item[side].falsePositives,falseNegatives:out.falseNegatives+item[side].falseNegatives}),{truePositives:0,falsePositives:0,falseNegatives:0});
const output={schema:'veilforge.calldata-comparison.v4',schemaVersion:'1.0.0',baseline:{reportHash:BASELINE_HASH,overall:metric(BASELINE.overall),calldata:aggregate('baseline')},current:{reportHash:report.integrity.reportHash,overall:metric(currentOverall),calldata:aggregate('current'),releaseGate:report.releaseGate},perDomain:calldata,delta:{overall:delta(BASELINE.overall,currentOverall),calldata:delta([3,112,0],[aggregate('current').truePositives,aggregate('current').falsePositives,aggregate('current').falseNegatives])},nonCalldataChanges,qualityGates:{coverage60:report.results.length===60,compile60:report.metrics.overall.compileDisposition.correct===60,calldataTruePositivesPreserved:aggregate('current').truePositives>=3,calldataFalseNegativesZero:aggregate('current').falseNegatives===0,calldataFalsePositivesReduced:aggregate('current').falsePositives<112,overallFalseNegativesNotIncreased:currentOverall[2]<=20,otherDetectorMetricsUnchanged:nonCalldataChanges.length===0,integrityFailuresZero:report.releaseGate.counts.integrityFailures===0,unsafeLocationsZero:report.releaseGate.counts.unsafeLocations===0,nondeterminismZero:report.nondeterministicResults===0}};
await writeAtomicFile(path.join('output','benchmark-v4','phase-4c1-calldata-comparison.json'),JSON.stringify(output,null,2)+'\n',{overwrite:true});
process.stdout.write(JSON.stringify({cases:report.results.length,calldata:output.current.calldata,overall:output.current.overall,passed:Object.values(output.qualityGates).every(Boolean)})+'\n');
