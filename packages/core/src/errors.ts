/**
 * Discriminated error types for the redhand CDP stack.
 * Never throw plain strings — every failure carries a machine-readable code.
 */

export type RedhandErrorCode =
  | "SOCKET_CLOSED"
  | "PROTOCOL_ERROR"
  | "TIMEOUT"
  | "CDP_ERROR"
  | "VALIDATION"
  | "NOT_ATTACHED"
  | "DISCOVER_FAILED";

export interface RedhandErrorShape {
  readonly code: RedhandErrorCode;
  readonly message: string;
  /** Underlying detail — CDP error payload, HTTP status, zod issues, etc. */
  readonly detail?: unknown;
}

/** Typed error thrown by every redhand core operation. */
export class RedhandError extends Error implements RedhandErrorShape {
  readonly code: RedhandErrorCode;
  readonly detail?: unknown;

  constructor(code: RedhandErrorCode, message: string, detail?: unknown) {
    super(message);
    this.name = "RedhandError";
    this.code = code;
    if (detail !== undefined) {
      this.detail = detail;
    }
  }

  /** Narrow an unknown thrown value into a RedhandError (wraps foreign errors). */
  static from(value: unknown): RedhandError {
    if (value instanceof RedhandError) {
      return value;
    }
    if (value instanceof Error) {
      return new RedhandError("PROTOCOL_ERROR", value.message, { stack: value.stack });
    }
    return new RedhandError("PROTOCOL_ERROR", String(value), { raw: value });
  }
}

/** Guard that throws a typed RedhandError when a condition fails. */
export function assertOk(condition: boolean, code: RedhandErrorCode, message: string, detail?: unknown): void {
  if (!condition) {
    throw new RedhandError(code, message, detail);
  }
}
