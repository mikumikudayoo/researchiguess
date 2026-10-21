/** Mulberry32 arithmetic, independently packaged from the archived simulator. */
export function validateSeed(seed: number): void {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('seed must be a uint32');
}
export function seededRng(seed: number): () => number {
  validateSeed(seed);
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
