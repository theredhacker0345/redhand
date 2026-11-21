/** Glama step 26 — dump the select dropdowns + options. */
import { writeSync } from "node:fs";
import { BrowserSession } from "../packages/mcp/dist/index.js";

function log(line: string): void {
  writeSync(1, line + "\n");
}

const session = await BrowserSession.connect({ port: 9223 });
const glamaTab = (await session.tabs()).find((t) => t.url?.includes("glama.ai"));
if (!glamaTab) throw new Error("no glama tab");
await session.attachToTab(glamaTab.targetId);

const raw = (await session.evaluate(
  `JSON.stringify(Array.from(document.querySelectorAll("select")).map(function (s, i) {
    var r = s.getBoundingClientRect();
    return {
      i: i,
      y: Math.round(r.y),
      value: s.value,
      options: Array.from(s.options).map(function (o) { return o.value; }).slice(0, 20),
    };
  }))`,
)) as unknown;
const parsed = JSON.parse(String(raw)) as Array<{ i: number; y: number; value: string; options: string[] }>;
for (const s of parsed) {
  log(`select ${s.i} (y=${s.y}) value="${s.value}" options: ${s.options.join(", ")}`);
}
