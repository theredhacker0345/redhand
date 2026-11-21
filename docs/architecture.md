# Architecture

## Layers

```
┌────────────────────────────────────────────────────────────────┐
│ AI agent (Claude / Cursor / ZCode / any MCP client / script)   │
└───────────────┬────────────────────────────────────────────────┘
                │ MCP — stdio (v1) / streamable HTTP (phase 2)
┌───────────────▼────────────────────────────────────────────────┐
│ @redhand/mcp — tool definitions + BrowserSession               │
│   13 tools: snapshot · click · type · press · scroll · select  │
│   hover · evaluate · screenshot · wait_settled · network       │
│   tabs · switch_tab                                            │
│   Every action returns state-after (snapshot diff + network)   │
├────────────────────────────────────────────────────────────────┤
│ @redhand/humanize — input dynamics                             │
│   Bezier curves · Fitts durations · dwell · overshoot-correct  │
│   cadence typing (bursts, word pauses, typo-and-correct)       │
│   seeded Rng — deterministic in tests, entropic in prod        │
├────────────────────────────────────────────────────────────────┤
│ @redhand/core — CDP client + index layer                       │
│   thin WebSocket client (id-correlated, session-scoped)        │
│   element index orchestration + zod boundaries                 │
├────────────────────────────────────────────────────────────────┤
│ Chrome DevTools Protocol (WebSocket)                           │
│   Input.dispatch* (trusted events) · Runtime.evaluate          │
│   Page.* · Network.* · Target.attachToTarget(flatten)          │
└───────────────┬────────────────────────────────────────────────┘
┌───────────────▼────────────────────────────────────────────────┐
│ @redhand/executor — injected per document                      │
│   data-redhand-id annotation · clickability heuristics         │
│   overlap pruning (≥0.8) · viewport filter · rect collection   │
│   focus/scroll/select helpers · zero dependencies              │
└────────────────────────────────────────────────────────────────┘
```

## Attach modes

1. **Bridge (default)** — `bridge/` MV3 extension holds the `debugger` permission and relays `chrome.debugger` ⇄ WebSocket loopback. Attaches to an **already-running** browser with zero relaunch. Pairing token in the popup; server-side ping/pong keeps the MV3 service worker alive.
2. **Debug-port attach** — browser launched with `--remote-debugging-port` → `CdpClient.discover(port)` → `connect(webSocketDebuggerUrl)`.
3. **Launcher** — `redhand setup` writes a desktop shortcut that starts the real profile CDP-ready.

All three feed the same `BrowserSession`; the MCP surface is identical.

## Design invariants

- **Element-index addressing over vision.** The agent reads `snapshot()` output and acts by index; coordinates come from `getBoundingClientRect()` **at action time** (live rects, immune to layout shift between snapshot and click).
- **Trusted input only.** All clicks/keys go through the CDP `Input` domain — `isTrusted: true` at the page level.
- **State-after-every-action.** Each mutating tool returns the fresh snapshot diff + new network entries — the agent closes decide→act→see in one round-trip.
- **Humanize as a dial.** `ghost` (curves + dwell + cadence typing with typos) / `natural` (curves + dwell, bulk typing) / `fast` (teleport + insertText). Per-action override.
- **Protocol adapters.** `packages/core` is the only CDP-aware package; a WebDriver BiDi adapter (Firefox/Safari) and a WebMCP passthrough can slot in without touching tools or humanize.
- **Boundaries are zod.** Discovery payloads, command results, tool inputs, CLI args — parsed at the edge, typed inside.

## Threading & lifecycle

- Single Node event loop; one WebSocket per browser; session-scoped commands via `Target.attachToTarget(flatten)`.
- Requests correlate by monotonic id; every call has a timeout (default 30s) that clears its pending entry.
- Socket close (browser exit, network drop) rejects all pending calls with `SOCKET_CLOSED` — no hung awaits.
- The executor re-installs itself on new documents via `Page.addScriptToEvaluateOnNewDocument`; snapshot failures after navigation trigger one reinstall-and-retry.
