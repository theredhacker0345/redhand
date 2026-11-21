# 🔴 redhand

> **The agent's hand inside your browser.**
> Give AI agents Manus-grade browser control — over *your* real browser, with *your* sessions, *your* fingerprint, and input that behaves like a human — through MCP.

**Status: under active development — v1 target.** This README is the design contract.

**License: BSL 1.1** (free for personal use, security research, and bug bounty work — see [License](#license) for plain-English terms).

---

## What is redhand?

redhand is a **local tool + MCP server** that lets AI agents (Claude, Cursor, ZCode, any MCP client — or your own scripts) operate a real browser with the same precision as Manus's internal operator:

- **Element-index addressing, not vision.** The agent reads an indexed list of interactive elements and acts by index — no screenshot→coordinate→miss loops.
- **Your real browser.** Not a disposable automation instance. Your profile, your cookies, your logged-in sessions, your genuine TLS/fingerprint.
- **Raw CDP, no middlemen.** redhand speaks the Chrome DevTools Protocol directly — the same protocol Manus's operator uses through `chrome.debugger`, the same one Chrome DevTools itself uses. No Playwright/Puppeteer abstraction between us and the browser.
- **Humanized input.** Mouse curves with acceleration/deceleration, dwell before clicks, overshoot-and-correct, cadence typing — because automation that moves like a robot gets treated like one.

The engine implements operator patterns proven in production — element-index addressing, trusted input dispatch, state-after-every-action loops — with the precision layer (element discovery, overlap pruning, live-rect targeting) built and tuned by us, in our own code.

---

## How it works

```
┌─────────────────┐      MCP (stdio / HTTP)      ┌──────────────────────────┐
│  AI agent       │ ◄──────────────────────────► │  redhand                 │
│  (Claude/Cursor │                               │  ┌────────────────────┐ │
│  /ZCode/script) │                               │  │ MCP server         │ │
└─────────────────┘                               │  │ ├ snapshot/click/  │ │
                                                  │  │ │ type/press/…     │ │
                                                  │  │ ├ index layer      │ │
                                                  │  │ ├ humanize engine  │ │
                                                  │  │ ├ network capture  │ │
                                                  │  │ └ CDP client ──────┼─┤
                                                  │  └────────────────────┘ │
                                                  └──────────────┬───────────┘
                                                                 │ CDP over WebSocket
                                                  ┌──────────────▼───────────┐
                                                  │  YOUR browser            │
                                                  │  (real profile/sessions) │
                                                  └──────────────────────────┘
```

Three ways to connect (all v1):

| Mode | How | Relaunch needed? |
|---|---|---|
| **Companion bridge** (default) | Tiny `redhand-bridge` extension (loaded once) talks `chrome.debugger` → WebSocket loopback → redhand. No native-host registration, works the same on Windows/macOS/Linux. Attach to your browser **while it's already running**. | ❌ none |
| **Debug-port attach** | Browser already launched with `--remote-debugging-port` → `redhand attach` connects. | ❌ if port is open |
| **Launcher** | `redhand setup` creates a desktop shortcut that starts your real profile CDP-ready. | ✅ once, by design |

---

## Feature set (v1)

- **`browser_snapshot`** — indexed interactive elements: clickability heuristics, overlap pruning (nested dupes dropped), viewport filter, tag/role/text/aria/rect per element. JSON for code + compact text for LLM prompts.
- **Actions, all with state-after** — every call returns the fresh snapshot diff + url/title. One round-trip per decide→act→see:
  `click(i)` · `type(i, text)` (bulk fill) · `press(k)` · `scroll` · `select(i, v)` · `hover(i)` · `drag` · `evaluate(js)` · `screenshot()` · `wait_settled()`
- **`humanize` dial** — session-level, per-action override:
  - `ghost` — full curves, dwell, cadence typing with typo-and-correct
  - `natural` (default) — curves + dwell, fast typing
  - `fast` — teleport + bulk insertText (for your own admin panels)
- **`browser_network`** — request/response capture while you drive (recon gold: watch the XHRs behind the page you're operating)
- **Multi-tab** — list/attach/switch tabs; per-tab attach indicator
- **MCP server** — stdio (Claude Desktop/Cursor/ZCode) + streamable HTTP for remote agents
- **Evaluate & screenshot** — full JS access and pixel capture for verification loops

### What redhand deliberately is

- ✅ Local-only. The MCP server binds localhost; the browser never leaves your machine.
- ✅ Transparent. The browser shows its "started debugging" banner while attached — we don't hide that you're being driven, we make it precise.
- ✅ Minimal-dependency. ~3 runtime dependencies total (ws, zod, MCP SDK), lockfile-pinned, audit + provenance in CI. The in-page executor ships as a single zero-dependency file.
- ✅ Thin CDP client, isolated in its own package, using auto-regenerated protocol types — the stable core automation domains (Input, Runtime, Page, DOM) have been protocol-stable for years, and the adapter boundary keeps a BiDi swap non-invasive.

### What redhand deliberately is not

- ❌ Not a cloud service. Nothing phones home.
- ❌ Not a fingerprint-spoofing browser. We drive the *genuine* browser and fight detection on the **behavior layer** (humanized dynamics), not by patching the environment.
- ❌ Not an anti-bot-evasion product. The honest claim: your own automation on your own accounts and authorized targets won't behave like a bot. It is not a promise to defeat the hardest anti-bot stacks, and we won't market it as one.

---

## Why it's different

| Capability | redhand | Playwright MCP | Browser MCP | stealth-browser-mcp | browser-use | ghost-cursor |
|---|---|---|---|---|---|---|
| Your real browser + sessions | ✅ | via extension | ✅ via extension | ✅ | 🟡 fresh/cloud | ❌ |
| No extension required | ✅ (bridge optional) | ❌ | ❌ | ✅ | ✅ | ✅ |
| Attach to running browser | ✅ (bridge, v1) | ✅ (extension) | ✅ | 🟡 | ❌ | ❌ |
| Element-index precision API | ✅ core | 🟡 a11y refs | 🟡 basic | 🟡 | ✅ | ❌ |
| State-after every action | ✅ | ❌ | ❌ | ❌ | 🟡 | ❌ |
| Humanized mouse + typing | ✅ first-class dial | ❌ | ❌ | ❌ | ❌ | 🟡 mouse only |
| Network capture | ✅ | ✅ | ❌ | ✅ | 🟡 | ❌ |
| Single self-contained package (tool + MCP) | ✅ | ✅ | ✅ | ✅ | ❌ own API | ❌ |
| Built for security-research workflow | ✅ the niche | ❌ | ❌ | 🟡 scraping | ❌ | ❌ |

Full receipts: [`docs/comparison.md`](docs/comparison.md).

---

## Quickstart (v1 target)

```bash
# MCP clients (Claude Desktop / Cursor / ZCode / Codex):
npx redhand-mcp

# or a standalone binary — no Node required:
redhand-mcp.exe serve

# one-time setup: pick browser + profile, create launcher, load the bridge extension
redhand setup
```

Agent-side, the tools are self-explanatory:

```
browser_snapshot()          →  1 <button class="cta"> "Sign in"  (312,48,120,36)
                               2 <input type="email" placeholder="you@x.com"> (…)
                               3 <input type="password"> (…)
browser_type(2, "me@x.com")
browser_type(3, "••••••", humanize="ghost")
browser_click(1)            →  returns post-click state (URL changed, new elements 1-14)
```

---

## Architecture & roadmap

```
redhand/
├── packages/
│   ├── core/          # CDP client (raw WebSocket, own implementation) + index layer
│   ├── executor/      # in-page engine (TS → built to zero-dep JS, injected per page)
│   ├── humanize/      # curves, dwell, cadence typing, event hygiene
│   ├── mcp/           # MCP server (stdio + streamable HTTP)
│   └── cli/           # setup wizard, attach, serve
├── bridge/            # redhand-bridge companion extension (chrome.debugger → WS loopback)
├── docs/              # architecture.md · comparison.md · security.md
└── examples/          # snapshot-click · form-fill · bounty-recon sessions
```

**v1:** everything above.
**Phase 2:** WebDriver BiDi adapter (Firefox/Safari — the protocol layer is adapter-ready by design), WebMCP site-tools passthrough, recording → replay, HAR export.
**Maybe later:** Go/Rust rewrite of the daemon (the MCP contract hides the language; nothing locks in).

---

## Security notes

- The bridge extension holds only `debugger` + `nativeMessaging` — no tabs-wide content scripts, no cookies permission, no storage of page data.
- Pairing token: the popup shows a token the local server must present — random local processes can't attach.
- Session visibility: badge + banner while a tab is attached; `stop()` kills control instantly.
- While attached, the controlling agent can read the attached tab's DOM — same trust level as handing the agent the page yourself. Attach deliberately.

---

## Author

Built by [**theredhacker0345**](https://github.com/theredhacker0345) — security researcher. All code is original.

## License

**Business Source License 1.1 (BSL 1.1)** — in plain English:

- **Free for you if you're:** using it personally, doing security research, hunting bugs on bug bounty programs, or automating non-commercial workflows on systems you own or are authorized to test. That's the Additional Use Grant — no payment, no permission needed.
- **Commercial use** (building a product or service on redhand, using it for client work, reselling it) requires a paid license — **email arifubaid0345@gmail.com**.
- **It converts to Apache License 2.0 four years after each release** — every version becomes fully open source under Apache 2.0 four years after it ships, so nothing is ever locked away permanently.
