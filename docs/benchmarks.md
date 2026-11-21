# Benchmarks — measured, not marketed

All redhand numbers below are **measured live** on the developer's real Brave browser
(Chromium 158, Windows 11, real profile, ~6 open tabs) on 2026-11-21, using
[`examples/07-benchmark.ts`](../examples/07-benchmark.ts) and [`examples/08-type-benchmark.ts`](../examples/08-type-benchmark.ts)
against an isolated sandbox tab. Reproduce with the same scripts — they take ~30 seconds.

## Measured results (redhand v0.1.1)

| Operation | Latency | Notes |
|---|---|---|
| **Element snapshot** (full page discovery + zod validation) | **69 ms** avg of 5 | the number that matters: the agent sees the whole interactive surface in <0.1s |
| **JS evaluate roundtrip** | **6 ms** avg of 10 | Runtime.evaluate over the CDP WebSocket |
| **Click, natural mode** (humanized curve + dwell) | **1,118 ms** avg of 3 | deliberately slow — that IS the anti-detection feature |
| **Click, fast mode** (teleport) | **460 ms** avg of 3 | for your own admin panels |
| **Navigate + snapshot** (full loop) | **4,603 ms** avg of 3 | dominated by the browser's own page load + 450ms settle heuristic — network-bound for every tool alike |
| **Type 18 chars, natural** (bulk trusted insert) | ~1,200 ms | includes humanized cursor move |
| **Type 18 chars, ghost** (cadence + typos) | ~3,400 ms | deliberately human-paced |

Raw JSON: [`benchmark-results.json`](benchmark-results.json).

## How that compares

| Approach | Typical step latency | Sessions? | Element accuracy |
|---|---|---|---|
| **redhand** (index over DOM) | **69 ms snapshot · 0.46–1.1 s click** | ✅ your real profile | index-addressed, overlap-pruned, tamper-checked |
| Vision-based computer use (screenshot → model → coordinates) | ~2–8 s per step (screenshot capture + model inference per move) | fresh VM/browser | coordinate guessing — the classic miss-and-retry loop |
| LLM agent frameworks on fresh browsers (browser-use-class) | seconds to tens of seconds per action (LLM round-trip per step) | fresh profile | hybrid DOM/vision |
| Playwright MCP (a11y-tree refs) | comparable snapshot latency | fresh profile by default; extension mode exists | a11y refs |
| ghost-cursor (library) | n/a — it's just the curve math | n/a | n/a |

Caveats stated honestly:
- Competitor latencies are cited from public documentation and community measurements (marked as such), not re-benchmarked by us on the same machine — their exact numbers vary with the model and network.
- redhand's *humanized* modes are deliberately slower than raw automation: the ~1.1 s humanized click is the anti-detection feature working. `fast` mode is there when nobody's watching.
- The dominant cost in any real task is **page load** (network-bound) — identical for every tool.

## Why the snapshot number is the story

69 ms for full element discovery + overlap pruning + zod validation means an agent can
snapshot → decide → click → read state-after in roughly a second of tool time (humanized),
or ~0.5 s in fast mode — without a single screenshot, without a vision model, without
guessing coordinates, and without ever leaving its real logged-in browser.
