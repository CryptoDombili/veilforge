import { bytesToHex } from '@noble/hashes/utils';
import { keccak_256 } from '@noble/hashes/sha3';
import { SENSITIVE_TERMS } from './constants.js';

export function normalizeText(value: string): string {
  return value.replace(/\r\n?/g, '\n');
}

export function normalizePath(value: string): string {
  return value.replaceAll('\\', '/').replace(/^\.\//, '');
}

export function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function containsSensitiveTerm(value: string): boolean {
  const normalized = splitIdentifier(value).join(' ');
  return SENSITIVE_TERMS.some((term) => normalized.includes(term));
}

export function matchingSensitiveTerms(value: string): string[] {
  const normalized = splitIdentifier(value).join(' ');
  return SENSITIVE_TERMS.filter((term) => normalized.includes(term));
}

export function splitIdentifier(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

export function hasAccessControl(source: string, modifiers: string[]): boolean {
  const lowered = `${modifiers.join(' ')} ${source}`.toLowerCase();
  return [
    'onlyowner',
    'onlyrole',
    'onlyadmin',
    'requiresauth',
    'whenallowed',
    'msg.sender == owner',
    'msg.sender==owner',
    'hasrole(',
    '_checkrole(',
  ].some((marker) => lowered.includes(marker));
}

export function keccakHex(value: string): `0x${string}` {
  return `0x${bytesToHex(keccak_256(new TextEncoder().encode(value)))}`;
}

export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(',')}}`;
}

export function excerpt(source: string, startLine: number, endLine = startLine): string {
  const lines = normalizeText(source).split('\n');
  return lines.slice(Math.max(0, startLine - 1), Math.min(lines.length, endLine)).join('\n').trim();
}

export function lineNumberAtOffset(source: string, offset: number): number {
  return normalizeText(source.slice(0, Math.max(0, offset))).split('\n').length;
}
