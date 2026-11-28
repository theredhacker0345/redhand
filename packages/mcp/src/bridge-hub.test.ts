import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { WebSocket } from "ws";
import { CdpClient } from "@redhand/core";
import { BridgeHub } from "./bridge-hub.js";

/**
 * Relay tests: a real BridgeHub on an ephemeral loopback port, a fake
 * extension peer, and a real CdpClient as the agent. No browser needed —
 * the fake extension scripts the chrome.debugger side with fixture data,
 * proving the full translation chain end-to-end.
 */

let hub: BridgeHub;
let port = 0;
const FIXTURE_TABS = [
  { targetId: "101", title: "Huntr — bug bounties", url: "https://huntr.com/challenges", active: true },
  { targetId: "202", title: "GitHub", url: "https://github.com", active: false },
];
/** Fake extension peer: relays hub ops like the real MV3 worker would. */
class FakeExtension {
  socket: WebSocket;
  private openPromise: Promise<void>;
  private handler: ((msg: Record<string, unknown>) => void) | null = null;

  constructor(url: string) {
    this.socket = new WebSocket(url);
    this.openPromise = new Promise((resolve, reject) => {
      this.socket.once("open", () => resolve());
      this.socket.once("error", reject);
    });
    this.socket.on("message", (data) => {
      const msg = JSON.parse(String(data)) as Record<string, unknown>;
      this.handler?.(msg);
    });
  }

  send(msg: object): void {
    this.socket.send(JSON.stringify(msg));
  }

  /** Route hub ops to fixture behavior. */
  setHandler(handler: (msg: Record<string, unknown>) => void): void {
    this.handler = handler;
  }

  async waitOpen(): Promise<void> {
    await this.openPromise;
  }

  close(): void {
    this.socket.close();
  }
}

let ext: FakeExtension;

beforeAll(async () => {
  hub = new BridgeHub({ port: 0, token: "test-token" });
  await hub.start();
  const url = hub.extensionUrl;
  port = Number(url.match(/:(\d+)/)?.[1] ?? 0);
  expect(port).toBeGreaterThan(0);
  ext = new FakeExtension(`${hub.extensionUrl}&fixture=1`);
  await ext.waitOpen();
});

beforeEach(() => {
  // Default routing used by the tests that exercise tabs/cdp flows.
  ext.setHandler((msg) => {
    if (msg["op"] === "tabsReq") {
      ext.send({
        op: "tabsRes",
        reqId: msg["reqId"],
        tabs: FIXTURE_TABS.map((t) => ({ ...t })),
      });
    }
    if (msg["op"] === "ext-cdp") {
      ext.send({ op: "ext-cdp-res", reqId: msg["reqId"], result: { called: msg["method"] } });
    }
  });
});

afterEach(() => {
  ext.setHandler(() => {});
});

afterAll(() => {
  ext.close();
  hub.close();
});

describe("BridgeHub relay", () => {
  it("rejects connections with a bad token", async () => {
    const bad = new WebSocket(`ws://127.0.0.1:${port}/?role=extension&token=WRONG`);
    // verifyClient rejection aborts the HTTP upgrade (401), so the client
    // surfaces "unexpected-response", never a WebSocket close frame.
    const rejected = new Promise<void>((resolve) => {
      bad.once("unexpected-response", () => resolve());
      bad.once("error", () => resolve());
    });
    await rejected;
    expect(bad.readyState).not.toBe(WebSocket.OPEN);
    bad.terminate();
  });

  it("relays Target.getTargets → tabsRes as typed targetInfos", async () => {
    const agent = await CdpClient.connect(`ws://127.0.0.1:${port}/?role=agent&token=test-token`);
    const targets = await agent.getTargets();
    expect(targets.length).toBe(2);
    expect(targets[0]?.targetId).toBe("101");
    expect(targets[0]?.title).toBe("Huntr — bug bounties");
    agent.close();
  });

  it("relays session-scoped commands to the extension and back", async () => {
    const agent = await CdpClient.connect(`ws://127.0.0.1:${port}/?role=agent&token=test-token`);
    const resultSchema = z.object({ called: z.string() });
    const result = await agent.send("Page.enable", {}, { sessionId: "101", schema: resultSchema });
    expect(result.called).toBe("Page.enable");
    agent.close();
  });

  it("routes chrome.debugger events to the agent socket with mapped sessionId", async () => {
    const seen: Array<object> = [];
    const off = hub.onEvent((frame) => seen.push(frame));
    // Simulate the extension feeding a browser event through the socket.
    ext.send({ op: "event", tabId: 101, method: "Page.frameStartedLoading", params: { frameId: "f1" } });
    await new Promise((r) => setTimeout(r, 200));
    off();
    expect(seen.length).toBeGreaterThan(0);
  });

  it("relays Target.attachToTarget → ext-attached as a sessionId reply", async () => {
    const agent = await CdpClient.connect(`${hub.agentUrl}`);
    ext.setHandler((msg) => {
      if (msg["op"] === "ext-attach") ext.send({ op: "ext-attached", reqId: msg["reqId"], tabId: msg["tabId"] });
    });
    const attachSchema = z.object({ sessionId: z.string() });
    const result = await agent.send("Target.attachToTarget", { targetId: "101" }, { schema: attachSchema });
    expect(result.sessionId).toBe("101");
    agent.close();
  });

  it("relays Target.attachToTarget errors from the extension to the agent", async () => {
    const agent = await CdpClient.connect(`${hub.agentUrl}`);
    ext.setHandler((msg) => {
      if (msg["op"] === "ext-attach") {
        ext.send({ op: "ext-attach-error", reqId: msg["reqId"], tabId: msg["tabId"], message: "Cannot attach to this target" });
      }
    });
    await expect(
      agent.send("Target.attachToTarget", { targetId: "999" }),
    ).rejects.toThrow("Cannot attach to this target");
    agent.close();
  });

  it("relays Target.detachFromTarget and resolves the agent reply", async () => {
    const agent = await CdpClient.connect(`${hub.agentUrl}`);
    ext.setHandler((msg) => {
      if (msg["op"] === "ext-detach") ext.send({ op: "ext-detached", reqId: msg["reqId"], tabId: msg["tabId"] });
    });
    await expect(
      agent.send("Target.detachFromTarget", { sessionId: "101" }),
    ).resolves.toBeDefined();
    agent.close();
  });

  it("surfaces extension CDP errors as agent JSON-RPC errors", async () => {
    const agent = await CdpClient.connect(`${hub.agentUrl}`);
    ext.setHandler((msg) => {
      if (msg["op"] === "ext-cdp") {
        ext.send({ op: "ext-cdp-err", reqId: msg["reqId"], message: "No node with the given id" });
      }
    });
    await expect(agent.send("DOM.resolveNode", { nodeId: 42 }, { sessionId: "101" })).rejects.toThrow(
      "No node with the given id",
    );
    agent.close();
  });

  it("rejects browser-level methods that cannot cross the bridge", async () => {
    const agent = await CdpClient.connect(`${hub.agentUrl}`);
    await expect(agent.send("Browser.getVersion")).rejects.toThrow("not supported over the bridge");
    agent.close();
  });

  it("ignores garbage frames from either side without crashing", async () => {
    ext.send("this is not json" as unknown as object);
    ext.send({ unknownOp: true });
    await new Promise((r) => setTimeout(r, 100));
    // hub is still alive: a follow-up tabs query still works
    const agent = await CdpClient.connect(`${hub.agentUrl}`);
    const targets = await agent.getTargets();
    expect(targets.length).toBe(2);
    agent.close();
  });

  it("replaces a reconnected extension peer", async () => {
    expect(hub.extensionConnected).toBe(true);
    const second = new FakeExtension(`${hub.extensionUrl}&fixture=2`);
    await second.waitOpen();
    // the first socket should have been closed with 4000 "replaced"
    await new Promise((r) => setTimeout(r, 200));
    expect(ext.socket.readyState).not.toBe(WebSocket.OPEN);
    // the new peer answers queries
    second.setHandler((msg) => {
      if (msg["op"] === "tabsReq") {
        second.send({ op: "tabsRes", reqId: msg["reqId"], tabs: FIXTURE_TABS.map((t) => ({ ...t })) });
      }
    });
    const agent = await CdpClient.connect(`${hub.agentUrl}`);
    const targets = await agent.getTargets();
    expect(targets.length).toBe(2);
    agent.close();
    ext = second;
  });
});
