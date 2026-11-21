import { describe, expect, it } from "vitest";
import { Rng } from "./rng.js";
import { fittsDuration, mousePath } from "./curves.js";
import { cadence, typedCharCount } from "./typing.js";

describe("Rng", () => {
  it("is deterministic for a fixed seed", () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const seqA = [a.float(), a.float(), a.float()];
    const seqB = [b.float(), b.float(), b.float()];
    expect(seqA).toEqual(seqB);
  });

  it("stays within bounds for int and normal", () => {
    const rng = new Rng(7);
    for (let i = 0; i < 200; i++) {
      const v = rng.int(3, 9);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(9);
      const n = rng.normal(100, 20);
      expect(n).toBeGreaterThanOrEqual(40);
      expect(n).toBeLessThanOrEqual(160);
    }
  });
});

describe("fittsDuration", () => {
  it("clamps to the human band", () => {
    expect(fittsDuration(1, 100)).toBeGreaterThanOrEqual(180);
    expect(fittsDuration(2000, 8)).toBeLessThanOrEqual(900);
  });

  it("grows with distance", () => {
    const near = fittsDuration(50, 40);
    const far = fittsDuration(900, 40);
    expect(far).toBeGreaterThan(near);
  });
});

describe("mousePath", () => {
  it("starts at the target end exactly", () => {
    const path = mousePath({ x: 100, y: 100 }, { x: 500, y: 400 }, { rng: new Rng(1) });
    const last = path.at(-1);
    expect(last).toMatchObject({ x: 500, y: 400 });
    expect(path.length).toBeGreaterThanOrEqual(10);
  });

  it("produces positive delays with seeded determinism", () => {
    const a = mousePath({ x: 0, y: 0 }, { x: 300, y: 200 }, { rng: new Rng(5) });
    const b = mousePath({ x: 0, y: 0 }, { x: 300, y: 200 }, { rng: new Rng(5) });
    expect(a).toEqual(b);
    for (const pt of a) {
      expect(pt.delayMs).toBeGreaterThan(0);
    }
  });

  it("overshoot paths correct back to the exact target", () => {
    // Force overshoot by searching seeds — probabilistic but deterministic.
    let corrected = false;
    for (let seed = 0; seed < 40 && !corrected; seed++) {
      const path = mousePath({ x: 10, y: 10 }, { x: 600, y: 300 }, { rng: new Rng(seed), overshootChance: 0.9 });
      const last = path.at(-1);
      if (last !== undefined && path.length >= 2) {
        const secondLast = path.at(-2);
        if (last.x === 600 && last.y === 300 && (secondLast?.x !== 600 || secondLast?.y !== 300)) {
          corrected = true;
        }
      }
    }
    expect(corrected).toBe(true);
  });
});

describe("cadence", () => {
  it("types every character exactly once with zero typo probability", () => {
    const steps = cadence("hello world", { rng: new Rng(3), typoProbability: 0 });
    expect(typedCharCount(steps)).toBe("hello world".length);
    const erased = steps.filter((s) => s.kind === "erase");
    expect(erased).toHaveLength(0);
  });

  it("adds word-boundary pauses after spaces", () => {
    const steps = cadence("a b", { rng: new Rng(11), typoProbability: 0 });
    const spaceIndex = steps.findIndex((s) => s.kind === "char" && s.char === " ");
    expect(spaceIndex).toBeGreaterThanOrEqual(0);
    const after = steps[spaceIndex + 1];
    expect(after?.kind).toBe("pause");
  });

  it("inserj typos with erase+correct at high probability", () => {
    const steps = cadence("abc", { rng: new Rng(2), typoProbability: 0.9 });
    const erased = steps.filter((s) => s.kind === "erase");
    expect(erased.length).toBeGreaterThan(0);
    expect(typedCharCount(steps)).toBe("abc".length + erased.length);
  });
});
