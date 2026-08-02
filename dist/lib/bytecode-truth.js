export const EIP1967_IMPLEMENTATION_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';

export function normalizeRpcChainId(value) {
  if (typeof value === 'bigint') return value >= 0n ? `0x${value.toString(16)}` : null;
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) return null;
    return `0x${BigInt(value).toString(16)}`;
  }
  if (typeof value !== 'string') return null;
  const raw = value.trim().toLowerCase();
  if (!raw) return null;
  try {
    const parsed = raw.startsWith('0x') ? BigInt(raw) : BigInt(raw);
    return parsed >= 0n ? `0x${parsed.toString(16)}` : null;
  } catch {
    return null;
  }
}

export function assertRpcChainId(actualValue, expectedValue, networkLabel = 'the expected network') {
  const actual = normalizeRpcChainId(actualValue);
  const expected = normalizeRpcChainId(expectedValue);
  if (!actual) throw new Error('RPC returned an invalid chain ID. Verification stopped before reading bytecode.');
  if (!expected) throw new Error('VeilForge is configured with an invalid expected chain ID.');
  if (actual !== expected) {
    throw new Error(`RPC network mismatch: expected ${networkLabel} (${expected}), received ${actual}. Verification stopped before reading bytecode.`);
  }
  return actual;
}

export function normalizeBytecode(value) {
  const raw = typeof value === 'string' ? value : value?.object;
  if (!raw) return '0x';
  const compact = String(raw).trim().replace(/^0x/i, '').toLowerCase();
  if (!compact || /[^0-9a-f]/.test(compact)) return null;
  return `0x${compact.length % 2 ? `0${compact}` : compact}`;
}

export function stripSolidityMetadata(bytecode) {
  const normalized = normalizeBytecode(bytecode);
  if (!normalized || normalized.length < 8) return normalized;
  const hex = normalized.slice(2);
  const metadataBytes = Number.parseInt(hex.slice(-4), 16);
  const suffixLength = metadataBytes * 2 + 4;
  if (!Number.isFinite(metadataBytes) || suffixLength <= 4 || suffixLength >= hex.length) return normalized;
  return `0x${hex.slice(0, -suffixLength)}`;
}

function truthFlattenReferences(references = {}) {
  const output = [];
  for (const group of Object.values(references || {})) {
    if (Array.isArray(group)) output.push(...group);
    else if (group && typeof group === 'object') output.push(...truthFlattenReferences(group));
  }
  return output.filter((item) => Number.isInteger(item?.start) && Number.isInteger(item?.length));
}

function truthMaskReferences(bytecode, references) {
  const normalized = normalizeBytecode(bytecode);
  if (!normalized) return null;
  const chars = normalized.slice(2).split('');
  for (const reference of references) {
    const start = reference.start * 2;
    const end = Math.min(chars.length, start + reference.length * 2);
    for (let index = start; index < end; index += 1) chars[index] = '0';
  }
  return `0x${chars.join('')}`;
}

function truthArtifactCandidate(parsed) {
  if (parsed?.deployedBytecode || parsed?.bytecode) return parsed;
  for (const [sourceName, contracts] of Object.entries(parsed?.contracts || {})) {
    for (const [contractName, contract] of Object.entries(contracts || {})) {
      if (contract?.evm?.deployedBytecode?.object) return { ...contract, sourceName, contractName };
    }
  }
  return parsed;
}

export function parseBytecodeArtifact(input, artifactName = 'contract artifact') {
  const parsed = typeof input === 'string' ? JSON.parse(input) : input;
  const artifact = truthArtifactCandidate(parsed);
  const runtimeSection = artifact?.deployedBytecode?.object !== undefined
    ? artifact.deployedBytecode
    : artifact?.evm?.deployedBytecode || artifact?.deployedBytecode;
  const creationSection = artifact?.bytecode?.object !== undefined
    ? artifact.bytecode
    : artifact?.evm?.bytecode || artifact?.bytecode;
  const runtimeBytecode = normalizeBytecode(runtimeSection);
  const creationBytecode = normalizeBytecode(creationSection);
  if (!runtimeBytecode || runtimeBytecode === '0x') throw new Error(`${artifactName} does not contain valid deployed runtime bytecode.`);
  let metadata = artifact?.metadata || parsed?.metadata || null;
  if (typeof metadata === 'string') {
    try { metadata = JSON.parse(metadata); } catch { metadata = null; }
  }
  const compilerVersion = artifact?.compiler?.version || parsed?.compiler?.version || metadata?.compiler?.version || 'Unknown';
  const optimizer = metadata?.settings?.optimizer || artifact?.settings?.optimizer || null;
  return {
    artifactName,
    contractName: artifact?.contractName || parsed?.contractName || metadata?.settings?.compilationTarget && Object.values(metadata.settings.compilationTarget)[0] || 'Unknown contract',
    sourceName: artifact?.sourceName || parsed?.sourceName || metadata?.settings?.compilationTarget && Object.keys(metadata.settings.compilationTarget)[0] || 'Unknown source',
    compilerVersion,
    optimizer: optimizer ? { enabled: Boolean(optimizer.enabled), runs: Number(optimizer.runs || 0) } : null,
    runtimeBytecode,
    creationBytecode: creationBytecode || '0x',
    immutableReferences: truthFlattenReferences(runtimeSection?.immutableReferences || artifact?.evm?.deployedBytecode?.immutableReferences),
  };
}

export function hexToBytes(bytecode) {
  const normalized = normalizeBytecode(bytecode);
  if (!normalized) return new Uint8Array();
  const hex = normalized.slice(2);
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  return bytes;
}

function truthCompareOne(artifact, deployedBytecode) {
  const deployed = normalizeBytecode(deployedBytecode);
  if (!deployed || deployed === '0x') return { status: 'empty', exact: false, structural: false };
  const exact = artifact.runtimeBytecode === deployed;
  const references = artifact.immutableReferences || [];
  const artifactStructural = stripSolidityMetadata(truthMaskReferences(artifact.runtimeBytecode, references));
  const deployedStructural = stripSolidityMetadata(truthMaskReferences(deployed, references));
  const structural = Boolean(artifactStructural && deployedStructural && artifactStructural === deployedStructural);
  return { status: exact ? 'exact' : structural ? 'structural' : 'mismatch', exact, structural, deployedBytecode: deployed };
}

export function verifyBytecodeTruth({ artifact, targetBytecode, implementationBytecode = null, targetAddress, implementationAddress = null, hash }) {
  const target = truthCompareOne(artifact, targetBytecode);
  const implementation = implementationBytecode ? truthCompareOne(artifact, implementationBytecode) : null;
  const matched = target.exact || target.structural ? target : implementation?.exact || implementation?.structural ? implementation : null;
  const matchedAddress = matched === target ? targetAddress : matched ? implementationAddress : null;
  const status = matched?.exact ? 'ARC VERIFIED' : matched?.structural ? 'STRUCTURAL MATCH' : 'MISMATCH';
  return {
    version: '3.2.2-bytecode-truth',
    status,
    verified: Boolean(matched),
    exact: Boolean(matched?.exact),
    structural: Boolean(matched?.structural),
    targetAddress,
    implementationAddress,
    matchedAddress,
    matchedKind: matched === implementation ? 'proxy implementation' : matched ? 'target contract' : null,
    artifactHash: hash(hexToBytes(artifact.runtimeBytecode)),
    targetHash: target.deployedBytecode ? hash(hexToBytes(target.deployedBytecode)) : null,
    implementationHash: implementation?.deployedBytecode ? hash(hexToBytes(implementation.deployedBytecode)) : null,
    artifact,
  };
}

export function implementationAddressFromStorage(value) {
  const normalized = normalizeBytecode(value);
  if (!normalized || normalized === '0x') return null;
  const address = `0x${normalized.slice(-40)}`;
  return /^0x0{40}$/.test(address) ? null : address;
}
