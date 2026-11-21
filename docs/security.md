# Security model

## Trust boundaries

| Surface | Trust model |
|---|---|
| MCP server | Binds **localhost only** (stdio = no socket at all). Remote HTTP transport is opt-in and phase-2. |
| Pairing | The bridge popup shows a token; the local server must present it. Random local processes cannot attach. |
| Tab attach | Per-tab, explicit, visible: Chrome shows the "started debugging" banner while `chrome.debugger` is attached. redhand never tries to hide it. |
| Kill switch | `session.detach()` + extension "Detach current tab" button + closing the MCP process all sever control immediately. |

## What redhand can do while attached

Read the attached tab's DOM, dispatch trusted input, evaluate JS, capture screenshots, observe network requests **of that tab**. That is the same trust level as handing the agent the page yourself — attach deliberately, per tab.

## What redhand deliberately does not do

- **No cloud.** Everything is local; nothing phones home.
- **No cookie scraping.** The tool has no cookie API surface at all — a deliberate omission that keeps the security story simple.
- **No fingerprint patching.** We drive the genuine browser. Anti-detect is a *behavior* layer (humanized dynamics), not an environment layer.
- **No stealth marketing.** The honest claim: your own automation on your own accounts and authorized targets won't behave like a bot. Defeating the hardest anti-bot stacks is not a design goal and not a promise.

## Dependency hygiene

- Runtime deps: `ws`, `zod`, `@modelcontextprotocol/sdk`, `devtools-protocol` — nothing else without an explicit decision record.
- Lockfile-pinned; `pnpm audit --prod` is a CI gate; publish uses npm provenance.
- The in-page executor ships as one zero-dependency file — auditable in a single read.

## Disclosure

Found a security issue in redhand? Email **arifubaid0345@gmail.com** (see LICENSE for licensing context) — please do not open a public issue for exploitable bugs. Give us 90 days for a fix before public disclosure.
