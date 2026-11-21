/** Glama step 25c — map Dockerfile editor geometry + save button. */
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
  `JSON.stringify({
    cms: Array.from(document.querySelectorAll(".cm-editor")).map(function (c) {
      var r = c.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), visible: r.width > 0 };
    }),
    ta: Array.from(document.querySelectorAll("textarea")).map(function (t) {
      var r = t.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), name: t.name || "", visible: r.width > 0 };
    }),
    buttons: Array.from(document.querySelectorAll("button")).map(function (b) {
      var r = b.getBoundingClientRect();
      return { text: (b.textContent || "").trim().slice(0, 30), x: Math.round(r.x), y: Math.round(r.y), visible: r.width > 0 };
    }).filter(function (b) { return b.visible && b.text; }),
  })`,
)) as unknown;
const parsed = JSON.parse(String(raw)) as {
  cms: Array<{ x: number; y: number; w: number; h: number; visible: boolean }>;
  ta: Array<{ x: number; y: number; w: number; h: number; name: string; visible: boolean }>;
  buttons: Array<{ text: string; x: number; y: number; visible: boolean }>;
};
for (const c of parsed.cms) {
  log(`cm-editor: (${c.x},${c.y}) ${c.w}x${c.h} visible=${c.visible}`);
}
for (const t of parsed.ta) {
  log(`textarea: (${t.x},${t.y}) ${t.w}x${t.h} name=${t.name} visible=${t.visible}`);
}
for (const b of parsed.buttons) {
  log(`button "${b.text}" (${b.x},${b.y})`);
}
