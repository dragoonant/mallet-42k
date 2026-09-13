// Seeded RNG contract (00-arch §6). Reference impl: xoshiro128** seeded from sha256(seed); state serialised into GameState.rng.
import { EngineInvariantError } from './types'

export type DieSides = 3 | 6

export interface Rng {
  // uniform in [0, 1)
  next(): number
  roll(sides: DieSides): number
  serialize(): string
}

export interface RngFactory {
  fromSeed(seed: string): Rng
  fromSerialized(serialized: string): Rng
}

// ---------- sha256 (pure TS, synchronous; WebCrypto is async and node:crypto is not available in the browser) ----------
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

function rotr(x: number, n: number): number { return (x >>> n) | (x << (32 - n)) }

export function sha256Words(message: string): Uint32Array {
  const bytes = new TextEncoder().encode(message)
  const bitLen = bytes.length * 8
  const padded = new Uint8Array(Math.ceil((bytes.length + 9) / 64) * 64)
  padded.set(bytes)
  padded[bytes.length] = 0x80
  const view = new DataView(padded.buffer)
  view.setUint32(padded.length - 8, Math.floor(bitLen / 0x100000000))
  view.setUint32(padded.length - 4, bitLen >>> 0)
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19])
  const W = new Uint32Array(64)
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) W[i] = view.getUint32(off + i * 4)
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3)
      const s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10)
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0
    }
    let [a, b, c, d, e, f, g, h] = H
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      const ch = (e & f) ^ (~e & g)
      const t1 = (h + S1 + ch + K[i] + W[i]) >>> 0
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const t2 = (S0 + maj) >>> 0
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0
  }
  return H
}

// D3 = ceil(D6 / 2) (10-rules R-1.5): 1,2 → 1; 3,4 → 2; 5,6 → 3
export function d3FromD6(face: number): number { return Math.ceil(face / 2) }

function rotl(x: number, k: number): number { return (x << k) | (x >>> (32 - k)) }

const SEEDED_PREFIX = 'xoshiro:'
const SCRIPTED_PREFIX = 'scripted:'

// deterministic xoshiro128** implementation (W1-A)
export class SeededRng implements Rng {
  private readonly s: Uint32Array

  constructor(seed: string) {
    const h = sha256Words(seed)
    this.s = new Uint32Array([h[0], h[1], h[2], h[3]])
    if (this.s[0] === 0 && this.s[1] === 0 && this.s[2] === 0 && this.s[3] === 0) this.s[0] = 1
  }

  private static fromState(words: Uint32Array): SeededRng {
    const r = new SeededRng('')
    r.s.set(words)
    return r
  }

  private nextU32(): number {
    const s = this.s
    const result = Math.imul(rotl(Math.imul(s[1], 5), 7), 9) >>> 0
    const t = s[1] << 9
    s[2] ^= s[0]
    s[3] ^= s[1]
    s[1] ^= s[2]
    s[0] ^= s[3]
    s[2] ^= t
    s[3] = rotl(s[3], 11)
    return result
  }

  next(): number { return this.nextU32() / 4294967296 }

  roll(sides: DieSides): number {
    const d6 = 1 + Math.floor(this.next() * 6)
    return sides === 3 ? d3FromD6(d6) : d6
  }

  serialize(): string {
    return SEEDED_PREFIX + Array.from(this.s, (w) => w.toString(16).padStart(8, '0')).join(',')
  }

  static fromSerialized(serialized: string): SeededRng {
    if (!serialized.startsWith(SEEDED_PREFIX)) throw new EngineInvariantError('SeededRng: bad serialized state', { serialized })
    const parts = serialized.slice(SEEDED_PREFIX.length).split(',')
    if (parts.length !== 4) throw new EngineInvariantError('SeededRng: bad serialized state', { serialized })
    const words = new Uint32Array(parts.map((p) => parseInt(p, 16) >>> 0))
    if (words.some((w) => Number.isNaN(w))) throw new EngineInvariantError('SeededRng: bad serialized state', { serialized })
    return SeededRng.fromState(words)
  }
}

// fixed sequence for tests; throws when exhausted. serialize() encodes the remaining queue (prefix 'scripted:') so
// restoreRng can rebuild it and step stays a pure function of state.
// Queue values are D6 faces (1..6); roll(3) consumes one face and maps it with d3FromD6; next() consumes one face too.
export class ScriptedRng implements Rng {
  private readonly queue: number[]

  constructor(dice: number[]) {
    for (const d of dice) {
      if (!Number.isInteger(d) || d < 1 || d > 6) throw new EngineInvariantError('ScriptedRng: dice must be integers 1..6', { dice })
    }
    this.queue = [...dice]
  }

  get remaining(): number[] { return [...this.queue] }

  private take(): number {
    const v = this.queue.shift()
    if (v === undefined) throw new EngineInvariantError('ScriptedRng exhausted')
    return v
  }

  next(): number { return (this.take() - 1) / 6 }

  roll(sides: DieSides): number {
    const face = this.take()
    return sides === 3 ? d3FromD6(face) : face
  }

  serialize(): string { return SCRIPTED_PREFIX + this.queue.join(',') }

  static fromSerialized(serialized: string): ScriptedRng {
    if (!serialized.startsWith(SCRIPTED_PREFIX)) throw new EngineInvariantError('ScriptedRng: bad serialized state', { serialized })
    const body = serialized.slice(SCRIPTED_PREFIX.length)
    return new ScriptedRng(body === '' ? [] : body.split(',').map((x) => Number(x)))
  }
}

export function createRng(seed: string): Rng { return new SeededRng(seed) }

export function restoreRng(serialized: string): Rng {
  if (serialized.startsWith(SCRIPTED_PREFIX)) return ScriptedRng.fromSerialized(serialized)
  if (serialized.startsWith(SEEDED_PREFIX)) return SeededRng.fromSerialized(serialized)
  throw new EngineInvariantError('restoreRng: unknown RNG serialization', { serialized })
}

export const rngFactory: RngFactory = { fromSeed: createRng, fromSerialized: restoreRng }
