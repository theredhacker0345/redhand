/**
 * redhand-bridge background service worker (MV3).
 *
 * The missing piece that lets redhand drive the user's RUNNING browser:
 * - holds the `debugger` permission and relays chrome.debugger commands
 *   over a localhost WebSocket loopback to the redhand server
 * - no debug-port relaunch, no native messaging, no per-OS registration
 * - pairing token gates the loopback; the server binds 127.0.0.1 only
 *
 * Wire protocol (JSON frames over the loopback WS) — must match BridgeHub:
 *   hub → extension:
 *     {op:"ping"}                              → {op:"pong"}
 *     {op:"tabsReq", reqId}                    → {op:"tabsRes", reqId, tabs}
 *     {op:"ext-attach", reqId, tabId}          → {op:"ext-attached"|"ext-attach-error", reqId, tabId, message?}
 *     {op:"ext-detach", reqId, tabId}          → {op:"ext-detached", reqId, tabId}
 *     {op:"ext-cdp", reqId, tabId, method, params} → {op:"ext-cdp-res"|"ext-cdp-err", reqId, result?|message?}
 *   extension → hub:
 *     {op:"event", tabId, method, params}      → chrome.debugger.onEvent relay
 */

interface HubMessage {
  op: string;
  reqId?: string;
  tabId?: number;
  method?: string;
  params?: Record<string, unknown>;
}

interface DebugTarget {
  tabId: number;
}

let ws: WebSocket | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function post(message: object): void {
  if (ws !== null && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

async function debuggerAttach(target: DebugTarget): Promise<void> {
  await chrome.debugger.attach(target as chrome.debugger.TargetInfo, "1.3");
}

async function debuggerDetach(target: DebugTarget): Promise<void> {
  await chrome.debugger.detach(target as chrome.debugger.TargetInfo);
}

async function debuggerSend(target: DebugTarget, method: string, params?: object): Promise<unknown> {
  return chrome.debugger.sendCommand(target as chrome.debugger.TargetInfo, method, params ?? {});
}

async function handleHubMessage(msg: HubMessage): Promise<void> {
  switch (msg.op) {
    case "ping": {
      post({ op: "pong" });
      return;
    }
    case "tabsReq": {
      const tabs = await chrome.tabs.query({});
      post({
        op: "tabsRes",
        reqId: msg.reqId,
        tabs: tabs.map((t) => ({
          targetId: String(t.id),
          title: t.title ?? "",
          url: t.url ?? "",
          active: t.active ?? false,
        })),
      });
      return;
    }
    case "ext-attach": {
      if (typeof msg.tabId !== "number") return;
      try {
        await debuggerAttach({ tabId: msg.tabId });
        post({ op: "ext-attached", reqId: msg.reqId, tabId: msg.tabId });
      } catch (err) {
        post({ op: "ext-attach-error", reqId: msg.reqId, tabId: msg.tabId, message: String(err) });
      }
      return;
    }
    case "ext-detach": {
      if (typeof msg.tabId !== "number") return;
      try {
        await debuggerDetach({ tabId: msg.tabId });
        post({ op: "ext-detached", reqId: msg.reqId, tabId: msg.tabId });
      } catch (err) {
        post({ op: "ext-detach-error", reqId: msg.reqId, tabId: msg.tabId, message: String(err) });
      }
      return;
    }
    case "ext-cdp": {
      if (typeof msg.tabId !== "number" || typeof msg.method !== "string") return;
      try {
        const result = await debuggerSend({ tabId: msg.tabId }, msg.method, msg.params);
        post({ op: "ext-cdp-res", reqId: msg.reqId, result: result ?? null });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        post({ op: "ext-cdp-err", reqId: msg.reqId, message });
      }
      return;
    }
    default:
      return;
  }
}

chrome.debugger.onEvent.addListener((source, method, params) => {
  if (typeof source.tabId === "number") {
    post({ op: "event", tabId: source.tabId, method, params: params ?? {} });
  }
});

chrome.debugger.onDetach.addListener((source) => {
  if (typeof source.tabId === "number") {
    post({ op: "browser-detached", tabId: source.tabId });
  }
});

/** Hub URL: loopback + pairing token from chrome.storage (set via the popup). */
async function hubUrl(): Promise<string> {
  const stored = await chrome.storage.local.get(["hubToken"]);
  const token = typeof stored.hubToken === "string" ? encodeURIComponent(stored.hubToken) : "";
  return `ws://127.0.0.1:9223/?role=extension&token=${token}`;
}

async function connectLoop(): Promise<void> {
  const socket = new WebSocket(await hubUrl());
  ws = socket;
  socket.onopen = () => {
    post({ op: "hello-ack", version: 1 });
    startPing();
  };
  socket.onmessage = (ev) => {
    try {
      const msg = JSON.parse(String(ev.data)) as HubMessage;
      void handleHubMessage(msg);
    } catch {
      // non-JSON frame — drop
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

function startPing(): void {
  if (pingTimer !== null) return;
  pingTimer = setInterval(() => post({ op: "ping" }), 20_000);
}

function stopPing(): void {
  if (pingTimer !== null) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
}

function scheduleReconnect(): void {
  if (reconnectTimer !== null || ws !== null) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void connectLoop();
  }, 3000);
}

// A freshly saved pairing token takes effect immediately.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes["hubToken"]) {
    if (ws !== null) {
      ws.close();
    } else {
      void connectLoop();
    }
  }
});

void connectLoop();
