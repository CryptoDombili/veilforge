interface ZipEntry {
  name: string;
  content: string;
}

const encoder = new TextEncoder();

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (crc >>> 8) ^ (crcTable[(crc ^ byte) & 0xff] ?? 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function uint16(value: number): Uint8Array {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);
  return bytes;
}

function uint32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value >>> 0, true);
  return bytes;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const size = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(size);
  let offset = 0;
  parts.forEach((part) => {
    output.set(part, offset);
    offset += part.length;
  });
  return output;
}

export function createDeterministicZip(entries: ZipEntry[]): Blob {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  entries
    .map((entry) => ({ ...entry, name: entry.name.replaceAll('\\', '/') }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((entry) => {
      const name = encoder.encode(entry.name);
      const data = encoder.encode(entry.content);
      const checksum = crc32(data);
      const localHeader = concat([
        uint32(0x04034b50),
        uint16(20),
        uint16(0x0800),
        uint16(0),
        uint16(0),
        uint16(0x0021),
        uint32(checksum),
        uint32(data.length),
        uint32(data.length),
        uint16(name.length),
        uint16(0),
        name,
      ]);
      localParts.push(localHeader, data);

      const centralHeader = concat([
        uint32(0x02014b50),
        uint16(20),
        uint16(20),
        uint16(0x0800),
        uint16(0),
        uint16(0),
        uint16(0x0021),
        uint32(checksum),
        uint32(data.length),
        uint32(data.length),
        uint16(name.length),
        uint16(0),
        uint16(0),
        uint16(0),
        uint16(0),
        uint32(0),
        uint32(offset),
        name,
      ]);
      centralParts.push(centralHeader);
      offset += localHeader.length + data.length;
    });

  const localDirectory = concat(localParts);
  const centralDirectory = concat(centralParts);
  const end = concat([
    uint32(0x06054b50),
    uint16(0),
    uint16(0),
    uint16(entries.length),
    uint16(entries.length),
    uint32(centralDirectory.length),
    uint32(localDirectory.length),
    uint16(0),
  ]);

  return new Blob([concat([localDirectory, centralDirectory, end])], { type: 'application/zip' });
}
