import { beforeAll, describe, expect, it } from "vitest";
import { CdpClient } from "@redhand/core";
import type { SocketLike } from "@redhand/core";
import { BrowserSession } from "./session.js";
import { toolDefinitions } from "./tools.js";

/** Fixture-driven socket: routes CDP methods to canned results (no real socket). */
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

  /** Push an inbound CDP event frame. */
  emit(method: string, params: object, sessionId?: string): void {
    this.handler?.(JSON.stringify({ method, params, sessionId }));
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

describe("BrowserSession (fixture-driven)", () => {
  let socket: RoutingSocket;

  beforeAll(() => {
    socket = new RoutingSocket();
    socket.routes.set("Target.getTargets", () => ({
      targetInfos: [
        { targetId: "tab-1", type: "page", title: "Test Page", url: "https://test.local", attached: false },
        { targetId: "tab-2", type: "page", title: "Other Tab", url: "https://other.local", attached: false },
      ],
    }));
    socket.routes.set("Target.attachToTarget", () => ({ sessionId: "sess-1" }));
    socket.routes.set("Target.createTarget", () => ({ targetId: "tab-3" }));
    socket.routes.set("Page.navigate", () => ({}));
    socket.routes.set("Page.addScriptToEvaluateOnNewDocument", () => ({}));
    socket.routes.set("Runtime.evaluate", (params) => {
      const expression = (params as { expression: string }).expression;
      if (expression.includes("__redhand.snapshot")) {
        return {
          result: {
            type: "object",
            value: [
              { index: 1, tag: "button", text: "Sign in", rect: { x: 10, y: 20, width: 90, height: 30 } },
              { index: 2, tag: "input", placeholder: "you@example.com", rect: { x: 10, y: 70, width: 220, height: 28 } },
            ],
          },
        };
      }
      if (expression.includes("liveRect")) {
        return { result: { type: "object", value: { rect: { x: 10, y: 70, width: 220, height: 28 } } } };
      }
      if (expression.includes("focus")) {
        return { result: { type: "object", value: { ok: true } } };
      }
      if (expression.includes("scrollIntoView")) {
        return { result: { type: "object", value: { done: true } } };
      }
      return { result: { type: "undefined" } };
    });
    socket.routes.set("Input.insertText", () => ({}));
    socket.routes.set("Input.dispatchMouseEvent", () => ({}));
    socket.routes.set("Input.dispatchKeyEvent", () => ({}));
    socket.routes.set("Page.captureScreenshot", () => ({ data: "aGVsbG8=" }));
  });

  it("attaches, installs the executor and snapshots through the CDP fixture", async () => {
    const session = BrowserSession.fromClient(CdpClient.fromSocket(socket));
    await session.attachToTab("tab-1");
    const snap = await session.snapshot();
    expect(snap.elements).toHaveLength(2);
    expect(snap.rendered).toContain("Sign in");
    expect(snap.diff?.added.length ?? 0).toBe(2);
  });

  it("captures Network.requestWillBeSent events into the buffer", async () => {
    const session = BrowserSession.fromClient(CdpClient.fromSocket(socket));
    await session.attachToTab("tab-1");
    socket.emit(
      "Network.requestWillBeSent",
      { requestId: "r9", request: { url: "https://api.test.local/v1/login", method: "POST" } },
      "sess-1",
    );
    const entries = session.network();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.url).toBe("https://api.test.local/v1/login");
  });

  it("types via trusted insertText in natural mode", async () => {
    const session = BrowserSession.fromClient(CdpClient.fromSocket(socket));
    await session.attachToTab("tab-1");
    await session.snapshot();
    const result = await session.type(2, "hello@example.com", "natural");
    expect(result.chars).toBe("hello@example.com".length);
    const insertCalls = socket.sent.filter(
      (f) => f["method"] === "Input.insertText" && (f["params"] as { text: string }).text === "hello@example.com",
    );
    expect(insertCalls).toHaveLength(1);
  });

  it("presses keys through the Input domain with mapped virtual key codes", async () => {
    const session = BrowserSession.fromClient(CdpClient.fromSocket(socket));
    await session.attachToTab("tab-1");
    await session.pressKey("enter");
    const keyFrames = socket.sent.filter((f) => f["method"] === "Input.dispatchKeyEvent");
    expect(keyFrames.length).toBe(2);
    const down = keyFrames[0]?.["params"] as { key: string; windowsVirtualKeyCode: number };
    expect(down.key).toBe("Enter");
    expect(down.windowsVirtualKeyCode).toBe(13);
  });

  it("screenshot returns the base64 payload", async () => {
    const session = BrowserSession.fromClient(CdpClient.fromSocket(socket));
    await session.attachToTab("tab-1");
    const data = await session.screenshot();
    expect(data).toBe("aGVsbG8=");
  });

  it("rejects unknown keys with a typed error", async () => {
    const session = BrowserSession.fromClient(CdpClient.fromSocket(socket));
    await session.attachToTab("tab-1");
    await expect(session.pressKey("meta")).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("navigate + createTab wire through CDP and re-install the executor", async () => {
    const session = BrowserSession.fromClient(CdpClient.fromSocket(socket));
    await session.attachToTab("tab-1");
    await session.navigate("https://test.local/page2");
    const navFrames = socket.sent.filter((f) => f["method"] === "Page.navigate");
    expect(navFrames).toHaveLength(1);
    expect((navFrames[0]?.["params"] as { url: string }).url).toBe("https://test.local/page2");
    const tab = await session.createTab("https://test.local/new");
    expect(tab.targetId).toBe("tab-3");
    const createFrames = socket.sent.filter((f) => f["method"] === "Target.createTarget");
    expect((createFrames[0]?.["params"] as { url: string }).url).toBe("https://test.local/new");
  });

  it("broadcastToast attaches other tabs and evaluates a visibility-gated toast", async () => {
    const session = BrowserSession.fromClient(CdpClient.fromSocket(socket));
    await session.attachToTab("tab-1");
    socket.sent.length = 0;
    await session.broadcastToast("working in another tab: Test Page");
    const evals = socket.sent.filter((f) => f["method"] === "Runtime.evaluate");
    expect(evals.length).toBeGreaterThanOrEqual(1);
    const expression = (evals[0]?.["params"] as { expression: string }).expression;
    expect(expression).toContain("visibilityState");
    expect(expression).toContain("redhand-tab-toast");
    expect(expression).toContain("working in another tab: Test Page");
    // primary tab is never toasted
    const sessionIds = evals.map((f) => f["sessionId"]);
    expect(sessionIds.every((s) => s !== "sess-1" || evals.length === 1)).toBe(true);
  });
});

describe("toolDefinitions", () => {
  it("exposes uniquely-named tools with descriptions and zod input schemas", () => {
    const tools = toolDefinitions();
    const names = tools.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const tool of tools) {
      expect(tool.description.length).toBeGreaterThan(10);
      expect(tool.inputSchema).toBeTypeOf("object");
    }
  });

  it("includes the state-after and recon tools", () => {
    const names = toolDefinitions().map((t) => t.name);
    expect(names).toContain("browser_snapshot");
    expect(names).toContain("browser_click");
    expect(names).toContain("browser_network");
    expect(names).toContain("browser_evaluate");
    expect(names).toContain("browser_switch_tab");
  });
});
