# AGENTS.md — redhand monorepo

Rules for AI agents (and humans) working in this repository. Read once, follow always.

## Commands (exact, runnable from repo root)

```bash
pnpm install                          # bootstrap (pnpm 12, node >= 22)
pnpm build                            # turbo build — all packages
pnpm test                             # turbo test — vitest with coverage floors
pnpm lint                             # turbo lint — eslint 9 flat config
pnpm typecheck                        # turbo typecheck — tsc --noEmit per package
pnpm turbo run build --filter=@redhand/core   # build one package (and its deps)
pnpm audit --prod                     # production dependency audit (CI gate)
```

Per-package scripts live in each `packages/*/package.json` and are invoked via turbo only.

## Project structure (one line per package)

| Path | Responsibility |
|---|---|
| `packages/core/` | Thin raw-CDP-over-WebSocket client (`CdpClient`, `SocketLike`) + element index layer (snapshot, live rects, diffs) |
| `packages/executor/` | The zero-dependency in-page engine shipped as a single injectable source string (`EXECUTOR_SOURCE`) |
| `packages/humanize/` | Mouse Bezier curves, Fitts durations, dwell, cadence typing with typo-and-correct |
| `packages/mcp/` | MCP server (`redhand-mcp`): `BrowserSession` wiring + tool definitions (snapshot/click/type/press/scroll/select/hover/evaluate/screenshot/network/tabs) |
| `packages/cli/` | `redhand` binary: setup wizard, attach inspector, serve launcher |
| `bridge/` | MV3 Chrome extension (`redhand-bridge`): `chrome.debugger` → WebSocket loopback relay |
| `docs/` | architecture.md, comparison.md, security.md, build-order.md, test-plan.md |
| `examples/` | Runnable agent sessions (snapshot-click, form-fill, bounty-recon) |

## Code contracts — non-negotiable

1. **No dependencies outside the approved runtime list**: `ws`, `zod`, `@modelcontextprotocol/sdk`, `devtools-protocol` (+ in-repo `@redhand/*` workspace packages). Dev-only additions (types, test runners, linters) are allowed in `devDependencies`.
2. **Zod at every external boundary**: CDP HTTP discovery payloads, every `send()` result passed to callers, MCP tool inputs, CLI args, bridge WebSocket frames. Internal typed calls need no re-validation.
3. **Executor is zero-dep**: `packages/executor/src/index.ts` must compile to a single file with no imports and produce a source string that is valid ES5-compatible JS — no backticks or `${` sequences inside `EXECUTOR_SOURCE`.
4. **CDP types come only from `devtools-protocol`** (`import type * as Protocol from "devtools-protocol"`). Never hand-write CDP payload types.
5. **Bridge is MV3 only**: service worker + `chrome.debugger` + WebSocket loopback. No native messaging, no per-OS manifest registration, no remote code.
6. **Error discipline**: all failures throw `RedhandError` (discriminated by `code`) or SDK/zod errors wrapped by the boundary handler — never bare strings.
7. **Strict TS**: no `any`, no non-null `!` without a justifying comment, named exports only, one concept per file, every function ≤ 40 lines.

## Import direction rules (per package)

- `executor` → **imports NOTHING** (not even workspace packages). It exports only strings.
- `core` → may import `@redhand/executor` (to inject). Must NOT import `humanize` or `mcp`.
- `humanize` → imports NOTHING from other packages. Pure math + seeded RNG.
- `mcp` → may import `core`, `humanize`. Must NOT import `cli`.
- `cli` → may import `mcp`, `core`. Must NOT import `bridge`.
- `bridge` → imports NOTHING from `packages/*` (ships as a browser extension).

## Test conventions

- Test files are co-located: `src/**/*.test.ts`.
- **No mocking of the CDP socket in unit tests.** Inject a fixture-driven `SocketLike` (see `packages/core/src/cdp-client.test.ts` → `FakeSocket`, `packages/mcp/src/session.test.ts` → `RoutingSocket`) and feed canned JSON frames. Fixtures live inline in the test (small) or `fixtures/*.json` (large).
- Executor tests run `EXECUTOR_SOURCE` inside happy-dom against fixture HTML; geometry is simulated via `data-x/y/w/h` attributes (happy-dom has no layout engine).
- Integration tests that need a real browser are tagged `// @integration` and skipped unless `RUN_INTEGRATION=1`:
  ```ts
  const d = process.env.RUN_INTEGRATION === "1" ? describe : describe.skip; // @integration
  ```
- Coverage floors (CI fails below): core 85% lines · mcp 85% · executor 90% · humanize 80% · cli 60%. Bridge is manual-only (MV3 SW needs a real browser).
- Coverage pragmas (`/* v8 ignore start/stop */`) are allowed only on paths exercised by `@integration` tests, and must say which.
