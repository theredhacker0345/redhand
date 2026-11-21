import { z } from "zod";
import type { CdpClient } from "./cdp-client.js";
import { RedhandError } from "./errors.js";
import { rectSchema, snapshotSchema, type EvaluateResult, type RedhandElement, type Rect } from "./schema.js";
import { EXECUTOR_SOURCE, EXECUTOR_VERSION } from "@redhand/executor";

/**
 * Element index layer: installs the in-page executor into a target session,
 * collects indexed interactive-element snapshots, and computes snapshot diffs.
 * All page-side work happens inside the executor; this module is orchestration
 * + zod boundaries only.
 */

const liveRectSchema = z.object({ rect: rectSchema.nullable() });
const boolResultSchema = z.object({ ok: z.boolean() });

/** Install the executor into the current document of a session. */
export async function installExecutor(cdp: CdpClient, sessionId: string): Promise<void> {
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: EXECUTOR_SOURCE }, { sessionId });
  await cdp.send("Runtime.evaluate", { expression: EXECUTOR_SOURCE, returnByValue: true }, { sessionId });
}

function unwrapEvaluate(raw: EvaluateResult, what: string): unknown {
  if (raw.exceptionDetails) {
    const desc = raw.exceptionDetails.exception?.description ?? raw.exceptionDetails.text;
    throw new RedhandError("PROTOCOL_ERROR", `Executor failed during ${what}: ${desc}`, raw.exceptionDetails);
  }
  return raw.result.value;
}

/**
 * Collect an indexed snapshot of interactive elements in the attached tab.
 * The executor performs discovery, overlap pruning and viewport filtering;
 * results are zod-validated here before reaching callers.
 */
export async function snapshot(cdp: CdpClient, sessionId: string): Promise<RedhandElement[]> {
  const raw = await cdp.evaluate(sessionId, "window.__redhand.snapshot()");
  const value = unwrapEvaluate(raw, "snapshot");
  const parsed = snapshotSchema.safeParse(value);
  if (!parsed.success) {
    throw new RedhandError("VALIDATION", "Executor snapshot failed validation", parsed.error.issues);
  }
  return parsed.data;
}

/** Recompute the live rect of an indexed element (element may be null). */
export async function liveRect(cdp: CdpClient, sessionId: string, index: number): Promise<Rect | null> {
  const raw = await cdp.evaluate(sessionId, `window.__redhand.liveRect(${index})`);
  const parsed = liveRectSchema.safeParse(unwrapEvaluate(raw, "liveRect"));
  if (!parsed.success) {
    throw new RedhandError("VALIDATION", "Executor liveRect failed validation", parsed.error.issues);
  }
  return parsed.data.rect;
}

/** Focus an indexed element; returns whether it actually took focus. */
export async function focusElement(cdp: CdpClient, sessionId: string, index: number): Promise<boolean> {
  const raw = await cdp.evaluate(sessionId, `window.__redhand.focus(${index})`);
  const parsed = boolResultSchema.safeParse(unwrapEvaluate(raw, "focus"));
  if (!parsed.success) {
    throw new RedhandError("VALIDATION", "Executor focus failed validation", parsed.error.issues);
  }
  return parsed.data.ok;
}

/** Scroll an indexed element into the center of the viewport. */
export async function scrollIntoView(cdp: CdpClient, sessionId: string, index: number): Promise<void> {
  const raw = await cdp.evaluate(sessionId, `window.__redhand.scrollIntoView(${index})`);
  z.object({ done: z.boolean() }).parse(unwrapEvaluate(raw, "scrollIntoView"));
}

/** Select an option on an indexed <select> and fire a bubbling change event. */
export async function selectOption(cdp: CdpClient, sessionId: string, index: number, value: string): Promise<boolean> {
  const expression = `window.__redhand.selectOption(${index}, ${JSON.stringify(value)})`;
  const raw = await cdp.evaluate(sessionId, expression);
  const parsed = boolResultSchema.safeParse(unwrapEvaluate(raw, "selectOption"));
  if (!parsed.success) {
    throw new RedhandError("VALIDATION", "Executor selectOption failed validation", parsed.error.issues);
  }
  return parsed.data.ok;
}

export interface SnapshotDiff {
  added: RedhandElement[];
  removed: RedhandElement[];
  changed: Array<{ index: number; field: string; before: unknown; after: unknown }>;
}

/**
 * Diff two snapshots by element index. Elements are matched on their index;
 * fields compared: tag, text, ariaLabel, placeholder, href, rect.
 */
export function diffSnapshots(before: RedhandElement[], after: RedhandElement[]): SnapshotDiff {
  const beforeByIndex = new Map(before.map((el) => [el.index, el]));
  const afterByIndex = new Map(after.map((el) => [el.index, el]));
  const added: RedhandElement[] = [];
  const removed: RedhandElement[] = [];
  const changed: SnapshotDiff["changed"] = [];
  const comparableFields = ["tag", "text", "ariaLabel", "placeholder", "href"] as const;

  for (const el of after) {
    const old = beforeByIndex.get(el.index);
    if (!old) {
      added.push(el);
      continue;
    }
    for (const field of comparableFields) {
      if ((old[field] ?? undefined) !== (el[field] ?? undefined)) {
        changed.push({ index: el.index, field, before: old[field], after: el[field] });
      }
    }
    const rectDiff = !rectEquals(old.rect, el.rect);
    if (rectDiff) {
      changed.push({ index: el.index, field: "rect", before: old.rect, after: el.rect });
    }
  }
  for (const el of before) {
    if (!afterByIndex.has(el.index)) {
      removed.push(el);
    }
  }
  return { added, removed, changed };
}

function rectEquals(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

/** Human-readable snapshot rendering for LLM prompts (one line per element). */
export function renderSnapshot(elements: RedhandElement[]): string {
  const lines = elements.map((el) => {
    const rectPart = `rect=(${Math.round(el.rect.x)},${Math.round(el.rect.y)},${Math.round(el.rect.width)},${Math.round(el.rect.height)})`;
    const rolePart = el.role ? ` [${el.role}]` : "";
    const textPart = el.text ? ` "${el.text}"` : el.ariaLabel ? ` "${el.ariaLabel}"` : el.placeholder ? ` (placeholder: ${el.placeholder})` : "";
    const disabledPart = el.disabled === true ? " [disabled]" : "";
    return `${el.index} <${el.tag}${rolePart}>${textPart} ${rectPart}${disabledPart}`;
  });
  return lines.join("\n");
}

/** Current executor version marker (bumped together with the executor package). */
export const executorVersion = EXECUTOR_VERSION;
