const decoder = new TextDecoder();
const MAX_ENTRY_BYTES = 12 * 1024 * 1024;
const MAX_TOTAL_BYTES = 40 * 1024 * 1024;
const MAX_ENTRIES = 2500;

function zipReadU16(view, offset) {
  return view.getUint16(offset, true);
}

function zipReadU32(view, offset) {
  return view.getUint32(offset, true);
}

function cleanPath(value) {
  const parts = String(value).replaceAll('\\', '/').split('/');
  if (parts.some((part) => part === '..')) return null;
  return parts.filter((part) => part && part !== '.').join('/');
}

async function inflateRaw(bytes) {
  if (typeof DecompressionStream !== 'function') {
    throw new Error('This browser cannot unpack compressed ZIP projects. Upload the project folder instead.');
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export function looksLikeSolidity(source) {
  const sample = String(source).slice(0, 160000);
  return /\bpragma\s+solidity\b/i.test(sample)
    || /\b(?:abstract\s+)?contract\s+[A-Za-z_$][\w$]*\b/.test(sample)
    || /\b(?:interface|library)\s+[A-Za-z_$][\w$]*\b/.test(sample);
}

export async function readZipEntries(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  const minimum = Math.max(0, bytes.length - 65557);
  for (let offset = bytes.length - 22; offset >= minimum; offset -= 1) {
    if (zipReadU32(view, offset) === 0x06054b50) {
      end = offset;
      break;
    }
  }
  if (end < 0) throw new Error(`${file.name} is not a valid ZIP project.`);

  const entryCount = zipReadU16(view, end + 10);
  if (entryCount > MAX_ENTRIES) throw new Error(`${file.name} contains too many files.`);
  let cursor = zipReadU32(view, end + 16);
  let totalBytes = 0;
  const entries = [];

  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > bytes.length || zipReadU32(view, cursor) !== 0x02014b50) {
      throw new Error(`${file.name} has a damaged ZIP directory.`);
    }
    const flags = zipReadU16(view, cursor + 8);
    const method = zipReadU16(view, cursor + 10);
    const compressedSize = zipReadU32(view, cursor + 20);
    const uncompressedSize = zipReadU32(view, cursor + 24);
    const nameLength = zipReadU16(view, cursor + 28);
    const extraLength = zipReadU16(view, cursor + 30);
    const commentLength = zipReadU16(view, cursor + 32);
    const localOffset = zipReadU32(view, cursor + 42);
    const rawName = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    cursor += 46 + nameLength + extraLength + commentLength;

    const path = cleanPath(rawName);
    if (!path || path.endsWith('/') || /(^|\/)(?:node_modules|\.git|out|cache|artifacts|dist|build)(\/|$)/i.test(path)) continue;
    if (flags & 1) throw new Error(`${file.name} is password-protected and cannot be scanned locally.`);
    if (uncompressedSize > MAX_ENTRY_BYTES || totalBytes + uncompressedSize > MAX_TOTAL_BYTES) {
      throw new Error(`${file.name} is too large to inspect safely in the browser.`);
    }
    if (localOffset + 30 > bytes.length || zipReadU32(view, localOffset) !== 0x04034b50) {
      throw new Error(`${file.name} contains a damaged file entry.`);
    }
    const localNameLength = zipReadU16(view, localOffset + 26);
    const localExtraLength = zipReadU16(view, localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.subarray(dataStart, dataStart + compressedSize);
    let contentBytes;
    if (method === 0) contentBytes = compressed;
    else if (method === 8) contentBytes = await inflateRaw(compressed);
    else continue;
    if (contentBytes.length > MAX_ENTRY_BYTES) throw new Error(`${path} is too large to inspect safely.`);
    totalBytes += contentBytes.length;
    const content = decoder.decode(contentBytes);
    if (!path.toLowerCase().endsWith('.sol') && !looksLikeSolidity(content)) continue;
    entries.push({ path: path.toLowerCase().endsWith('.sol') ? path : `${path}.sol`, content });
  }
  return entries;
}
