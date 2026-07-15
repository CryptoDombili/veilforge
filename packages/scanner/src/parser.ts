import parser from '@solidity-parser/parser';
import type {
  ParsedContract,
  ParsedEvent,
  ParsedFile,
  ParsedFunction,
  ParsedStateVariable,
  SourceFile,
} from './types.js';
import { compactWhitespace, normalizeText } from './utils.js';

type AstRecord = Record<string, unknown>;

interface Location {
  start: { line: number; column?: number };
  end: { line: number; column?: number };
}

function isRecord(value: unknown): value is AstRecord {
  return typeof value === 'object' && value !== null;
}

function stringValue(record: AstRecord, key: string, fallback = ''): string {
  const value = record[key];
  return typeof value === 'string' ? value : fallback;
}

function arrayValue(record: AstRecord, key: string): unknown[] {
  const value = record[key];
  return Array.isArray(value) ? value : [];
}

function locationOf(record: AstRecord): Location {
  const loc = record.loc;
  if (!isRecord(loc) || !isRecord(loc.start) || !isRecord(loc.end)) {
    return { start: { line: 1 }, end: { line: 1 } };
  }

  const startLine = typeof loc.start.line === 'number' ? loc.start.line : 1;
  const endLine = typeof loc.end.line === 'number' ? loc.end.line : startLine;
  const startColumn = typeof loc.start.column === 'number' ? loc.start.column : undefined;
  const endColumn = typeof loc.end.column === 'number' ? loc.end.column : undefined;

  return {
    start: startColumn === undefined ? { line: startLine } : { line: startLine, column: startColumn },
    end: endColumn === undefined ? { line: endLine } : { line: endLine, column: endColumn },
  };
}

function sourceOf(record: AstRecord, source: string): string {
  const range = record.range;
  if (!Array.isArray(range) || range.length !== 2) {
    const loc = locationOf(record);
    return normalizeText(source).split('\n').slice(loc.start.line - 1, loc.end.line).join('\n');
  }

  const start = typeof range[0] === 'number' ? range[0] : 0;
  const end = typeof range[1] === 'number' ? range[1] : start;
  return source.slice(start, end + 1);
}

function typeNameOf(value: unknown): string {
  if (!isRecord(value)) return 'unknown';
  const type = stringValue(value, 'type');

  switch (type) {
    case 'ElementaryTypeName':
      return stringValue(value, 'name', 'unknown');
    case 'UserDefinedTypeName':
      return stringValue(value, 'namePath', stringValue(value, 'name', 'unknown'));
    case 'Mapping':
      return `mapping(${typeNameOf(value.keyType)} => ${typeNameOf(value.valueType)})`;
    case 'ArrayTypeName': {
      const length = value.length;
      let renderedLength = '';
      if (isRecord(length)) {
        renderedLength = stringValue(length, 'number', stringValue(length, 'value', ''));
      }
      return `${typeNameOf(value.baseTypeName)}[${renderedLength}]`;
    }
    case 'FunctionTypeName':
      return 'function';
    default:
      return stringValue(value, 'name', type || 'unknown');
  }
}

function parameterList(value: unknown): AstRecord[] {
  if (!isRecord(value)) return [];
  return arrayValue(value, 'parameters').filter(isRecord);
}

function renderParameter(parameter: AstRecord): string {
  const name = stringValue(parameter, 'name');
  const typeName = typeNameOf(parameter.typeName);
  return name ? `${typeName} ${name}` : typeName;
}

function modifierNames(functionNode: AstRecord): string[] {
  return arrayValue(functionNode, 'modifiers')
    .filter(isRecord)
    .map((modifier) => {
      const name = modifier.name;
      if (typeof name === 'string') return name;
      if (isRecord(name)) {
        return stringValue(name, 'name', stringValue(name, 'namePath', 'modifier'));
      }
      return 'modifier';
    });
}

function parseContract(node: AstRecord, file: SourceFile, source: string): {
  contract: ParsedContract;
  functions: ParsedFunction[];
  stateVariables: ParsedStateVariable[];
  events: ParsedEvent[];
} {
  const contractName = stringValue(node, 'name', 'AnonymousContract');
  const contractLocation = locationOf(node);
  const contract: ParsedContract = {
    file: file.path,
    name: contractName,
    startLine: contractLocation.start.line,
    endLine: contractLocation.end.line,
  };

  const functions: ParsedFunction[] = [];
  const stateVariables: ParsedStateVariable[] = [];
  const events: ParsedEvent[] = [];

  for (const child of arrayValue(node, 'subNodes').filter(isRecord)) {
    const type = stringValue(child, 'type');
    const loc = locationOf(child);
    const nodeSource = sourceOf(child, source);

    if (type === 'FunctionDefinition') {
      const rawName = stringValue(child, 'name');
      const kind = stringValue(child, 'kind');
      const functionName =
        rawName ||
        (child.isConstructor === true || kind === 'constructor'
          ? 'constructor'
          : child.isReceiveEther === true || kind === 'receive'
            ? 'receive'
            : 'fallback');
      const parameters = parameterList(child.parameters).map(renderParameter);
      const returns = parameterList(child.returnParameters).map(renderParameter);
      const signature = `${functionName}(${parameters.map((parameter) => parameter.split(' ')[0]).join(',')})`;
      functions.push({
        file: file.path,
        contractName,
        functionName,
        signature,
        visibility: stringValue(child, 'visibility', 'default'),
        stateMutability: stringValue(child, 'stateMutability', 'nonpayable'),
        modifiers: modifierNames(child),
        parameters,
        returns,
        startLine: loc.start.line,
        endLine: loc.end.line,
        source: nodeSource,
      });
      continue;
    }

    if (type === 'StateVariableDeclaration') {
      for (const variable of arrayValue(child, 'variables').filter(isRecord)) {
        const name = stringValue(variable, 'name', '<unnamed>');
        stateVariables.push({
          file: file.path,
          contractName,
          name,
          visibility: stringValue(variable, 'visibility', 'internal'),
          typeName: typeNameOf(variable.typeName),
          startLine: loc.start.line,
          endLine: loc.end.line,
          source: compactWhitespace(nodeSource),
        });
      }
      continue;
    }

    if (type === 'EventDefinition') {
      events.push({
        file: file.path,
        contractName,
        name: stringValue(child, 'name', 'AnonymousEvent'),
        parameters: parameterList(child.parameters).map(renderParameter),
        startLine: loc.start.line,
        endLine: loc.end.line,
        source: compactWhitespace(nodeSource),
      });
    }
  }

  return { contract, functions, stateVariables, events };
}

export function parseSolidityFile(file: SourceFile): ParsedFile {
  const normalizedSource = normalizeText(file.content);
  const ast = parser.parse(normalizedSource, {
    loc: true,
    range: true,
    tolerant: false,
  }) as unknown;

  if (!isRecord(ast)) {
    throw new Error(`Unexpected parser output for ${file.path}`);
  }

  const contracts: ParsedContract[] = [];
  const functions: ParsedFunction[] = [];
  const stateVariables: ParsedStateVariable[] = [];
  const events: ParsedEvent[] = [];

  for (const child of arrayValue(ast, 'children').filter(isRecord)) {
    if (stringValue(child, 'type') !== 'ContractDefinition') continue;
    const parsed = parseContract(child, file, normalizedSource);
    contracts.push(parsed.contract);
    functions.push(...parsed.functions);
    stateVariables.push(...parsed.stateVariables);
    events.push(...parsed.events);
  }

  return {
    source: { path: file.path, content: normalizedSource },
    contracts,
    functions,
    stateVariables,
    events,
  };
}
