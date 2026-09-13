// Seeded RNG contract (00-arch §6). Reference impl: xoshiro128** seeded from sha256(seed); state serialised into GameState.rng.
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

// deterministic xoshiro128** implementation (W1-A)
export class SeededRng implements Rng {
  constructor(seed: string) {
    void seed
    throw new Error('not implemented')
  }
  next(): number { throw new Error('not implemented') }
  roll(sides: DieSides): number { void sides; throw new Error('not implemented') }
  serialize(): string { throw new Error('not implemented') }
  static fromSerialized(serialized: string): SeededRng { void serialized; throw new Error('not implemented') }
}

// fixed sequence for tests; throws when exhausted. serialize() encodes the remaining queue (prefix 'scripted:') so
// restoreRng can rebuild it and step stays a pure function of state.
export class ScriptedRng implements Rng {
  constructor(dice: number[]) {
    void dice
    throw new Error('not implemented')
  }
  next(): number { throw new Error('not implemented') }
  roll(sides: DieSides): number { void sides; throw new Error('not implemented') }
  serialize(): string { throw new Error('not implemented') }
}

export function createRng(seed: string): Rng { void seed; throw new Error('not implemented') }
export function restoreRng(serialized: string): Rng { void serialized; throw new Error('not implemented') }
