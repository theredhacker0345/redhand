import { Rng } from "./rng.js";

/**
 * Humanized typing cadence: per-character delays drawn from a bursty
 * distribution, word-boundary pauses, punctuation hesitations, and optional
 * typo-then-backspace self-correction.
 */

export type TypingStep =
  | { kind: "char"; char: string; delayMs: number }
  | { kind: "erase"; delayMs: number }
  | { kind: "pause"; delayMs: number };

export interface CadenceOptions {
  /** Probability of a typo-and-correct on a given letter (default 0 — set ~0.08 for ghost mode). */
  typoProbability?: number;
  /** Seeded RNG for deterministic tests. */
  rng?: Rng;
}

const KEY_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];

function neighborsOf(ch: string): string[] {
  const lower = ch.toLowerCase();
  for (const row of KEY_ROWS) {
    const idx = row.indexOf(lower);
    if (idx >= 0) {
      const neighbors: string[] = [];
      if (idx > 0) {
        neighbors.push(row[idx - 1] as string);
      }
      if (idx < row.length - 1) {
        neighbors.push(row[idx + 1] as string);
      }
      const above = KEY_ROWS[KEY_ROWS.indexOf(row) - 1];
      if (above && idx < above.length) {
        neighbors.push(above[idx] as string);
      }
      return neighbors;
    }
  }
  return [ch];
}

function charDelay(rng: Rng): number {
  // Bursty: lognormal-ish via clamped normal, fast median with long tail.
  return Math.max(25, Math.round(rng.normal(95, 40)));
}

function isWordBoundary(ch: string): boolean {
  return ch === " " || ch === "\n" || ch === "\t";
}

function isPunctuation(ch: string): boolean {
  return ",.!?;:()[]{}\"'-".includes(ch);
}

/**
 * Build the dispatch plan for typing `text`.
 * @returns ordered steps — dispatch each char via trusted input, honor delays.
 */
export function cadence(text: string, options: CadenceOptions = {}): TypingStep[] {
  const rng = options.rng ?? new Rng();
  const typoProbability = options.typoProbability ?? 0;
  const steps: TypingStep[] = [];

  for (const ch of text) {
    const isLetter = ch.length === 1 && ch.toLowerCase() !== ch.toUpperCase();
    if (isLetter && rng.chance(typoProbability)) {
      const neighbors = neighborsOf(ch);
      const wrong = rng.pick(neighbors);
      steps.push({ kind: "char", char: ch === ch.toUpperCase() ? wrong.toUpperCase() : wrong, delayMs: charDelay(rng) });
      steps.push({ kind: "erase", delayMs: rng.int(90, 180) });
    }
    steps.push({ kind: "char", char: ch, delayMs: charDelay(rng) });
    if (isPunctuation(ch)) {
      steps.push({ kind: "pause", delayMs: rng.int(80, 180) });
    } else if (isWordBoundary(ch)) {
      steps.push({ kind: "pause", delayMs: rng.int(100, 240) });
    }
  }
  return steps;
}

/** Total characters actually typed (including typo mistakes). */
export function typedCharCount(steps: TypingStep[]): number {
  return steps.filter((s) => s.kind === "char").length;
}
