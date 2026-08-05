import { ClassificationInputError } from './errors.js';
import { normalizeName } from './common.js';

function inlineList(text) { return text.slice(1, -1).split(',').map((item) => normalizeName(item.trim())).filter(Boolean); }

export function loadFinancialTaxonomy(input) {
  if (input && typeof input === 'object') return normalizeTaxonomy(input);
  if (typeof input !== 'string') throw new ClassificationInputError('Taxonomy must be YAML text or an object.');
  const text = input.replace(/^\uFEFF/u, '').replace(/\r\n?/gu, '\n');
  const result = { schemaVersion: null, candidateVersion: null, domains: {}, sinks: [], inferencePolicy: {} };
  let section = null; let domain = null;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+#.*$/u, ''); if (!line.trim()) continue;
    const indent = line.match(/^\s*/u)[0].length; const value = line.trim();
    if (!indent) {
      const match = value.match(/^([^:]+):(?:\s*(.*))?$/u); if (!match) continue;
      if (match[2]) result[match[1]] = match[2].replace(/^['"]|['"]$/gu, ''); else section = match[1];
      domain = null; continue;
    }
    if (section === 'domains' && indent === 2) { domain = value.replace(/:$/u, ''); result.domains[domain] = { sensitiveClasses: [] }; continue; }
    if (section === 'domains' && domain) { const match = value.match(/^sensitiveClasses:\s*(\[.*\])$/u); if (match) result.domains[domain].sensitiveClasses = inlineList(match[1]); continue; }
    if (section === 'sinks' && value.startsWith('- ')) { result.sinks.push(normalizeName(value.slice(2))); continue; }
    if (section === 'inferencePolicy') { const [key, ...rest] = value.split(':'); result.inferencePolicy[key] = rest.join(':').trim(); }
  }
  return normalizeTaxonomy(result);
}

export function normalizeTaxonomy(value) {
  if (!value?.domains || !value?.sinks) throw new ClassificationInputError('Taxonomy is missing domains or sinks.');
  const domains = Object.fromEntries(Object.keys(value.domains).sort().map((domain) => [domain, {
    sensitiveClasses: [...new Set((value.domains[domain].sensitiveClasses ?? []).map(normalizeName))].sort(),
  }]));
  return Object.freeze({ schemaVersion: value.schemaVersion, candidateVersion: value.candidateVersion, domains,
    sinks: [...new Set(value.sinks.map(normalizeName))].sort(), inferencePolicy: { ...(value.inferencePolicy ?? {}) } });
}
