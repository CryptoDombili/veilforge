import { compactWhitespace, lineNumberAtOffset, normalizeText } from './canonical.js';
import { functionSelector } from './keccak.js';

function maskComments(source) {
  const chars = [...source];
  let state = 'code';
  let quote = '';

  for (let index = 0; index < chars.length; index += 1) {
    const current = chars[index];
    const next = chars[index + 1];

    if (state === 'line-comment') {
      if (current === '\n') state = 'code';
      else chars[index] = ' ';
      continue;
    }

    if (state === 'block-comment') {
      if (current === '*' && next === '/') {
        chars[index] = ' ';
        chars[index + 1] = ' ';
        index += 1;
        state = 'code';
      } else if (current !== '\n') {
        chars[index] = ' ';
      }
      continue;
    }

    if (state === 'string') {
      if (current === '\\') {
        index += 1;
        continue;
      }
      if (current === quote) state = 'code';
      continue;
    }

    if ((current === '"' || current === "'") && state === 'code') {
      state = 'string';
      quote = current;
      continue;
    }

    if (current === '/' && next === '/') {
      chars[index] = ' ';
      chars[index + 1] = ' ';
      index += 1;
      state = 'line-comment';
      continue;
    }

    if (current === '/' && next === '*') {
      chars[index] = ' ';
      chars[index + 1] = ' ';
      index += 1;
      state = 'block-comment';
    }
  }

  return chars.join('');
}

function findMatching(source, start, open, close) {
  let depth = 0;
  let quote = '';
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (char === '\\') {
        index += 1;
        continue;
      }
      if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === open) depth += 1;
    if (char === close) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function splitTopLevel(value, delimiter = ',') {
  const items = [];
  let start = 0;
  let paren = 0;
  let bracket = 0;
  let brace = 0;
  let quote = '';

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (quote) {
      if (char === '\\') {
        index += 1;
        continue;
      }
      if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '(') paren += 1;
    else if (char === ')') paren -= 1;
    else if (char === '[') bracket += 1;
    else if (char === ']') bracket -= 1;
    else if (char === '{') brace += 1;
    else if (char === '}') brace -= 1;
    else if (char === delimiter && paren === 0 && bracket === 0 && brace === 0) {
      items.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }

  items.push(value.slice(start).trim());
  return items.filter(Boolean);
}

function scanTopLevelSegments(masked, start, end) {
  const segments = [];
  let cursor = start;
  let segmentStart = start;
  let paren = 0;
  let bracket = 0;
  let quote = '';

  while (cursor < end) {
    const char = masked[cursor];
    if (quote) {
      if (char === '\\') cursor += 2;
      else {
        if (char === quote) quote = '';
        cursor += 1;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      cursor += 1;
      continue;
    }
    if (char === '(') paren += 1;
    else if (char === ')') paren -= 1;
    else if (char === '[') bracket += 1;
    else if (char === ']') bracket -= 1;

    if (paren === 0 && bracket === 0 && char === ';') {
      segments.push({ start: segmentStart, end: cursor + 1, kind: 'statement' });
      segmentStart = cursor + 1;
      cursor += 1;
      continue;
    }

    if (paren === 0 && bracket === 0 && char === '{') {
      const close = findMatching(masked, cursor, '{', '}');
      if (close < 0 || close > end) {
        throw new Error(`Unclosed block near line ${lineNumberAtOffset(masked, cursor)}.`);
      }
      segments.push({ start: segmentStart, end: close + 1, headerEnd: cursor, kind: 'block' });
      segmentStart = close + 1;
      cursor = close + 1;
      continue;
    }

    cursor += 1;
  }

  return segments.filter((segment) => masked.slice(segment.start, segment.end).trim());
}

function canonicalParameterType(parameter) {
  let value = compactWhitespace(parameter)
    .replace(/\b(indexed|memory|calldata|storage)\b/g, '')
    .replace(/\bpayable\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!value) return '';

  const tokens = value.split(' ');
  if (tokens.length > 1) {
    const last = tokens[tokens.length - 1];
    if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(last) && !last.includes(']')) {
      tokens.pop();
      value = tokens.join(' ');
    }
  }

  value = value
    .replace(/\buint\b/g, 'uint256')
    .replace(/\bint\b/g, 'int256')
    .replace(/\bfixed\b/g, 'fixed128x18')
    .replace(/\bufixed\b/g, 'ufixed128x18')
    .replace(/\s+/g, '')
    .trim();

  return value;
}

function parseFunction(file, contract, source, masked, segment) {
  const original = source.slice(segment.start, segment.end);
  const headerEnd = segment.headerEnd ?? segment.end;
  const header = source.slice(segment.start, headerEnd).trim();
  const maskedHeader = masked.slice(segment.start, headerEnd);
  const keyword = maskedHeader.match(/\b(function|constructor|fallback|receive)\b/);
  if (!keyword || keyword.index === undefined) return null;

  const keywordIndex = segment.start + keyword.index;
  const openParen = masked.indexOf('(', keywordIndex);
  if (openParen < 0 || openParen >= segment.end) return null;
  const closeParen = findMatching(masked, openParen, '(', ')');
  if (closeParen < 0 || closeParen >= segment.end) return null;

  let functionName = keyword[1];
  if (keyword[1] === 'function') {
    const between = masked.slice(keywordIndex + 'function'.length, openParen).trim();
    functionName = between.match(/^([A-Za-z_$][A-Za-z0-9_$]*)/)?.[1] ?? 'anonymous';
  }

  const parametersText = source.slice(openParen + 1, closeParen);
  const parameters = splitTopLevel(parametersText);
  const parameterTypes = parameters.map(canonicalParameterType).filter(Boolean);
  const tail = source.slice(closeParen + 1, segment.headerEnd ?? segment.end);
  const visibility = tail.match(/\b(public|external|internal|private)\b/)?.[1] ??
    (keyword[1] === 'constructor' ? 'internal' : 'unspecified');
  const stateMutability = tail.match(/\b(view|pure|payable)\b/)?.[1] ?? 'nonpayable';

  let returns = [];
  const returnsMatch = tail.match(/\breturns\s*\(([^)]*)\)/s);
  if (returnsMatch) returns = splitTopLevel(returnsMatch[1]).map(canonicalParameterType).filter(Boolean);

  const cleanedTail = tail
    .replace(/\b(public|external|internal|private|view|pure|payable|virtual)\b/g, ' ')
    .replace(/\boverride(?:\s*\([^)]*\))?/g, ' ')
    .replace(/\breturns\s*\([^)]*\)/gs, ' ');
  const modifiers = [...cleanedTail.matchAll(/\b([A-Za-z_$][A-Za-z0-9_$]*)\b(?:\s*\([^)]*\))?/g)]
    .map((match) => match[1])
    .filter((name) => !['memory', 'calldata', 'storage'].includes(name));

  const signature = `${functionName}(${parameterTypes.join(',')})`;
  return {
    file,
    contractName: contract.name,
    contractKind: contract.kind,
    functionName,
    signature,
    selector: functionName === 'constructor' ? null : functionSelector(signature),
    visibility,
    stateMutability,
    modifiers,
    parameters,
    parameterTypes,
    returns,
    startLine: lineNumberAtOffset(source, segment.start),
    endLine: lineNumberAtOffset(source, segment.end - 1),
    source: original.trim(),
    body: segment.kind === 'block' ? source.slice(segment.headerEnd + 1, segment.end - 1) : '',
  };
}

function parseEvent(file, contract, source, segment) {
  const original = source.slice(segment.start, segment.end).trim();
  const match = original.match(/\bevent\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(([^;]*)\)\s*;/s);
  if (!match) return null;
  return {
    file,
    contractName: contract.name,
    contractKind: contract.kind,
    name: match[1],
    parameters: splitTopLevel(match[2]),
    startLine: lineNumberAtOffset(source, segment.start),
    endLine: lineNumberAtOffset(source, segment.end - 1),
    source: original,
  };
}

function parseStateVariable(file, contract, source, segment) {
  const original = source.slice(segment.start, segment.end).trim();
  if (!original || /^(pragma|import|using|event|error|type|struct|enum|modifier|function|constructor|fallback|receive)\b/.test(original)) {
    return null;
  }
  if (!original.endsWith(';')) return null;

  const withoutValue = splitTopLevel(original.slice(0, -1), '=')[0]?.trim() ?? '';
  const names = [...withoutValue.matchAll(/\b([A-Za-z_$][A-Za-z0-9_$]*)\b/g)];
  if (names.length < 2) return null;
  const nameMatch = names[names.length - 1];
  const name = nameMatch[1];
  const prefix = withoutValue.slice(0, nameMatch.index).trim();
  const visibility = prefix.match(/\b(public|private|internal)\b/)?.[1] ?? 'internal';
  const typeName = compactWhitespace(
    prefix.replace(/\b(public|private|internal|constant|immutable|override)\b/g, ' '),
  );
  if (!typeName) return null;

  return {
    file,
    contractName: contract.name,
    contractKind: contract.kind,
    name,
    visibility,
    typeName,
    startLine: lineNumberAtOffset(source, segment.start),
    endLine: lineNumberAtOffset(source, segment.end - 1),
    source: original,
  };
}

export function parseSolidityFile(input) {
  const source = normalizeText(input.content);
  const masked = maskComments(source);
  const contracts = [];
  const functions = [];
  const stateVariables = [];
  const events = [];

  const contractPattern = /\b(contract|interface|library)\s+([A-Za-z_$][A-Za-z0-9_$]*)[^\{;]*\{/g;
  let match;
  while ((match = contractPattern.exec(masked)) !== null) {
    const openBrace = masked.indexOf('{', match.index);
    const closeBrace = findMatching(masked, openBrace, '{', '}');
    if (closeBrace < 0) {
      throw new Error(`Unclosed ${match[1]} ${match[2]} near line ${lineNumberAtOffset(source, match.index)}.`);
    }

    const contract = {
      file: input.path,
      kind: match[1],
      name: match[2],
      startLine: lineNumberAtOffset(source, match.index),
      endLine: lineNumberAtOffset(source, closeBrace),
      startOffset: match.index,
      endOffset: closeBrace,
    };
    contracts.push(contract);

    const segments = scanTopLevelSegments(masked, openBrace + 1, closeBrace);
    for (const segment of segments) {
      const text = masked.slice(segment.start, segment.end).trim();
      if (/^(function|constructor|fallback|receive)\b/.test(text)) {
        const fn = parseFunction(input.path, contract, source, masked, segment);
        if (fn) functions.push(fn);
      } else if (/^event\b/.test(text)) {
        const event = parseEvent(input.path, contract, source, segment);
        if (event) events.push(event);
      } else {
        const variable = parseStateVariable(input.path, contract, source, segment);
        if (variable) stateVariables.push(variable);
      }
    }

    contractPattern.lastIndex = closeBrace + 1;
  }

  if (contracts.length === 0 && /\b(contract|interface|library)\b/.test(masked)) {
    throw new Error('A Solidity contract declaration was found but its body could not be parsed.');
  }

  return {
    source: { path: input.path, content: source },
    contracts,
    functions,
    stateVariables,
    events,
  };
}

export function parseProject(files) {
  return files.map(parseSolidityFile);
}

export const parserHelpers = Object.freeze({
  maskComments,
  splitTopLevel,
  canonicalParameterType,
});
