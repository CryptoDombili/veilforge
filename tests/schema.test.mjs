import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { generatePolicyManifest, scanProject } from '../packages/analyzer/src/index.js';

const reportSchema = JSON.parse(fs.readFileSync('schemas/veilforge-report.schema.json', 'utf8'));
const policySchema = JSON.parse(fs.readFileSync('schemas/arc-policy-manifest.schema.json', 'utf8'));
const vulnerable = fs.readFileSync('examples/vulnerable-payroll/Payroll.sol', 'utf8');

function resolveRef(root, ref) {
  if (!ref.startsWith('#/')) throw new Error(`Unsupported schema reference: ${ref}`);
  return ref.slice(2).split('/').reduce((current, segment) => current[segment.replaceAll('~1', '/').replaceAll('~0', '~')], root);
}

function matchesType(value, type) {
  if (Array.isArray(type)) return type.some((entry) => matchesType(value, entry));
  if (type === 'null') return value === null;
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  if (type === 'integer') return Number.isInteger(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  return typeof value === type;
}

function validate(value, schema, root, location = '$') {
  if (schema.$ref) return validate(value, resolveRef(root, schema.$ref), root, location);
  const errors = [];
  if (schema.type && !matchesType(value, schema.type)) {
    return [`${location}: expected ${JSON.stringify(schema.type)}, received ${value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value}`];
  }
  if (Object.prototype.hasOwnProperty.call(schema, 'const') && value !== schema.const) {
    errors.push(`${location}: expected constant ${JSON.stringify(schema.const)}`);
  }
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${location}: value is not in enum`);
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${location}: shorter than minLength`);
    if (schema.pattern && !(new RegExp(schema.pattern)).test(value)) errors.push(`${location}: does not match ${schema.pattern}`);
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${location}: below minimum`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${location}: above maximum`);
  }
  if (Array.isArray(value) && schema.items) {
    value.forEach((entry, index) => errors.push(...validate(entry, schema.items, root, `${location}[${index}]`)));
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const name of schema.required ?? []) {
      if (!Object.prototype.hasOwnProperty.call(value, name)) errors.push(`${location}: missing required property ${name}`);
    }
    for (const [name, entry] of Object.entries(value)) {
      if (schema.properties?.[name]) errors.push(...validate(entry, schema.properties[name], root, `${location}.${name}`));
      else if (schema.additionalProperties === false) errors.push(`${location}: unexpected property ${name}`);
    }
  }
  return errors;
}

test('canonical report satisfies the published report schema', () => {
  const report = scanProject([{ path: 'Payroll.sol', content: vulnerable }]);
  assert.deepEqual(validate(report, reportSchema, reportSchema), []);
});

test('generated policy manifest satisfies the published manifest schema', () => {
  const report = scanProject([{ path: 'Payroll.sol', content: vulnerable }]);
  const manifest = generatePolicyManifest(report);
  assert.deepEqual(validate(manifest, policySchema, policySchema), []);
});
