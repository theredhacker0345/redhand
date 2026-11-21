import { CdpClient } from "./cdp-client.js";
import type { SocketLike } from "./socket.js";
import { z } from "zod";
import { describe, expect, it } from "vitest";

/** Deterministic in-memory socket — unit tests feed fixture JSON, never a real socket. */
class FakeSocket implements SocketLike {
  readonly sent: string[] = [];
  private messageHandler: ((data: string) => void) | null = null;
  private closeHandler: (() => void) | null = null;
  private autoReply: ((sentFrame: Record<string, unknown>) => string | null) | null = null;

  setAutoReply(fn: (sentFrame: Record<string, unknown>) => string | null): void {
    this.autoReply = fn;
  }

  send(data: string): void {
    this.sent.push(data);
    const frame = JSON.parse(data) as Record<string, unknown>;
    const reply = this.autoReply?.(frame);
    if (reply !== null && reply !== undefined) {
      this.messageHandler?.(reply);
    }
  }

  close(): void {
    this.closeHandler?.();
  }

  onMessage(handler: (data: string) => void): void {
    this.messageHandler = handler;
  }

  onClose(handler: () => void): void {
    this.closeHandler = handler;
  }

  onError(_handler: (err: Error) => void): void {
    // fixture socket never errors
  }

  /** Push an inbound CDP frame (fixture JSON). */
  inbound(fixture: object): void {
    this.messageHandler?.(JSON.stringify(fixture));
  }
}

const echoReply: (frame: Record<string, unknown>) => string = (frame) =>
  JSON.stringify({ id: frame["id"], result: { echo: frame["method"] } });

describe("CdpClient", () => {
  it("correlates responses to commands by id", async () => {
    const socket = new FakeSocket();
    socket.setAutoReply(echoReply);
    const client = CdpClient.fromSocket(socket);
    const result = await client.send<{ echo: string }>("Page.navigate", { url: "https://example.com" });
    expect(result.echo).toBe("Page.navigate");
    const frame = JSON.parse(socket.sent[0] as string) as { id: number; method: string; params: object };
    expect(frame.method).toBe("Page.navigate");
    expect(frame.params).toEqual({ url: "https://example.com" });
    expect(frame.id).toBeTypeOf("number");
  });

  it("applies zod schema validation to results", async () => {
    const socket = new FakeSocket();
    socket.setAutoReply(() => JSON.stringify({ id: 1, result: { sessionId: "abc" } }));
    const client = CdpClient.fromSocket(socket);
    const result = await client.send("Target.attachToTarget", { targetId: "t1" }, {
      schema: z.object({ sessionId: z.string() }),
    });
    expect(result.sessionId).toBe("abc");
  });

  it("rejects with VALIDATION when the result does not match the schema", async () => {
    const socket = new FakeSocket();
    socket.setAutoReply(() => JSON.stringify({ id: 1, result: { wrong: true } }));
    const client = CdpClient.fromSocket(socket);
    await expect(
      client.send("Target.attachToTarget", {}, { schema: z.object({ sessionId: z.string() }) }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("surfaces CDP error responses as CDP_ERROR", async () => {
    const socket = new FakeSocket();
    socket.setAutoReply((frame) => JSON.stringify({ id: frame["id"], error: { code: -32601, message: "not found" } }));
    const client = CdpClient.fromSocket(socket);
    await expect(client.send("No.SuchMethod")).rejects.toMatchObject({ code: "CDP_ERROR", message: "not found" });
  });

  it("times out when no response arrives", async () => {
    const socket = new FakeSocket();
    const client = CdpClient.fromSocket(socket, { requestTimeoutMs: 30 });
    await expect(client.send("Slow.Method")).rejects.toMatchObject({ code: "TIMEOUT" });
  });

  it("dispatches events to session-scoped and global handlers", async () => {
    const socket = new FakeSocket();
    const client = CdpClient.fromSocket(socket);
    const seenGlobal: string[] = [];
    const seenS1: string[] = [];
    client.on("Page.loadEventFired", (_p, sessionId) => {
      seenGlobal.push(sessionId ?? "global");
    });
    client.on("Page.loadEventFired", () => seenS1.push("s1"), "s1");
    socket.inbound({ method: "Page.loadEventFired", params: {}, sessionId: "s1" });
    socket.inbound({ method: "Page.loadEventFired", params: {}, sessionId: "s2" });
    expect(seenGlobal).toEqual(["s1", "s2"]);
    expect(seenS1).toEqual(["s1"]);
  });

  it("rejects all pending calls when the socket closes", async () => {
    const socket = new FakeSocket();
    const client = CdpClient.fromSocket(socket);
    const promise = client.send("Runtime.evaluate");
    socket.close();
    await expect(promise).rejects.toMatchObject({ code: "SOCKET_CLOSED" });
  });

  it("drops malformed inbound frames without breaking the client", async () => {
    const socket = new FakeSocket();
    socket.setAutoReply(echoReply);
    const client = CdpClient.fromSocket(socket);
    socket.inbound({ method: "Not.Json.Breaks/{[" });
    const result = await client.send<{ echo: string }>("Test.Method");
    expect(result.echo).toBe("Test.Method");
  });

  it("unsubscribe stops event delivery", async () => {
    const socket = new FakeSocket();
    const client = CdpClient.fromSocket(socket);
    const seen: string[] = [];
    const off = client.on("Some.Event", () => seen.push("hit"));
    off();
    socket.inbound({ method: "Some.Event", params: {} });
    expect(seen).toEqual([]);
  });

  it("getTargets validates and returns target infos", async () => {
    const socket = new FakeSocket();
    socket.setAutoReply((frame) =>
      JSON.stringify({
        id: frame["id"],
        result: {
          targetInfos: [
            { targetId: "t1", type: "page", title: "Inbox", url: "https://mail.example.com", attached: false },
            { targetId: "t2", type: "service_worker", url: "sw.js" },
          ],
        },
      }),
    );
    const client = CdpClient.fromSocket(socket);
    const targets = await client.getTargets();
    expect(targets).toHaveLength(2);
    expect(targets[0]?.title).toBe("Inbox");
  });
});
