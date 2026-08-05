import { readFileSync } from 'node:fs';
import { normalizeSourceBundle } from '../../analyzer/src/v4/frontend/standard-json.js';
import { sdkError } from './errors.js';

const DOMAINS = new Set(['arc-payments', 'arc-treasury', 'arc-private-credit']);
const SECRET_KEY = /(?:api[_-]?key|authorization|credential|password|private[_-]?key|secret|token)/iu;
let defaultTaxonomy;

function fail(code = 'SDK_INPUT_INVALID') { throw sdkError(code); }
function assertPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) && !Buffer.isBuffer(value) && !ArrayBuffer.isView(value);
}
function containsSecretKey(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  return Object.entries(value).some(([key, item]) => SECRET_KEY.test(key) || containsSecretKey(item, seen));
}
function taxonomyDefault() {
  defaultTaxonomy ??= readFileSync(new URL('../../../docs/grant-candidate/financial-data-taxonomy.yaml', import.meta.url), 'utf8');
  return defaultTaxonomy;
}

export function normalizeSdkInput(input, defaults = {}, optionDomains) {
  if (!assertPlainObject(input) || typeof input.projectId !== 'string' || !input.projectId.trim() || /[\u0000-\u001f\u007f]/u.test(input.projectId)) fail();
  if (!assertPlainObject(input.sources) || Object.keys(input.sources).length === 0) fail();
  const sourceValues = {};
  for (const [sourcePath, source] of Object.entries(input.sources)) {
    if (/[\u0000-\u001f\u007f]/u.test(sourcePath)) fail();
    const content = assertPlainObject(source) ? source.content : source;
    if (typeof content !== 'string') fail();
    sourceValues[sourcePath] = content;
  }
  let normalized;
  try { normalized = normalizeSourceBundle(sourceValues); } catch { fail(); }
  const compilerVersion = input.compiler?.version ?? defaults.compiler?.version ?? '0.8.24';
  if (compilerVersion !== '0.8.24' || (input.compiler && Object.keys(input.compiler).some((key) => key !== 'version'))) {
    throw sdkError('SDK_VERSION_UNSUPPORTED');
  }
  if (input.metadata !== undefined && (!assertPlainObject(input.metadata) || containsSecretKey(input.metadata))) fail();
  const domains = [...new Set(optionDomains ?? input.domains ?? [input.policy?.domain ?? 'arc-payments'])].sort();
  if (!domains.length || domains.some((domain) => !DOMAINS.has(domain))) fail();
  const sources = Object.fromEntries(normalized.map(({ path, content }) => [path, content]));
  return {
    sources,
    compilerVersion,
    settings: structuredClone(input.settings ?? {}),
    taxonomy: structuredClone(input.taxonomy ?? taxonomyDefault()),
    policy: input.policy ? structuredClone(input.policy) : undefined,
    policies: input.policies ? structuredClone(input.policies) : undefined,
    domains,
    evaluationTime: input.evaluationTime ?? '1970-01-01T00:00:00Z',
    project: {
      projectId: input.projectId.trim(),
      projectName: input.projectName ?? null,
      canonicalSourceRootId: input.canonicalSourceRootId ?? `sdk:${input.projectId.trim()}`,
    },
    metadata: input.metadata ? structuredClone(input.metadata) : undefined,
    configuration: input.configuration ? structuredClone(input.configuration) : undefined,
    stageBudgets: input.budgets ? structuredClone(input.budgets) : undefined,
  };
}
