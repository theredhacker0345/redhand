# redhand vs the field (researched 2026-11-21)

> Status note: the redhand column marks **v1 targets** (🚧), not shipped features.
> Every competitor cell was verified against live sources on 2026-11-21 — links below.

| Capability | **redhand** 🚧 | [Playwright MCP](https://github.com/microsoft/playwright-mcp) (MS) | [chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp) (Google) | [Browser MCP](https://browsermcp.io) | [stealth-browser-mcp](https://github.com/vibheksoni/stealth-browser-mcp) | [browser-use](https://github.com/browser-use/browser-use) | [ghost-cursor](https://www.npmjs.com/package/ghost-cursor) |
|---|---|---|---|---|---|---|---|
| Drives **your real browser** | 🚧 real profile | 🟡 via their extension | 🟡 own launch / `--autoConnect` | ✅ via their extension | ✅ real Chrome | 🟡 fresh/cloud by default | ❌ (library only) |
| **Logged-in sessions** preserved | 🚧 ✅ | ✅ (extension mode) | 🟡 | ✅ | ✅ | 🟡 manual profile hack | ❌ |
| **No extension install** | 🚧 ✅ (setup shortcut) | ❌ needs extension | ✅ | ❌ needs extension | ✅ | ✅ | ✅ |
| Attach to **already-running** browser | ❌ v1 → 🔜 phase-2 add-on | ✅ | ✅ | ✅ | 🟡 | ❌ | ❌ |
| **Element-index API** (DOM-heuristic discovery) | 🚧 ✅ core design | 🟡 a11y-tree refs | 🟡 uid snapshot | 🟡 basic click/fill | 🟡 DOM extraction | ✅ indexed elements | ❌ |
| **State-after-every-action** (1 round-trip loop) | 🚧 ✅ core design | ❌ | 🟡 | ❌ | ❌ | 🟡 | ❌ |
| **Humanized mouse** (curves, dwell, overshoot) | 🚧 ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (their whole product) |
| **Humanized typing** (cadence, bursts) | 🚧 ✅ | ❌ | ❌ | ❌ | 🟡 | ❌ | ❌ |
| **Anti-detection hygiene** (no automation flags, lazy domain-enable) | 🚧 ✅ | ❌ | 🟡 | 🟡 (real-profile fingerprint claim) | ✅ (their focus) | 🟡 | 🟡 (input only) |
| **Network capture** (recon / HAR) | 🚧 ✅ v1 | ✅ | ✅ | ❌ | ✅ | 🟡 | ❌ |
| **MCP server** (agent contract) | 🚧 ✅ | ✅ | ✅ | ✅ | ✅ | ❌ (own API) | ❌ |
| **Evaluate JS / screenshots** | 🚧 ✅ | ✅ | ✅ | 🟡 | ✅ | ✅ | ❌ |
| Chrome / **Brave** / Edge support | 🚧 ✅ all Chromium | ✅ | Chrome only-ish | Chrome | Chrome-family | ✅ | ✅ |
| Self-hosted, local-only, free OSS | 🚧 ✅ | ✅ | ✅ | 🟡 free tier, closed extension | ✅ | ✅ | ✅ |
| **Security-research / bounty workflow** positioning | 🚧 ✅ the niche | ❌ | ❌ | ❌ | 🟡 stealth-scraping | ❌ | ❌ |

Legend: ✅ yes · 🟡 partial/workaround · ❌ no · 🚧 redhand v1 target · 🔜 phase-2

## Takeaways

1. **Every ingredient exists somewhere** — but no single tool combines
   real-profile + element-index precision + humanized input + network capture + MCP.
   The combination is the product.
2. **One structural gap** vs extension-based tools: attaching to an *already-running*
   browser. redhand v1 uses a 30-second setup shortcut (browser launched with the debug
   port from your real profile); the phase-2 `redhand-link` extension closes the gap
   without changing the MCP API.
3. **Anti-detect layers are complementary, not competitive:** CloakBrowser/Camoufox/
   patchright fight on the *fingerprint* layer (patched browsers). redhand fights on the
   *behavior* layer (humanized input dynamics) while driving a genuine browser —
   real profile + real Chrome means we inherit fingerprint authenticity for free.
4. **Market validation:** Microsoft and Google both ship official MCP browser servers —
   demand is proven. Their audiences are developers debugging and general agent
   automation; neither prioritizes humanization or the security-research workflow.
   That specialization is the moat — move fast.

## Sources (verified 2026-11-21)

- Playwright MCP: https://github.com/microsoft/playwright-mcp · https://playwright.dev/mcp/configuration/browser-extension
- chrome-devtools-mcp: https://github.com/ChromeDevTools/chrome-devtools-mcp · https://developer.chrome.com/blog/devtools-mcp · https://developer.chrome.com/blog/chrome-devtools-mcp-debug-your-browser-session
- Browser MCP: https://browsermcp.io · https://chromewebstore.google.com/detail/browser-mcp-let-ai-use-yo/bjfgambnhccakkhmkepdoekmckoijdlc · https://github.com/browsermcp/mcp
- stealth-browser-mcp: https://github.com/vibheksoni/stealth-browser-mcp
- ghost-cursor: https://www.npmjs.com/package/ghost-cursor · https://github.com/reaz1995/ghost-cursor-playwright
- browser-use: https://github.com/browser-use/browser-use
- Anti-detect ecosystem: https://github.com/CloakHQ/cloakbrowser · https://www.clearcotelabs.com/features/humanized-input
