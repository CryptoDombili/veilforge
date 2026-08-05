import { runAction } from './runner.mjs';
try { const result = await runAction(); process.stdout.write(`VeilForge gate: ${result.outputs['gate-decision']}\n`); process.exitCode = result.exitCode; }
catch (error) { process.stderr.write(`VeilForge action: ${error.message}\n`); process.exitCode = Number.isInteger(error.exitCode) ? error.exitCode : 1; }
