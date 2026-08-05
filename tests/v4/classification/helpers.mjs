import fs from 'node:fs';
import { compileProject } from '../../../packages/analyzer/src/v4/frontend/index.js';
import { buildProgramGraphs, lowerCompilationToIR } from '../../../packages/analyzer/src/v4/ir/index.js';
import { analyzeProgramDataflow, analyzeProgramInterprocedural } from '../../../packages/analyzer/src/v4/analysis/index.js';
import { analyzeFinancialClassification, loadFinancialTaxonomy } from '../../../packages/analyzer/src/v4/classification/index.js';

export const taxonomyText = fs.readFileSync(new URL('../../../docs/grant-candidate/financial-data-taxonomy.yaml', import.meta.url), 'utf8');
export const taxonomy = loadFinancialTaxonomy(taxonomyText);
export const policy = Object.freeze({ schemaVersion: '4.0.0', policyId: 'classification-test', version: '1.0.0', domain: 'arc-payments', approvedWrappers: [], publicFields: [], acceptedRisks: [] });
export const header = '// SPDX-License-Identifier: MIT\npragma solidity 0.8.24;\n';

export function classify(source, policyOverride = policy, options = {}) {
  const compilation = compileProject({ sources: { 'Case.sol': `${header}${source}` } });
  if (compilation.result.status !== 'compiled') throw new Error(compilation.result.diagnostics.map((item) => item.formattedMessage).join('\n'));
  const ir = lowerCompilationToIR(compilation); const graphs = buildProgramGraphs(ir);
  const intra = analyzeProgramDataflow(ir, graphs); const analysis = analyzeProgramInterprocedural(ir, graphs, intra);
  return { compilation, ir, graphs, analysis, classification: analyzeFinancialClassification(ir, analysis, { taxonomy, policy: policyOverride, evaluationTime: options.evaluationTime ?? '2026-08-04T00:00:00Z', ...options }) };
}

export function classes(items, key) { return new Set(items.map((item) => item[key])); }
