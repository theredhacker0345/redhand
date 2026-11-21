import { z } from "zod";
import { RedhandError } from "./errors.js";
import { adaptWsSocket, type SocketLike } from "./socket.js";
import {
  attachResultSchema,
  browserVersionSchema,
  evaluateResultSchema,
  targetListSchema,
  type EvaluateResult,
  type TargetInfo,
} from "./schema.js";

/**
 * Thin CDP-over-WebSocket client.
 * Single WebSocket to the browser endpoint, session-scoped commands via
 * Target.attachToTarget(flatten), id-correlated request/response, and an
 * event bus scoped by sessionId. All inbound payloads cross a zod boundary.
 */

export interface CdpSendOptions<T> {
  /** Target session (from Target.attachToTarget) — omit for browser-level calls. */
  sessionId?: string;
  /** Zod schema applied to the `result` payload before it reaches callers. */
  schema?: z.ZodType<T>;
  timeoutMs?: number;
}

export interface EventBinding {
  event: string;
  handler: (params: object, sessionId?: string) => void;
  sessionId?: string;
}

interface PendingCall {
  resolve: (value: unknown) => void;
  reject: (err: RedhandError) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface CdpClientOptions {
  requestTimeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

function parseSocketMessage(data: string): { id?: number; method?: string; params?: object; sessionId?: string; result?: unknown; error?: { code?: number; message?: string; data?: unknown } } {
  const parsed: unknown = JSON.parse(data);
  const schema = z.object({
    id: z.number().optional(),
    method: z.string().optional(),
    params: z.unknown().optional(),
    sessionId: z.string().optional(),
    result: z.unknown().optional(),
    error: z
      .object({
        code: z.number().optional(),
        message: z.string().optional(),
        data: z.unknown().optional(),
      })
      .optional(),
  });
  return schema.parse(parsed) as {
    id?: number;
    method?: string;
    params?: object;
    sessionId?: string;
    result?: unknown;
    error?: { code?: number; message?: string; data?: unknown };
  };
}

export class CdpClient {
  private socket: SocketLike | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, PendingCall>();
  private readonly bindings = new Set<EventBinding & { fn: (params: object, sessionId?: string) => void }>();
  private closed = false;
  private readonly requestTimeoutMs: number;

  private constructor(options: CdpClientOptions = {}) {
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /**
   * Discover a browser's WebSocket endpoint from its CDP HTTP server.
   * @param port remote debugging port (default 9222).
   * @returns the validated /json/version payload.
   */
  static async discover(port = 9222): Promise<{ wsUrl: string; version: z.infer<typeof browserVersionSchema> }> {
    let response: Response;
    try {
      response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(5000) });
    } catch (err) {
      throw new RedhandError("DISCOVER_FAILED", `No CDP endpoint reachable on port ${port}`, err);
    }
    if (!response.ok) {
      throw new RedhandError("DISCOVER_FAILED", `CDP discovery returned HTTP ${response.status}`, { status: response.status });
    }
    const parsed = browserVersionSchema.parse(await response.json());
    return { wsUrl: parsed.webSocketDebuggerUrl, version: parsed };
  }

  /**
   * Connect to a browser WebSocket endpoint.
   * @param wsUrl the webSocketDebuggerUrl from discover().
   */
  /* v8 ignore start — requires a real ws handshake; covered by @integration tests */
  static async connect(wsUrl: string, options: CdpClientOptions = {}): Promise<CdpClient> {
    const { WebSocket } = await import("ws");
    const ws = new WebSocket(wsUrl);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new RedhandError("TIMEOUT", "WebSocket open timed out")), 10_000);
      ws.once("open", () => {
        clearTimeout(timer);
        resolve();
      });
      ws.once("error", (err: Error) => {
        clearTimeout(timer);
        reject(new RedhandError("SOCKET_CLOSED", `WebSocket failed to open: ${err.message}`, err));
      });
    });
    const client = new CdpClient(options);
    client.bind(adaptWsSocket(ws));
    return client;
  }
  /* v8 ignore stop */

  /** Test entry point — bind a caller-provided socket (fixture-driven tests). */
  static fromSocket(socket: SocketLike, options: CdpClientOptions = {}): CdpClient {
    const client = new CdpClient(options);
    client.bind(socket);
    return client;
  }

  private bind(socket: SocketLike): void {
    this.socket = socket;
    socket.onMessage((data) => this.handleMessage(data));
    socket.onClose(() => this.handleClose());
    socket.onError((err) => this.handleClose(new RedhandError("SOCKET_CLOSED", `Socket error: ${err.message}`, err)));
  }

  private handleMessage(data: string): void {
    let message: ReturnType<typeof parseSocketMessage>;
    try {
      message = parseSocketMessage(data);
    } catch (err) {
      // Defensive: malformed inbound frames are logged-and-dropped, never fatal.
      this.emit("__protocolError__", { raw: data, err }, undefined);
      return;
    }
    if (typeof message.id === "number") {
      const pending = this.pending.get(message.id);
      if (!pending) {
        return;
      }
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) {
        pending.reject(
          new RedhandError("CDP_ERROR", message.error.message ?? "CDP command failed", message.error),
        );
        return;
      }
      pending.resolve(message.result);
      return;
    }
    if (typeof message.method === "string") {
      this.emit(message.method, (message.params ?? {}) as object, message.sessionId);
    }
  }

  private handleClose(err?: RedhandError): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    const failure = err ?? new RedhandError("SOCKET_CLOSED", "CDP socket closed");
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(failure);
    }
    this.pending.clear();
  }

  private emit(event: string, params: object, sessionId?: string): void {
    for (const binding of this.bindings) {
      if (binding.event !== event) {
        continue;
      }
      if (binding.sessionId !== undefined && binding.sessionId !== sessionId) {
        continue;
      }
      try {
        binding.fn(params, sessionId);
      } catch (err) {
        // A listener bug must never break the event pump for other listeners.
        this.emit("__listenerError__", { event, err: String(err) }, undefined);
      }
    }
  }

  /**
   * Subscribe to a CDP event. Pass sessionId to scope to one target session.
   * @returns an unsubscribe function.
   */
  on(event: string, handler: (params: object, sessionId?: string) => void, sessionId?: string): () => void {
    const binding: EventBinding & { fn: (params: object, sessionId?: string) => void } = {
      event,
      handler,
      sessionId,
      fn: handler,
    };
    this.bindings.add(binding);
    return () => {
      this.bindings.delete(binding);
    };
  }

  /**
   * Send a CDP command and await its correlated result.
   * @param method CDP method, e.g. "Input.dispatchMouseEvent".
   * @param params command parameters.
   * @param opts sessionId scope, optional zod result schema, timeout override.
   */
  async send<T = unknown>(method: string, params: object = {}, opts: CdpSendOptions<T> = {}): Promise<T> {
    if (this.closed || this.socket === null) {
      throw new RedhandError("SOCKET_CLOSED", "CDP client is not connected");
    }
    const id = this.nextId++;
    const timeoutMs = opts.timeoutMs ?? this.requestTimeoutMs;
    const payload: Record<string, unknown> = { id, method, params };
    if (opts.sessionId !== undefined) {
      payload.sessionId = opts.sessionId;
    }
    const promise = new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new RedhandError("TIMEOUT", `CDP ${method} timed out after ${timeoutMs}ms`, { method }));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      });
    });
    this.socket.send(JSON.stringify(payload));
    const raw = await promise;
    if (opts.schema) {
      const parsed = opts.schema.safeParse(raw);
      if (!parsed.success) {
        throw new RedhandError("VALIDATION", `CDP ${method} result failed validation`, parsed.error.issues);
      }
      return parsed.data;
    }
    return raw as T;
  }

  /** Evaluate an expression in the session's page context. */
  async evaluate(sessionId: string, expression: string, awaitPromise = false): Promise<EvaluateResult> {
    return this.send(
      "Runtime.evaluate",
      { expression, returnByValue: true, awaitPromise },
      { sessionId, schema: evaluateResultSchema },
    );
  }

  /** List all browser targets. */
  async getTargets(): Promise<TargetInfo[]> {
    const result = await this.send(
      "Target.getTargets",
      {},
      { schema: z.object({ targetInfos: targetListSchema }) },
    );
    return result.targetInfos;
  }

  /** Attach to a target with flatten:true and return the session id. */
  async attachToTarget(targetId: string): Promise<string> {
    const result = await this.send("Target.attachToTarget", { targetId, flatten: true }, { schema: attachResultSchema });
    return result.sessionId;
  }

  /** Detach a previously attached session. */
  async detachFromTarget(sessionId: string): Promise<void> {
    await this.send("Target.detachFromTarget", { sessionId });
  }

  /** Close the underlying socket; rejects all in-flight calls. */
  close(): void {
    if (this.socket !== null) {
      this.socket.close(1000);
    }
    this.handleClose();
  }
}
