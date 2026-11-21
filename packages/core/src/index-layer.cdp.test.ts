import { beforeAll, describe, expect, it, vi } from "vitest";
import { CdpClient } from "./cdp-client.js";
import { adaptWsSocket } from "./socket.js";
import {
  installExecutor,
  liveRect,
  focusElement,
  scrollIntoView,
  selectOption,
  snapshot,
} from "./index-layer.js";
import type { SocketLike } from "./socket.js";

/** Fixture-driven socket: routes CDP methods by name (no real socket). */
class RoutingSocket implements SocketLike {
  readonly sent: Array<Record<string, unknown>> = [];
  private handler: ((data: string) => void) | null = null;
  routes: Map<string, (params: object) => unknown> = new Map();

  send(data: string): void {
    const frame = JSON.parse(data) as { id: number; method: string; params: object };
    this.sent.push(frame);
    const route = this.routes.get(frame.method);
    const reply: object =
      route !== undefined ? { id: frame.id, result: route(frame.params) } : { id: frame.id, result: {} };
    this.handler?.(JSON.stringify(reply));
  }

  close(): void {
    this.handler?.("");
  }

  onMessage(handler: (data: string) => void): void {
    this.handler = handler;
  }

  onClose(_handler: () => void): void {}

  onError(_handler: (err: Error) => void): void {}
}

const SNAPSHOT_VALUE = [
  { index: 1, tag: "button", text: "Save", rect: { x: 5, y: 6, width: 70, height: 24 } },
];

describe("index-layer over fixture CDP socket", () => {
  let socket: RoutingSocket;
  let client: CdpClient;
  let smartRoute: (params: object) => unknown;

  beforeAll(() => {
    socket = new RoutingSocket();
    socket.routes.set("Target.attachToTarget", () => ({ sessionId: "sess-9" }));
    socket.routes.set("Page.addScriptToEvaluateOnNewDocument", () => ({}));
    smartRoute = (params) => {
      const expression = (params as { expression: string }).expression;
      if (expression.includes("__redhand.snapshot")) {
        return { result: { type: "object", value: SNAPSHOT_VALUE } };
      }
      if (expression.includes("liveRect")) {
        return { result: { type: "object", value: { rect: { x: 5, y: 6, width: 70, height: 24 } } } };
      }
      if (expression.includes("focus") || expression.includes("selectOption")) {
        return { result: { type: "object", value: { ok: true } } };
      }
      if (expression.includes("scrollIntoView")) {
        return { result: { type: "object", value: { done: true } } };
      }
      return { result: { type: "undefined" } };
    };
    socket.routes.set("Runtime.evaluate", smartRoute);
    client = CdpClient.fromSocket(socket);
  });

  it("installExecutor injects the source via addScriptToEvaluateOnNewDocument + evaluate", async () => {
    await installExecutor(client, "sess-9");
    const methods = socket.sent.map((f) => f["method"]);
    expect(methods).toContain("Page.addScriptToEvaluateOnNewDocument");
    const evals = socket.sent.filter((f) => f["method"] === "Runtime.evaluate");
    expect(evals.length).toBeGreaterThanOrEqual(1);
  });

  it("snapshot parses executor output into typed elements", async () => {
    const elements = await snapshot(client, "sess-9");
    expect(elements).toHaveLength(1);
    expect(elements[0]?.text).toBe("Save");
  });

  it("snapshot throws VALIDATION on malformed executor output", async () => {
    socket.routes.set("Runtime.evaluate", () => ({ result: { type: "object", value: [{ wrong: true }] } }));
    await expect(snapshot(client, "sess-9")).rejects.toMatchObject({ code: "VALIDATION" });
    socket.routes.set("Runtime.evaluate", smartRoute);
    await expect(snapshot(client, "sess-9")).resolves.toHaveLength(1);
  });

  it("snapshot throws PROTOCOL_ERROR on page exceptions", async () => {
    socket.routes.set("Runtime.evaluate", () => ({
      result: {},
      exceptionDetails: { text: "ReferenceError", exception: { description: "x is not defined" } },
    }));
    await expect(snapshot(client, "sess-9")).rejects.toMatchObject({ code: "PROTOCOL_ERROR" });
    socket.routes.set("Runtime.evaluate", smartRoute);
  });

  it("liveRect returns null for vanished elements", async () => {
    socket.routes.set("Runtime.evaluate", () => ({ result: { type: "object", value: { rect: null } } }));
    expect(await liveRect(client, "sess-9", 42)).toBeNull();
    socket.routes.set("Runtime.evaluate", smartRoute);
    const rect = await liveRect(client, "sess-9", 1);
    expect(rect?.width).toBe(70);
  });

  it("focusElement and selectOption return booleans", async () => {
    expect(await focusElement(client, "sess-9", 1)).toBe(true);
    expect(await selectOption(client, "sess-9", 1, "b")).toBe(true);
  });

  it("scrollIntoView completes", async () => {
    await scrollIntoView(client, "sess-9", 1);
  });
});

describe("CdpClient.discover", () => {
  it("parses the /json/version fixture via fetch", async () => {
    const fixture = {
      Browser: "Brave/1.0",
      "Protocol-Version": "1.3",
      webSocketDebuggerUrl: "ws://127.0.0.1:9222/devtools/browser/abc",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, json: async () => fixture })),
    );
    const { wsUrl, version } = await CdpClient.discover(9222);
    expect(wsUrl).toContain("ws://127.0.0.1:9222");
    expect(version.Browser).toBe("Brave/1.0");
    vi.unstubAllGlobals();
  });

  it("throws DISCOVER_FAILED when the endpoint is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("connection refused");
    }));
    await expect(CdpClient.discover(1)).rejects.toMatchObject({ code: "DISCOVER_FAILED" });
    vi.unstubAllGlobals();
  });
});

describe("adaptWsSocket", () => {
  it("delegates send/close/on handlers to the wrapped socket", () => {
    const sent: string[] = [];
    // Holder object: TS control-flow analysis cannot see assignments made from
    // inside the fake `on` callback for bare let-variables, so we capture
    // handlers on a mutable holder instead.
    const captured: {
      message: ((...args: unknown[]) => void) | null;
      close: ((...args: unknown[]) => void) | null;
      error: ((...args: unknown[]) => void) | null;
    } = { message: null, close: null, error: null };
    const fakeWs = {
      send: (data: string) => {
        sent.push(data);
      },
      close: (code?: number) => {
        void code;
      },
      on: (event: string, handler: (...args: unknown[]) => void) => {
        if (event === "message") {
          captured.message = handler;
        }
        if (event === "close") {
          captured.close = handler;
        }
        if (event === "error") {
          captured.error = handler;
        }
      },
    };
    const like = adaptWsSocket(fakeWs);
    like.send("frame");
    expect(sent).toEqual(["frame"]);
    let gotMessage = "";
    like.onMessage((data) => {
      gotMessage = data;
    });
    captured.message?.("payload");
    expect(gotMessage).toBe("payload");
    let closed = false;
    like.onClose(() => {
      closed = true;
    });
    like.close(1000);
    captured.close?.();
    expect(closed).toBe(true);
    let lastError = "";
    like.onError((err) => {
      lastError = err.message;
    });
    captured.error?.(new Error("boom"));
    expect(lastError).toBe("boom");
  });
});
