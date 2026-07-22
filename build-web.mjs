const MASK_64 = (1n << 64n) - 1n;
const RATE_BYTES = 136;

const ROTATION = [
  0, 1, 62, 28, 27,
  36, 44, 6, 55, 20,
  3, 10, 43, 25, 39,
  41, 45, 15, 21, 8,
  18, 2, 61, 56, 14,
];

const ROUND_CONSTANTS = [
  0x0000000000000001n, 0x0000000000008082n,
  0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n,
  0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n,
  0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn,
  0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n,
  0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n,
  0x0000000080000001n, 0x8000000080008008n,
];

function rotateLeft64(value, shift) {
  if (shift === 0) return value & MASK_64;
  const amount = BigInt(shift);
  return ((value << amount) | (value >> (64n - amount))) & MASK_64;
}

function permutation(state) {
  for (const roundConstant of ROUND_CONSTANTS) {
    const c = new Array(5).fill(0n);
    const d = new Array(5).fill(0n);
    const b = new Array(25).fill(0n);

    for (let x = 0; x < 5; x += 1) {
      c[x] = state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20];
    }

    for (let x = 0; x < 5; x += 1) {
      d[x] = c[(x + 4) % 5] ^ rotateLeft64(c[(x + 1) % 5], 1);
    }

    for (let y = 0; y < 5; y += 1) {
      for (let x = 0; x < 5; x += 1) {
        const index = x + 5 * y;
        state[index] = (state[index] ^ d[x]) & MASK_64;
      }
    }

    for (let y = 0; y < 5; y += 1) {
      for (let x = 0; x < 5; x += 1) {
        const sourceIndex = x + 5 * y;
        const targetX = y;
        const targetY = (2 * x + 3 * y) % 5;
        b[targetX + 5 * targetY] = rotateLeft64(state[sourceIndex], ROTATION[sourceIndex]);
      }
    }

    for (let y = 0; y < 5; y += 1) {
      for (let x = 0; x < 5; x += 1) {
        const index = x + 5 * y;
        state[index] = (
          b[index] ^ ((~b[((x + 1) % 5) + 5 * y]) & b[((x + 2) % 5) + 5 * y])
        ) & MASK_64;
      }
    }

    state[0] = (state[0] ^ roundConstant) & MASK_64;
  }
}

function toBytes(input) {
  if (input instanceof Uint8Array) return input;
  return new TextEncoder().encode(String(input));
}

export function keccak256Bytes(input) {
  const bytes = toBytes(input);
  const paddedLength = Math.ceil((bytes.length + 1) / RATE_BYTES) * RATE_BYTES;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x01;
  padded[padded.length - 1] |= 0x80;

  const state = new Array(25).fill(0n);
  for (let offset = 0; offset < padded.length; offset += RATE_BYTES) {
    for (let i = 0; i < RATE_BYTES; i += 1) {
      const lane = Math.floor(i / 8);
      const shift = BigInt((i % 8) * 8);
      state[lane] ^= BigInt(padded[offset + i]) << shift;
    }
    permutation(state);
  }

  const output = new Uint8Array(32);
  for (let i = 0; i < output.length; i += 1) {
    const lane = Math.floor(i / 8);
    const shift = BigInt((i % 8) * 8);
    output[i] = Number((state[lane] >> shift) & 0xffn);
  }
  return output;
}

export function bytesToHex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function keccakHex(input) {
  return `0x${bytesToHex(keccak256Bytes(input))}`;
}

export function functionSelector(signature) {
  return `0x${bytesToHex(keccak256Bytes(signature).slice(0, 4))}`;
}
