# Test plan

Coverage floors are hard CI gates. Bridge is manual-only (MV3 service workers need a real browser).

## packages/core — floor: 85% lines

| Test | Type | What it proves | Skip in CI? |
|---|---|---|---|
| id correlation by frame id | unit (fixture socket) | responses route to the right command | no |
| zod schema applied to results | unit (fixture socket) | inbound payloads cross a zod boundary | no |
| VALIDATION on schema mismatch | unit (fixture socket) | malformed results surface as typed errors | no |
| CDP error → CDP_ERROR | unit (fixture socket) | browser-side errors are not swallowed | no |
| TIMEOUT on missing response | unit (fixture socket) | hung commands fail with typed timeout | no |
| event dispatch (global + session-scoped) | unit (fixture socket) | flatten sessions scope events correctly | no |
| socket close rejects pending | unit (fixture socket) | disconnects never hang callers | no |
| malformed frames dropped | unit (fixture socket) | garbage frames don't kill the client | no |
| unsubscribe stops delivery | unit (fixture socket) | handler teardown works | no |
| getTargets zod envelope | unit (fixture socket) | {targetInfos:[...]} unwraps to typed targets | no |
| snapshot/liveRect/focus/select/scroll via fixture | unit (fixture socket) | index-layer orchestration + validation paths | no |
| discover parses /json/version (fetch stub) | unit (fetch stub) | endpoint discovery + zod | no |
| discover DISCOVER_FAILED | unit (fetch stub) | unreachable endpoint → typed error | no |
| adaptWsSocket delegation | unit (fake ws object) | ws adapter wires all five SocketLike methods | no |
| real Brave: snapshot over live CDP | integration (`// @integration`) | end-to-end against a running browser | yes (RUN_INTEGRATION=1) |

```ts
// packages/core/vitest.config.ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/index.ts"],
      thresholds: { lines: 85, functions: 80 },
    },
  },
});
```

## packages/executor — floor: 90% lines

| Test | Type | What it proves | Skip in CI? |
|---|---|---|---|
| version marker + idempotent install | unit (happy-dom + eval) | source is self-guarding | no |
| indexes visible interactive elements | unit (happy-dom fixture HTML) | discovery + index ordering from 1 | no |
| excludes blacklisted/invisible/zero-size | unit (happy-dom fixture HTML) | filters hold | no |
| overlap pruning keeps inner element | unit (happy-dom fixture HTML) | nested dupes (≥0.8 ratio) collapse | no |
| data-redhand-id annotate + clear | unit (happy-dom fixture HTML) | annotation contract | no |
| liveRect / focus / selectOption / scrollIntoView | unit (happy-dom fixture HTML) | action support surface | no |
| pointer-cursor divs are candidates | unit (happy-dom fixture HTML) | cursor heuristic | no |
| real page: full snapshot vs executor | integration (`// @integration`) | behavior on a real website | yes (RUN_INTEGRATION=1) |

```ts
// packages/executor/vitest.config.ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    environment: "happy-dom",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts"],
      thresholds: { lines: 90, functions: 85 },
    },
  },
});
```

## packages/humanize — floor: 80% lines

| Test | Type | What it proves | Skip in CI? |
|---|---|---|---|
| seeded RNG determinism | unit | same seed → same stream | no |
| Rng int/normal bounds | unit | sampling stays in range | no |
| Fitts duration clamps + monotonicity | unit | duration band [180,900] grows with distance | no |
| mousePath lands exactly on target | unit (seeded) | final point = target, no jitter | no |
| mousePath delay positivity + determinism | unit (seeded) | dispatch plan is stable | no |
| overshoot corrects back to target | unit (seeded) | correction segment exists | no |
| cadence char accounting (0 typos) | unit (seeded) | every char typed once | no |
| cadence word-boundary pauses | unit (seeded) | pauses land after spaces | no |
| cadence typo insert+erase pairs | unit (seeded) | typo-and-correct accounting | no |

```ts
// packages/humanize/vitest.config.ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/index.ts"],
      thresholds: { lines: 80, functions: 75 },
    },
  },
});
```

## packages/mcp — floor: 85% lines

| Test | Type | What it proves | Skip in CI? |
|---|---|---|---|
| attach → executor install → snapshot | unit (RoutingSocket fixtures) | session wiring end-to-end without a socket | no |
| network event buffer capture | unit (fixture event frames) | request/response ring buffer updates | no |
| natural typing = one trusted insertText | unit (RoutingSocket fixtures) | bulk fill path | no |
| ghost typing = cadence with ≥n inserts | unit (RoutingSocket fixtures) | per-char dispatch path | no |
| key press → mapped virtual key codes | unit (RoutingSocket fixtures) | Input.dispatchKeyEvent mapping | no |
| screenshot base64 | unit (RoutingSocket fixtures) | capture + zod envelope | no |
| unknown key → typed VALIDATION | unit (RoutingSocket fixtures) | error discipline | no |
| every tool handler yields content | unit (fixture session) | all 13 tools execute | no |
| vanished index → typed NOT_ATTACHED | unit (fixture session) | stale-index failure path | no |
| real Brave: click + type + network on a live tab | integration (`// @integration`) | full operator loop | yes (RUN_INTEGRATION=1) |

```ts
// packages/mcp/vitest.config.ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/index.ts"],
      thresholds: { lines: 85, functions: 80 },
    },
  },
});
```

## packages/cli — floor: 60% lines

| Test | Type | What it proves | Skip in CI? |
|---|---|---|---|
| parseArgs command + --port | unit | flag parsing | no |
| unknown command → help | unit | graceful degradation | no |
| bare flags → boolean strings | unit | setup flags parse | no |
| invalid port ignored | unit | defensive arg handling | no |
| --browser value captured | unit | setup customization | no |
| setup wizard + shortcut creation | integration | real platform integration | yes (manual on Windows) |

```ts
// packages/cli/vitest.config.ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/index.ts"],
      thresholds: { lines: 60, functions: 55 },
    },
  },
});
```

## bridge/ — manual only

MV3 service workers require a real browser; CI cannot run them headless. Manual checklist lives in `docs/security.md`.
