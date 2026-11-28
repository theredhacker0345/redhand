import type { IncomingMessage } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { z } from "zod";

/**
 * BridgeHub — the localhost hub that lets the redhand-bridge MV3 extension
 * expose the user's RUNNING browser to redhand without a debug-port relaunch.
 *
 * Peers (both token-gated, loopback-only):
 *   - role=extension  the companion extension's service worker, which executes
 *                     chrome.debugger operations inside the browser
 *   - role=agent      a CdpClient speaking browser-level CDP JSON frames
 *
 * The hub translates between the two:
 *   agent frame {id, method:"Target.getTargets"}        → tabs query
 *   agent frame {id, method:"Target.attachToTarget"}    → debugger attach
 *   agent frame {id, method:"Target.detachFromTarget"}  → debugger detach
 *   agent frame {id, method, params, sessionId}         → debugger sendCommand
 *   extension event {tabId, method, params}             → agent event {method, params, sessionId}
 *
 * The agent's sessionId is the (stringified) tab id; the extension maps it back.
 * The hub pings the extension every 20s to keep the MV3 service worker alive.
 */

export interface BridgeHubOptions {
  port?: number;
  host?: string;
  /** Pairing token both peers must present. Auto-generated when omitted. */
  token?: string;
  /** Ping interval for the extension keepalive (ms). */
  pingIntervalMs?: number;
  /** Optional debug logger (frame + relay tracing). */
  debugLog?: (line: string) => void;
}

export interface BridgeHubTab {
  targetId: string;
  title: string;
  url: string;
  active: boolean;
}

const inboundSchema = z.object({
  op: z.string().optional(),
  id: z.number().optional(),
  sessionId: z.string().optional(),
  reqId: z.string().optional(),
  tabId: z.number().optional(),
  method: z.string().optional(),
  params: z.unknown().optional(),
  result: z.unknown().optional(),
  error: z.unknown().optional(),
  message: z.string().optional(),
  tabs: z
    .array(
      z.object({
        targetId: z.string(),
        title: z.string().optional(),
        url: z.string().optional(),
        active: z.boolean().optional(),
      }),
    )
    .optional(),
});

type Inbound = z.infer<typeof inboundSchema>;

interface PendingExt {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export function generatePairingToken(): string {
  const bytes = new Uint8Array(24);
  for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function inboundFrame(data: string): Inbound | null {
  try {
    return inboundSchema.parse(JSON.parse(data));
  } catch {
    return null;
  }
}

const EXT_TIMEOUT_MS = 15_000;

/** Map extension tab reports to CDP TargetInfo shape (all bridge tabs are pages). */
function tabsToTargetInfos(tabs: BridgeHubTab[]): Array<{
  targetId: string;
  type: string;
  title?: string;
  url?: string;
  attached?: boolean;
}> {
  return tabs.map((t) => ({
    targetId: t.targetId,
    type: "page",
    title: t.title || undefined,
    url: t.url || undefined,
    attached: false,
  }));
}

export class BridgeHub {
  private wss: WebSocketServer | null = null;
  private extensionSocket: WebSocket | null = null;
  private agentSocket: WebSocket | null = null;
  private readonly token: string;
  private port = 0;
  private readonly host: string;
  private readonly pingIntervalMs: number;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private debugLog: ((line: string) => void) | null = null;
  private extReqCounter = 0;
  private readonly pendingExt = new Map<string, PendingExt>();
  private eventRelay: ((frame: object) => void) | null = null;
  private tabsCache: BridgeHubTab[] = [];


  constructor(options: BridgeHubOptions = {}) {
    this.port = options.port ?? 9223;
    this.host = options.host ?? "127.0.0.1";
    this.token = options.token ?? generatePairingToken();
    this.pingIntervalMs = options.pingIntervalMs ?? 20_000;
    this.debugLog = (options as { debugLog?: (line: string) => void }).debugLog ?? null;
  }

  /** The URL agents connect to (CdpClient.connect accepts this directly). */
  get agentUrl(): string {
    return `ws://${this.host}:${this.port}/?role=agent&token=${encodeURIComponent(this.token)}`;
  }

  /** The URL the bridge extension connects to (loopback only). */
  get extensionUrl(): string {
    return `ws://${this.host}:${this.port}/?role=extension&token=${encodeURIComponent(this.token)}`;
  }

  get bridgePort(): number {
    return this.port;
  }

  get pairingToken(): string {
    return this.token;
  }

  get extensionConnected(): boolean {
    return this.extensionSocket !== null;
  }

  get agentConnected(): boolean {
    return this.agentSocket !== null;
  }

  /** Tabs from the most recent extension query (active flag included). */
  get cachedTabs(): BridgeHubTab[] {
    return this.tabsCache;
  }

  /** Register a callback for CDP events relayed from the browser. */
  onEvent(handler: (frame: object) => void): () => void {
    this.eventRelay = handler;
    return () => {
      if (this.eventRelay === handler) this.eventRelay = null;
    };
  }

  /** Start listening. Resolves once the socket is bound. */
  start(): Promise<void> {
    const wss = new WebSocketServer({
      host: this.host,
      port: this.port,
      verifyClient: (info: { req: { url?: string | undefined } }) => {
        const url = new URL(info.req.url ?? "/", "http://localhost");
        const role = url.searchParams.get("role");
        const token = url.searchParams.get("token");
        return token === this.token && (role === "agent" || role === "extension");
      },
    });
    this.wss = wss;
    return new Promise((resolve, reject) => {
      wss.once("error", reject);
      wss.once("listening", () => {
        const addr = wss.address();
        if (addr !== null && typeof addr === "object" && this.port === 0) {
          this.port = addr.port;
        }
        wss.removeAllListeners("error");
        wss.on("connection", (socket: WebSocket, request: IncomingMessage) => this.onConnection(socket, request));
        resolve();
      });
    });
  }

  close(): void {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    this.extensionSocket?.close();
    this.agentSocket?.close();
    this.wss?.close();
    this.extensionSocket = null;
    this.agentSocket = null;
    this.wss = null;
  }

  private onConnection(socket: WebSocket, request: IncomingMessage): void {
    const url = new URL(request.url ?? "/", "http://localhost");
    const role = url.searchParams.get("role");
    if (role === "extension") {
      // One extension peer at a time; a reconnect replaces a dead socket.
      this.extensionSocket?.close(4000, "replaced");
      this.extensionSocket = socket;
      socket.on("message", (data: unknown) => this.onExtensionFrame(String(data)));
      socket.on("close", () => {
        if (this.extensionSocket === socket) {
          this.extensionSocket = null;
        }
        if (this.pingTimer !== null) {
          clearInterval(this.pingTimer);
          this.pingTimer = null;
        }
      });
      // Keepalive: the MV3 service worker stays alive while the socket is
      // active, so the hub pings it on a fixed interval.
      this.pingTimer = setInterval(() => {
        if (this.extensionSocket === socket) {
          socket.send(JSON.stringify({ op: "ping" }));
        } else if (this.pingTimer !== null) {
          clearInterval(this.pingTimer);
          this.pingTimer = null;
        }
      }, this.pingIntervalMs);
      return;
    }
    if (role === "agent") {
      this.agentSocket?.close(4000, "replaced");
      this.agentSocket = socket;
      socket.on("message", (data: unknown) => this.onAgentFrame(String(data)));
      socket.on("close", () => {
        if (this.agentSocket === socket) {
          this.agentSocket = null;
            }
      });
    }
  }

  private onAgentFrame(data: string): void {
    this.debugLog?.(`hub.onAgentFrame: ${data.slice(0, 120)}`);
    const frame = inboundFrame(data);
    if (frame === null) return;
    const id = frame.id;
    const method = frame.method;
    const params = (frame.params ?? {}) as Record<string, unknown>;
    const sessionId = frame.sessionId;
    if (typeof id !== "number" || typeof method !== "string") return;

    if (method === "Target.getTargets") {
      const reqId = this.nextExtReq();
      this.pendingExt.set(reqId, {
        resolve: (result) => {
          const tabs = (result as { tabs?: BridgeHubTab[] }).tabs ?? [];
          this.tabsCache = tabs;
          this.replyToAgent(id, { targetInfos: tabsToTargetInfos(tabs) });
        },
        reject: (err) => this.rejectAgent(id, err.message),
        timer: setTimeout(() => {
          this.pendingExt.delete(reqId);
          this.rejectAgent(id, "tabs query timed out over the bridge");
        }, EXT_TIMEOUT_MS),
      });
      this.sendToExtension({ op: "tabsReq", reqId });
      return;
    }
    if (method === "Target.attachToTarget") {
      const tabId = Number(params["targetId"]);
      const reqId = this.nextExtReq();
      this.pendingExt.set(reqId, {
        resolve: (result) => {
          void result;
          this.replyToAgent(id, { sessionId: String(tabId) });
        },
        reject: (err) => this.rejectAgent(id, err.message),
        timer: setTimeout(() => {
          this.pendingExt.delete(reqId);
          this.rejectAgent(id, "attach timed out over the bridge");
        }, EXT_TIMEOUT_MS),
      });
      this.sendToExtension({ op: "ext-attach", reqId, tabId });
      return;
    }
    if (method === "Target.detachFromTarget") {
      const tabId = Number(params["sessionId"]);
      const reqId = this.nextExtReq();
      this.pendingExt.set(reqId, {
        resolve: () => this.replyToAgent(id, {}),
        reject: (err) => this.rejectAgent(id, err.message),
        timer: setTimeout(() => {
          this.pendingExt.delete(reqId);
          this.rejectAgent(id, "detach timed out over the bridge");
        }, EXT_TIMEOUT_MS),
      });
      this.sendToExtension({ op: "ext-detach", reqId, tabId });
      return;
    }
    if (sessionId !== undefined) {
      const tabId = Number(sessionId);
      const reqId = `x${this.extReqCounter++}`;
      this.pendingExt.set(reqId, {
        resolve: (result) => this.replyToAgent(id, result ?? null),
        reject: (err) => this.rejectAgent(id, err.message),
        timer: setTimeout(() => {
          this.pendingExt.delete(reqId);
          this.rejectAgent(id, `CDP ${method} timed out over the bridge`);
        }, EXT_TIMEOUT_MS),
      });
      this.sendToExtension({ op: "ext-cdp", reqId, tabId, method, params });
      return;
    }
    // Browser-level methods without a tab — report unsupported so callers
    // fail loudly instead of hanging.
    this.rejectAgent(id, `not supported over the bridge: ${method}`);
  }

  private onExtensionFrame(data: string): void {
    this.debugLog?.(`hub.onExtensionFrame: ${data.slice(0, 120)}`);
    const frame = inboundFrame(data);
    if (frame === null) return;
    const reqId = frame.reqId ?? "";
    switch (frame.op) {
      case "pong":
      case "hello-ack":
        return;
      case "tabsRes": {
        const pending = this.pendingExt.get(reqId);
        if (!pending) return;
        this.pendingExt.delete(reqId);
        clearTimeout(pending.timer);
        const tabs = (frame.tabs ?? []).map(function (t) {
          return { targetId: t.targetId, title: t.title ?? "", url: t.url ?? "", active: t.active ?? false };
        });
        this.tabsCache = tabs;
        pending.resolve({ targetInfos: tabsToTargetInfos(tabs), tabs });
        return;
      }
      case "ext-attached":
      case "ext-cdp-res":
      case "ext-detached": {
        const pending = this.pendingExt.get(reqId);
        if (!pending) return;
        this.pendingExt.delete(reqId);
        clearTimeout(pending.timer);
        pending.resolve(frame.result ?? null);
        return;
      }
      case "ext-detach-error":
      case "ext-cdp-err":
      case "ext-attach-error":
      case "ext-error": {
        const pending = this.pendingExt.get(reqId);
        if (!pending) return;
        this.pendingExt.delete(reqId);
        clearTimeout(pending.timer);
        pending.reject(new Error(frame.message ?? "bridge operation failed"));
        return;
      }
      case "event": {
        const tabId = frame.tabId;
        const method = frame.method;
        if (typeof tabId !== "number" || typeof method !== "string") return;
        this.eventRelay?.({
          method,
          params: frame.params ?? {},
          sessionId: String(tabId),
        });
        return;
      }
      default:
        return;
    }
  }

  private replyToAgent(id: number, result: unknown): void {
    this.agentSocket?.send(JSON.stringify({ id, result }));
  }

  private rejectAgent(id: number, message: string): void {
    this.agentSocket?.send(JSON.stringify({ id, error: { code: -32000, message } }));
  }

  private sendToExtension(message: object): void {
    this.debugLog?.(`hub.sendToExtension: ${JSON.stringify(message).slice(0, 120)}`);
    this.extensionSocket?.send(JSON.stringify(message));
  }

  private nextExtReq(): string {
    const id = `x${this.extReqCounter++}`;
    return id;
  }
}
