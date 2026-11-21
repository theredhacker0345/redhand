/** Glama step 27 — probe all form controls with y positions. */
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
  `JSON.stringify(Array.from(document.querySelectorAll("select,input,textarea")).map(function (e) {
    var r = e.getBoundingClientRect();
    return {
      tag: e.tagName, type: e.type || "", y: Math.round(r.y), x: Math.round(r.x),
      w: Math.round(r.width), name: e.name || e.id || e.placeholder || "",
      value: String(e.value || "").slice(0, 40), visible: r.width > 0 && r.height > 0,
    };
  }).filter(function (e) { return e.visible; }))`,
)) as unknown;
const parsed = JSON.parse(String(raw)) as Array<{
  tag: string; type: string; y: number; x: number; w: number; name: string; value: string; visible: boolean;
}>;
for (const e of parsed) {
  log(`${e.tag}[${e.type}] (y=${e.y}, x=${e.x}, w=${e.w}) name="${e.name.slice(0, 40)}" value="${e.value.slice(0, 30)}"`);
}
