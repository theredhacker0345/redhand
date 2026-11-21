/**
 * redhand-bridge background service worker.
 * Relays chrome.debugger commands/events over a WebSocket loopback to the
 * local redhand server. No native messaging, no per-OS host registration.
 * Protocol: {op:"hello"|"attach"|"cmd"|"detach", ...} inbound; {op:"cmdres"|"event"|"attached"...} outbound.
 */

const DEFAULT_WS_URL = "ws://127.0.0.1:8765";
const RECONNECT_MS = 4000;
const PING_INTERVAL_MS = 20_000;

let ws: WebSocket | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

interface InboundMessage {
  op: "attach" | "detach" | "cmd" | "ping";
  tabId?: number;
  reqId?: string;
  method?: string;
  params?: object;
}

function post(message: object): void {
  if (ws !== null && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

async function handleOp(msg: InboundMessage): Promise<void> {
  switch (msg.op) {
    case "ping": {
      post({ op: "pong" });
      return;
    }
    case "attach": {
      if (typeof msg.tabId !== "number") {
        return;
      }
      try {
        await chrome.debugger.attach({ tabId: msg.tabId }, "1.3");
        post({ op: "attached", tabId: msg.tabId });
      } catch (err) {
        post({ op: "attach-error", tabId: msg.tabId, error: String(err) });
      }
      return;
    }
    case "detach": {
      if (typeof msg.tabId !== "number") {
        return;
      }
      await chrome.debugger.detach({ tabId: msg.tabId }).catch(() => undefined);
      post({ op: "detached", tabId: msg.tabId });
      return;
    }
    case "cmd": {
      if (typeof msg.tabId !== "number" || typeof msg.method !== "string") {
        return;
      }
      try {
        const result = await chrome.debugger.sendCommand({ tabId: msg.tabId }, msg.method, msg.params ?? {});
        post({ op: "cmdres", reqId: msg.reqId, ok: true, result });
      } catch (err) {
        post({ op: "cmdres", reqId: msg.reqId, ok: false, error: String(err) });
      }
      return;
    }
    default:
      return;
  }
}

function startPing(): void {
  if (pingTimer !== null) {
    return;
  }
  pingTimer = setInterval(() => post({ op: "ping" }), PING_INTERVAL_MS);
}

function stopPing(): void {
  if (pingTimer !== null) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
}

async function connectLoop(): Promise<void> {
  const stored = await chrome.storage.local.get(["token", "wsUrl"]);
  const token = typeof stored["token"] === "string" ? stored["token"] : "";
  if (token === "") {
    scheduleReconnect();
    return;
  }
  const wsUrl = typeof stored["wsUrl"] === "string" && stored["wsUrl"] !== "" ? stored["wsUrl"] : DEFAULT_WS_URL;
  const socket = new WebSocket(`${wsUrl}?token=${encodeURIComponent(token)}`);
  ws = socket;
  socket.onopen = () => {
    post({ op: "hello", version: 1 });
    startPing();
  };
  socket.onmessage = (ev) => {
    try {
      const msg = JSON.parse(String(ev.data)) as InboundMessage;
      void handleOp(msg);
    } catch {
      // Non-JSON frame from the local server — drop, stay connected.
    }
  };
  socket.onclose = () => {
    ws = null;
    stopPing();
    scheduleReconnect();
  };
  socket.onerror = () => {
    socket.close();
  };
}

function scheduleReconnect(): void {
  if (reconnectTimer !== null || ws !== null) {
    return;
  }
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void connectLoop();
  }, RECONNECT_MS);
}

chrome.debugger.onEvent.addListener((source, method, params) => {
  if (typeof source.tabId === "number") {
    post({ op: "event", tabId: source.tabId, method, params });
  }
});

chrome.debugger.onDetach.addListener((source) => {
  if (typeof source.tabId === "number") {
    post({ op: "browser-detached", tabId: source.tabId });
  }
});

chrome.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse) => {
  const parsed = msg as { op?: string };
  if (parsed?.op === "popup-attach") {
    const tabId = (msg as { tabId?: number }).tabId;
    if (typeof tabId === "number") {
      void handleOp({ op: "attach", tabId }).then(() => sendResponse({ ok: true }));
      return true;
    }
  }
  if (parsed?.op === "popup-detach") {
    const tabId = (msg as { tabId?: number }).tabId;
    if (typeof tabId === "number") {
      void handleOp({ op: "detach", tabId }).then(() => sendResponse({ ok: true }));
      return true;
    }
  }
  return false;
});

void connectLoop();
