/** Type benchmark: inject a test input, measure natural vs ghost typing. */
import { BrowserSession } from "../packages/mcp/dist/index.js";

const session = await BrowserSession.connect({ port: 9223 });
const huntrTab = (await session.tabs()).find((t) => t.url?.includes("huntr.com"));
if (huntrTab) await session.attachToTab(huntrTab.targetId);
await session.navigate("https://huntr.com/challenges");
await session.evaluate(
  "document.body.insertAdjacentHTML('beforeend','<input id=\"rh-bench\" data-x=\"500\" data-y=\"300\" style=\"position:fixed;left:500px;top:300px;width:300px\" placeholder=\"benchmark input\">')",
);
const snap = await session.snapshot();
const input = snap.elements.find((el) => el.placeholder === "benchmark input");
if (!input) {
  log("input not found in snapshot\n");
} else {
  const times: Record<string, number[]> = { natural: [], ghost: [] };
  for (const mode of ["natural", "ghost"] as const) {
    for (let i = 0; i < 2; i++) {
      const t0 = Date.now();
      await session.type(input.index, "benchmark probe 123", mode);
      times[mode]!.push(Date.now() - t0);
    }
  }
  const avg = (v: number[]) => Math.round(v.reduce((a, b) => a + b, 0) / v.length);
  log(
    `type 18 chars natural (bulk insert): ${avg(times["natural"] ?? [0])}ms\ntype 18 chars ghost (cadence+typos): ${avg(times["ghost"] ?? [0])}ms\n`,
  );
}
await session.detach();
