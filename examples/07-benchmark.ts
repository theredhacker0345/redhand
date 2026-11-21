/**
 * Benchmark — measure redhand's real operation latencies.
 * Runs entirely in an ISOLATED about:blank sandbox tab: never touches live
 * third-party pages. Run: node --experimental-strip-types examples/07-benchmark.ts
 */
import { writeFileSync, writeSync } from "node:fs";
import { BrowserSession } from "../packages/mcp/dist/index.js";

const PORT = Number(process.env["REDHAND_CDP_PORT"] ?? 9223);
function log(line: string): void {
  writeSync(1, line + "\n");
}
function avg(values: number[]): number {
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}
const results: Record<string, number> = {};

const session = await BrowserSession.connect({ port: PORT });
log("connected");

// Isolated sandbox tab — the benchmark NEVER operates live third-party pages.
await session.createTab("about:blank");
await session.evaluate(
  'document.body.innerHTML = \'<button id="b1">Submit</button><button id="b2">Cancel</button><input id="in" placeholder="field" value="preset">\'',
);

// 1. navigate + snapshot (full page-load loop, sandbox reload)
const navTimes: number[] = [];
for (let i = 0; i < 3; i++) {
  const t0 = Date.now();
  await session.navigate("about:blank");
  await session.evaluate(
    'document.body.innerHTML = \'<button id="b1">Submit</button><input id="in" placeholder="field">\'',
  );
  await session.snapshot();
  navTimes.push(Date.now() - t0);
}
results["navigate+snapshot (avg of 3)"] = avg(navTimes);

// 2. snapshot alone
const snapTimes: number[] = [];
for (let i = 0; i < 5; i++) {
  const t0 = Date.now();
  await session.snapshot();
  snapTimes.push(Date.now() - t0);
}
results["snapshot alone (avg of 5)"] = avg(snapTimes);

// 3. JS evaluate roundtrip
const evalTimes: number[] = [];
for (let i = 0; i < 10; i++) {
  const t0 = Date.now();
  await session.evaluate("1+1");
  evalTimes.push(Date.now() - t0);
}
results["JS evaluate roundtrip (avg of 10)"] = avg(evalTimes);

// 4. clicks by humanize mode
const snap = await session.snapshot();
const btn = snap.elements.find((el) => el.text === "Submit");
const clickTimes: Record<string, number[]> = { natural: [], fast: [] };
if (btn) {
  for (const mode of ["natural", "fast"] as const) {
    for (let i = 0; i < 3; i++) {
      const t0 = Date.now();
      await session.click(btn.index, mode);
      clickTimes[mode].push(Date.now() - t0);
    }
  }
  results["click natural (humanized curve, avg of 3)"] = avg(clickTimes["natural"] ?? [0]);
  results["click fast (teleport, avg of 3)"] = avg(clickTimes["fast"] ?? [0]);
}

const lines = Object.entries(results).map(([k, v]) => `${k}: ${v}ms`);
log("\n== BENCHMARK RESULTS ==\n" + lines.join("\n"));
writeFileSync(
  "C:/Users/Ubaid/.zcode/workspace/default/redhand/docs/benchmark-results.json",
  JSON.stringify({ date: new Date().toISOString(), surface: "about:blank sandbox", results }, null, 2),
);
log("saved: docs/benchmark-results.json");
await session.detach();
