import { readFile } from 'node:fs/promises';
import { evaluateReleaseGate } from '../packages/benchmark/src/index.js';
const report=JSON.parse(await readFile('output/benchmark-v4/veilforge-benchmark-v4.json','utf8'));const decision=evaluateReleaseGate(report);if(decision.status!==report.releaseGate.status||decision.counts.coverage!==60)throw new Error('Release gate smoke mismatch.');process.stdout.write(JSON.stringify({passed:true,decision:decision.status,coverage:decision.counts.coverage})+'\n');
