/**
 * Deterministic seeded RNG (mulberry32) with sampling helpers.
 * Everything that must be testable draws randomness from here — inject a
 * fixed seed in tests, real entropy in production.
 */

export class Rng {
  private state: number;

  constructor(seed?: number) {
    this.state = (seed ?? Date.now()) >>> 0;
    if (this.state === 0) {
      this.state = 0x9e3779b9;
    }
  }

  /** Uniform float in [0, 1). */
  float(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return Math.floor(this.float() * (max - min + 1)) + min;
  }

  /** Pick a random element of an array. */
  pick<T>(items: readonly T[]): T {
    return items[this.int(0, items.length - 1)] as T;
  }

  /**
   * Approximate normal sample via Box-Muller; clamped to mu +/- 3 sigma.
   */
  normal(mu: number, sigma: number): number {
    const u1 = Math.max(this.float(), 1e-9);
    const u2 = this.float();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const clamped = Math.max(-3, Math.min(3, z));
    return mu + clamped * sigma;
  }

  /** Chance check: true with the given probability. */
  chance(probability: number): boolean {
    return this.float() < probability;
  }
}
