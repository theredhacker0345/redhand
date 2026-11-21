import { Rng } from "./rng.js";

/**
 * Humanized mouse movement: Bezier-chain curves with an accelerate→decelerate
 * velocity profile, Fitts's-law durations, and probabilistic overshoot with
 * correction. All dispatch delays ride along with each sampled point.
 */

export interface Point {
  x: number;
  y: number;
}

export interface PathPoint extends Point {
  /** Milliseconds to wait BEFORE dispatching this point. */
  delayMs: number;
}

export interface CurveOptions {
  /** Distance-based duration override (ms). Computed via Fitts's law when omitted. */
  durationMs?: number;
  /** Probability of overshooting the target then correcting back (default 0.15). */
  overshootChance?: number;
  /** Sampling density control — points per 10px of distance (default 1.2). */
  density?: number;
  /** Seeded RNG for deterministic tests. */
  rng?: Rng;
}

/** Fitts's-law movement time, clamped to a humanly-plausible band. */
export function fittsDuration(distancePx: number, targetWidthPx: number): number {
  const width = Math.max(targetWidthPx, 8);
  const raw = 150 + 110 * Math.log2(distancePx / width + 1);
  return Math.max(180, Math.min(900, Math.round(raw)));
}

function easeInOut(t: number): number {
  // smoothstep — slow start, fast middle, slow landing
  return t * t * (3 - 2 * t);
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function cubicPoint(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

/**
 * Generate a humanized mouse path from `from` to `to`.
 * @returns sampled points, each with the dispatch delay BEFORE it (ms).
 */
export function mousePath(from: Point, to: Point, options: CurveOptions = {}): PathPoint[] {
  const rng = options.rng ?? new Rng();
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.max(Math.hypot(dx, dy), 1);
  const targetWidth = clamp(distance * 0.12, 24, 160);
  const duration = options.durationMs ?? fittsDuration(distance, targetWidth);
  const sampleCount = clamp(Math.round((distance / 10) * (options.density ?? 1.2)), 10, 60);

  // Perpendicular control offset gives the path its arc.
  const perpX = -dy / distance;
  const perpY = dx / distance;
  const arc1 = rng.int(15, 55) * (rng.chance(0.5) ? 1 : -1);
  const arc2 = rng.int(10, 40) * (rng.chance(0.5) ? 1 : -1);
  const p1: Point = { x: from.x + dx * 0.25 + perpX * arc1, y: from.y + dy * 0.25 + perpY * arc1 };
  const p2: Point = { x: from.x + dx * 0.75 + perpX * arc2, y: from.y + dy * 0.75 + perpY * arc2 };

  const points: PathPoint[] = [];
  for (let i = 1; i <= sampleCount; i++) {
    const raw = i / sampleCount;
    const eased = easeInOut(raw);
    const pt = cubicPoint(from, p1, p2, to, eased);
    // The final point lands exactly on target (no jitter); intermediate points
    // carry micro-jitter so the stream never looks machine-sampled.
    const isLast = i === sampleCount;
    const jitterX = isLast ? 0 : rng.normal(0, 0.7);
    const jitterY = isLast ? 0 : rng.normal(0, 0.7);
    const delayBase = duration / sampleCount;
    const delay = isLast ? rng.int(30, 60) : Math.max(4, Math.round(delayBase * rng.normal(1, 0.18)));
    points.push({ x: Math.round(pt.x + jitterX), y: Math.round(pt.y + jitterY), delayMs: delay });
  }

  // Probabilistic overshoot: extend past the target, then correct back.
  const overshootChance = options.overshootChance ?? 0.15;
  if (rng.chance(overshootChance) && distance > 60) {
    const overPx = rng.int(8, 25);
    const unitX = dx / distance;
    const unitY = dy / distance;
    const over = { x: to.x + unitX * overPx, y: to.y + unitY * overPx };
    points.push({ x: Math.round(over.x), y: Math.round(over.y), delayMs: rng.int(30, 60) });
    points.push({ x: Math.round(to.x), y: Math.round(to.y), delayMs: rng.int(60, 120) });
  }
  return points;
}

/** A pre-click dwell: the pause between cursor arrival and mousedown. */
export function dwell(rng: Rng = new Rng()): number {
  return rng.int(150, 400);
}
