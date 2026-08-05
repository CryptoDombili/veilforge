import fs from 'node:fs/promises';
const report=JSON.parse(await fs.readFile('output/benchmark-v4/phase-4c2-negative-comparison.json','utf8'));
const failed=Object.entries(report.qualityGates).filter(([,value])=>value===false).map(([name])=>name);
if(failed.length)throw new Error(`Negative precision gates failed: ${failed.join(', ')}`);
if(report.current.negative.falsePositives>=25)throw new Error('Negative false positives were not reduced.');
process.stdout.write(JSON.stringify({status:'passed',mode:report.mode,negative:report.current.negative})+'\n');
