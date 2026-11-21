import { z } from "zod";

/**
 * Zod schemas for every external boundary of the core package:
 * the CDP HTTP discovery endpoints and the shape of element snapshots
 * produced by the in-page executor.
 */

/** GET /json/version — browser-level discovery payload. */
export const browserVersionSchema = z
  .object({
    webSocketDebuggerUrl: z.string().min(1),
    Browser: z.string().optional(),
    "Protocol-Version": z.string().optional(),
    "User-Agent": z.string().optional(),
  })
  .passthrough();

export type BrowserVersion = z.infer<typeof browserVersionSchema>;

/** Single entry from GET /json/list (page/iframe/service-worker targets). */
export const targetInfoSchema = z.object({
  targetId: z.string().min(1),
  type: z.string(),
  title: z.string().optional(),
  url: z.string().optional(),
  attached: z.boolean().optional(),
});

export type TargetInfo = z.infer<typeof targetInfoSchema>;

/** GET /json/list — full target list. */
export const targetListSchema = z.array(targetInfoSchema);

/** Result of Target.attachToTarget with flatten:true. */
export const attachResultSchema = z.object({ sessionId: z.string().min(1) });

/** Rectangle in page viewport coordinates (CSS pixels). */
export const rectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

export type Rect = z.infer<typeof rectSchema>;

/** One interactive element as reported by the in-page executor snapshot. */
export const elementSchema = z.object({
  index: z.number().int().min(1),
  tag: z.string().min(1),
  role: z.string().optional(),
  text: z.string().optional(),
  ariaLabel: z.string().optional(),
  placeholder: z.string().optional(),
  href: z.string().optional(),
  disabled: z.boolean().optional(),
  rect: rectSchema,
});

export type RedhandElement = z.infer<typeof elementSchema>;

export const snapshotSchema = z.array(elementSchema);

export type Snapshot = z.infer<typeof snapshotSchema>;

/** Result envelope of Runtime.evaluate with returnByValue:true. */
export const evaluateResultSchema = z.object({
  result: z.object({
    type: z.string().optional(),
    value: z.unknown().optional(),
    description: z.string().optional(),
  }),
  exceptionDetails: z
    .object({
      text: z.string(),
      exception: z.object({ description: z.string().optional() }).optional(),
    })
    .optional(),
});

export type EvaluateResult = z.infer<typeof evaluateResultSchema>;
