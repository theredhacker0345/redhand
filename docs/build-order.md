# Build order with gotchas

The implementation sequence for redhand v1, with the traps that actually bite.

## Step 1 — CDP client (packages/core)
**Files:** `src/errors.ts`, `src/socket.ts`, `src/schema.ts`, `src/cdp-client.ts`
**Exports:** `CdpClient` (discover/connect/fromSocket/send/on/attachToTarget/getTargets/evaluate/close), `SocketLike`, `adaptWsSocket`, `RedhandError`, boundary schemas.
**Gotchas:**
- CDP message correlation is by numeric `id`; events have no `id` and (with flatten) carry a root-level `sessionId`. Mixing these up silently drops events.
- `Target.attachToTarget` **requires `flatten: true`** — without it, sessions open separate sockets and session-scoped commands fail.
- Browser WS endpoint (`/json/version` → `webSocketDebuggerUrl`) is browser-level; page commands need a session from `Target.attachToTarget`.
- Command results come back as `{id, result}` OR `{id, error:{code,message,data}}` — both must clear the pending map or you leak timers.
- happy-dom/unit tests: never open a real socket — inject a `SocketLike` fixture.
**Done when:** fixture-driven tests pass — id correlation, zod VALIDATION on bad results, TIMEOUT, CDP_ERROR surfacing, socket-close rejection.

## Step 2 — Element index layer (packages/core)
**Files:** `src/index-layer.ts`
**Exports:** `installExecutor`, `snapshot`, `liveRect`, `focusElement`, `scrollIntoView`, `selectOption`, `diffSnapshots`, `renderSnapshot`.
**Gotchas:**
- `Runtime.evaluate` results arrive at `result.result.value` (outer result = CDP envelope, inner = evaluate payload); `exceptionDetails` must be surfaced as PROTOCOL_ERROR, not returned as undefined.
- Snapshot rects are **client coordinates** (viewport-relative) — `Input.dispatchMouseEvent` wants client coords, not page coords.
- After navigation the document is new and the executor is gone — reinstall (`Page.addScriptToEvaluateOnNewDocument` + one evaluate) and retry once.
**Done when:** snapshot/liveRect/focus/select/diff tests pass against the RoutingSocket fixture, including VALIDATION and exception paths.

## Step 3 — In-page executor (packages/executor)
**Files:** `src/index.ts`
**Exports:** `EXECUTOR_SOURCE` (string), `EXECUTOR_VERSION`.
**Gotchas:**
- The source lives inside a TS template literal — **no backticks and no `${` sequences** may appear in the JS (or it breaks the build).
- happy-dom has no layout engine: every rect is 0×0 — patch `getBoundingClientRect` per-element (data attributes) in tests.
- Overlap pruning is O(n²): cap candidates (1500) and skip pruning above the cap.
- `OPTION` elements are not clickable targets (native `<select>` is driven by `selectOption`); leaving them clickable collapses selects under nested-duplicate pruning.
- Indexes start at 1; `data-redhand-id` is cleared and re-annotated on every snapshot.
**Done when:** executor tests run the real source in happy-dom against fixture HTML — indexing, exclusion, overlap pruning, annotation, focus/select/scroll, idempotent install.

## Step 4 — Humanize engine (packages/humanize)
**Files:** `src/rng.ts`, `src/curves.ts`, `src/typing.ts`, `src/index.ts`
**Exports:** `mousePath`, `fittsDuration`, `dwell`, `cadence`, `typedCharCount`, `Rng`.
**Gotchas:**
- All randomness flows through the seeded `Rng` — unseeded `Math.random` makes tests flaky and detection tuning impossible.
- The path's final point must land **exactly** on the target (no jitter on the last sample) — sites with hit-testing on the click point will miss otherwise.
- TS control-flow analysis cannot see assignments made inside callbacks — capture handlers on a holder object in tests, not bare `let`s.
- Delays are per-point "wait before dispatch" — the caller sleeps, the engine never does.
**Done when:** deterministic curve tests pass (fixed seed), Fitts bounds hold, cadence char accounting includes typo insert+erase pairs.

## Step 5 — MCP server (packages/mcp)
**Files:** `src/session.ts`, `src/tools.ts`, `src/index.ts`
**Exports:** `BrowserSession` (connect/fromClient/click/type/press/scroll/select/hover/evaluate/screenshot/network/waitSettled/tabs/attachToTab/detach), `toolDefinitions()`, `createServer()`, `main()`.
**Gotchas:**
- SDK `registerTool` expects `inputSchema` as a **zod raw shape** (plain object of zod types, not `z.object(...)`).
- Tool results must match the SDK's `CallToolResult["content"]` — an **array** of content blocks; a single text object fails the type check.
- The network ring buffer is keyed by session; responseReceived updates the request entry found by `requestId` (search from the end).
- `waitSettled` uses `Runtime.evaluate` with `awaitPromise: true` + a MutationObserver debounce (450ms quiet, 5s cap) — never a fixed sleep.
- Ghost typing dispatches **per-char `Input.insertText`** with cadence delays and `Input.dispatchKeyEvent` backspaces for corrections.
**Done when:** every tool handler runs against the fixture session and yields content; ghost typing produces ≥ n insert calls; network buffer captures fixture events.

## Step 6 — CLI (packages/cli)
**Files:** `src/args.ts`, `src/index.ts`
**Exports:** `parseArgs`, `run`.
**Gotchas:**
- No argument-parsing dependency — the runtime dep list is closed; hand-roll and zod-parse the port.
- Windows shortcut creation goes through `powershell -NoProfile -Command` (WScript.Shell COM) — guard by `process.platform`.
- Unknown commands degrade to `help` (never crash on argv).
**Done when:** parseArgs tests pass — command + flags + port validation + graceful degradation.

## Step 7 — Bridge extension (bridge/)
**Files:** `manifest.json`, `src/background.ts`, `src/popup.ts`, `popup.html`, `tsconfig.json`, `package.json`
**Exports:** none (ships as an unpacked extension).
**Gotchas:**
- MV3 service workers die on idle — WebSocket activity resets the idle timer, so the server pings every 20s and the SW replies; no `alarms` permission needed.
- Manifest must declare `"host_permissions": ["ws://127.0.0.1/*", "ws://localhost/*"]` or the loopback WS is blocked.
- `chrome.debugger.attach` needs `"debugger"` permission; the browser shows the "started debugging" banner — that's the transparency contract, never suppress it.
- Manifest points at `dist/background.js` — the extension loads only after `pnpm build`.
**Done when:** manual test — popup saves a pairing token, "Attach current tab" shows the banner, `redhand attach` sees the tab, snapshot returns the real page.

## Final gate

```bash
pnpm lint && pnpm typecheck && pnpm build && pnpm test && pnpm audit --prod
```
All green = v1 scaffold complete.
