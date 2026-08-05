import { readFile } from 'node:fs/promises';
const filename='output/benchmark-v4/phase-4c1-calldata-comparison.json';
const report=JSON.parse(await readFile(filename,'utf8')); const failed=Object.entries(report.qualityGates).filter(([,passed])=>!passed).map(([name])=>name);
if(failed.length)throw new Error(`Calldata regression gates failed: ${failed.join(', ')}`);
if(report.current.calldata.falsePositives>=112)throw new Error('Calldata false positives were not reduced.');
process.stdout.write(JSON.stringify({status:'passed',calldata:report.current.calldata,overall:report.current.overall})+'\n');
