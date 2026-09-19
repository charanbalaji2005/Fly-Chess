/**
 * Deterministic random numbers.
 *
 * The dice must be reproducible: a replay has to roll the same sequence, and
 * an authoritative server has to be able to prove a roll rather than be told
 * one. So the generator is a pure function of an integer state that lives in
 * the game state and advances with it -- `Math.random()` appears nowhere in
 * the engine.
 *
 * mulberry32 is used because it is four lines, passes the usual smoke tests
 * for a game die, and its state is a single uint32 that serialises for free.
 */

/** One step of mulberry32: returns the next state and a float in [0, 1). */
export function nextFloat(state: number): { state: number; value: number } {
  let s = (state + 0x6d2b79f5) | 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { state: s, value };
}

/** Uniform integer in [1, sides]. */
export function nextDie(state: number, sides: number): { state: number; value: number } {
  const step = nextFloat(state);
  return { state: step.state, value: 1 + Math.floor(step.value * sides) };
}

/** Uniform integer in [0, n). */
export function nextInt(state: number, n: number): { state: number; value: number } {
  const step = nextFloat(state);
  return { state: step.state, value: Math.floor(step.value * n) };
}

/**
 * Turn an arbitrary seed into a well-mixed starting state.
 *
 * Seeds are often small and sequential (a timestamp, a room counter), and
 * mulberry32 started from those produces visibly similar first rolls.
 */
export function seedState(seed: number): number {
  let h = seed | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return (h ^ (h >>> 16)) | 0;
}

/** Stateful wrapper, for the AI and for cosmetic randomness in the renderer. */
export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seedState(seed);
  }

  float(): number {
    const step = nextFloat(this.s);
    this.s = step.state;
    return step.value;
  }

  int(n: number): number {
    return Math.floor(this.float() * n);
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)];
  }

  range(lo: number, hi: number): number {
    return lo + this.float() * (hi - lo);
  }
}
