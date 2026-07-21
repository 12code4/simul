// Deterministic PRNG (mulberry32). The RNG state is a plain number stored in
// the game state, so a run is reproducible from its seed and fully serializable.

export interface Rng {
  state: number;
}

export function createRng(seed: number): Rng {
  return { state: seed >>> 0 };
}

export function nextU32(rng: Rng): number {
  rng.state = (rng.state + 0x6d2b79f5) >>> 0;
  let t = rng.state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}

/** Uniform float in [0, 1). */
export function nextFloat(rng: Rng): number {
  return nextU32(rng) / 4294967296;
}

/** Uniform float in [min, max). */
export function range(rng: Rng, min: number, max: number): number {
  return min + (max - min) * nextFloat(rng);
}

/** Uniform integer in [min, max] (inclusive). */
export function rangeInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(nextFloat(rng) * (max - min + 1));
}

export function pick<T>(rng: Rng, arr: readonly T[]): T {
  return arr[rangeInt(rng, 0, arr.length - 1)];
}

/** Fisher–Yates shuffle, in place. Returns the same array for convenience. */
export function shuffle<T>(rng: Rng, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rangeInt(rng, 0, i);
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}
