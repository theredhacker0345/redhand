import { beforeAll, describe, expect, it } from "vitest";
import { CdpClient } from "@redhand/core";
import type { SocketLike } from "@redhand/core";
import { BrowserSession } from "./session.js";
import { toolDefinitions } from "./tools.js";

/** Fixture-driven socket covering every CDP method the tools touch. */
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

describe("tool handlers (fixture-driven session)", () => {
  let socket: RoutingSocket;
  let session: BrowserSession;

  beforeAll(async () => {
    socket = new RoutingSocket();
    socket.routes.set("Target.getTargets", () => ({
      targetInfos: [{ targetId: "tab-1", type: "page", title: "T", url: "https://t.local", attached: false }],
    }));
    socket.routes.set("Target.attachToTarget", () => ({ sessionId: "sess-1" }));
    socket.routes.set("Target.detachFromTarget", () => ({}));
    socket.routes.set("Page.addScriptToEvaluateOnNewDocument", () => ({}));
    socket.routes.set("Page.captureScreenshot", () => ({ data: "c2hvdA==" }));
    socket.routes.set("Input.insertText", () => ({}));
    socket.routes.set("Input.dispatchMouseEvent", () => ({}));
    socket.routes.set("Input.dispatchKeyEvent", () => ({}));
    socket.routes.set("Runtime.evaluate", (params) => {
      const expression = (params as { expression: string }).expression;
      if (expression.includes("__redhand.snapshot")) {
        return {
          result: {
            type: "object",
            value: [
              { index: 1, tag: "button", text: "Go", rect: { x: 10, y: 20, width: 80, height: 28 } },
              { index: 2, tag: "select", rect: { x: 10, y: 60, width: 140, height: 26 } },
            ],
          },
        };
      }
      if (expression.includes("liveRect")) {
        return { result: { type: "object", value: { rect: { x: 10, y: 20, width: 80, height: 28 } } } };
      }
      if (expression.includes("focus") || expression.includes("selectOption")) {
        return { result: { type: "object", value: { ok: true } } };
      }
      if (expression.includes("scrollIntoView")) {
        return { result: { type: "object", value: { done: true } } };
      }
      if (expression.includes("MutationObserver")) {
        return { result: { type: "boolean", value: true } };
      }
      if (expression.includes("JSON.stringify")) {
        return { result: { type: "string", value: '{"ok":true}' } };
      }
      return { result: { type: "string", value: "evaluated" } };
    });
    session = BrowserSession.fromClient(CdpClient.fromSocket(socket));
    await session.attachToTab("tab-1");
    await session.snapshot();
  });

  it("runs every tool handler without throwing and yields content", async () => {
    const inputs: Record<string, Record<string, unknown>> = {
      browser_click: { index: 1, humanize: "fast" },
      browser_type: { index: 1, text: "quick", humanize: "fast" },
      browser_press: { key: "enter" },
      browser_scroll: { direction: "down", amount: 2 },
      browser_select: { index: 2, value: "b" },
      browser_hover: { index: 1, humanize: "fast" },
      browser_evaluate: { expression: "JSON.stringify({ok:true})" },
      browser_screenshot: {},
      browser_wait_settled: {},
      browser_network: {},
      browser_tabs: {},
      browser_snapshot: {},
      browser_switch_tab: { targetId: "tab-1" },
    };
    for (const tool of toolDefinitions()) {
      const input = inputs[tool.name];
      const content = await tool.run(session, input ?? {});
      expect(content.length).toBeGreaterThan(0);
    }
  });

  it("click with a vanished index reports a typed NOT_ATTACHED error", async () => {
    socket.routes.set("Runtime.evaluate", (params) => {
      const expression = (params as { expression: string }).expression;
      if (expression.includes("__redhand.snapshot")) {
        return { result: { type: "object", value: [] } };
      }
      if (expression.includes("scrollIntoView")) {
        return { result: { type: "object", value: { done: true } } };
      }
      return { result: { type: "object", value: { rect: null } } };
    });
    const clickTool = toolDefinitions().find((t) => t.name === "browser_click");
    expect(clickTool).toBeDefined();
    await expect(clickTool?.run(session, { index: 9 })).rejects.toMatchObject({ code: "NOT_ATTACHED" });
  });

  it("ghost mode types with cadence (multiple trusted insert calls)", async () => {
    socket.routes.set("Runtime.evaluate", (params) => {
      const expression = (params as { expression: string }).expression;
      if (expression.includes("__redhand.snapshot")) {
        return {
          result: {
            type: "object",
            value: [{ index: 1, tag: "input", rect: { x: 10, y: 20, width: 80, height: 28 } }],
          },
        };
      }
      if (expression.includes("liveRect")) {
        return { result: { type: "object", value: { rect: { x: 10, y: 20, width: 80, height: 28 } } } };
      }
      if (expression.includes("focus")) {
        return { result: { type: "object", value: { ok: true } } };
      }
      if (expression.includes("scrollIntoView")) {
        return { result: { type: "object", value: { done: true } } };
      }
      return { result: { type: "undefined" } };
    });
    const before = socket.sent.filter((f) => f["method"] === "Input.insertText").length;
    const typeTool = toolDefinitions().find((t) => t.name === "browser_type");
    await typeTool?.run(session, { index: 1, text: "abc", humanize: "ghost" });
    const after = socket.sent.filter((f) => f["method"] === "Input.insertText").length;
    expect(after - before).toBeGreaterThanOrEqual(3);
  });
});
