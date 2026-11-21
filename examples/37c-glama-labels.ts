/** Glama step 25d — read editor contents + section labels. */
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
    labels: Array.from(document.querySelectorAll("h1,h2,h3,h4,label,strong,b")).map(function (e) {
      var t = (e.textContent || "").trim().slice(0, 60);
      var r = e.getBoundingClientRect();
      return t ? { tag: e.tagName, y: Math.round(r.y), text: t } : null;
    }).filter(Boolean),
    cms: Array.from(document.querySelectorAll(".cm-editor")).map(function (c) {
      var r = c.getBoundingClientRect();
      return { y: Math.round(r.y), content: (c.textContent || "").slice(0, 120) };
    }),
    ta: Array.from(document.querySelectorAll("textarea")).map(function (t) {
      return { y: Math.round(t.getBoundingClientRect().y), name: t.name, content: (t.value || "").slice(0, 80) };
    }),
  })`,
)) as unknown;
const parsed = JSON.parse(String(raw)) as {
  labels: Array<{ tag: string; y: number; text: string }>;
  cms: Array<{ y: number; content: string }>;
  ta: Array<{ y: number; name: string; content: string }>;
};
log("== LABELS ==");
for (const l of parsed.labels) {
  log(`${l.y} [${l.tag}] ${l.text}`);
}
log("== CM EDITORS ==");
for (const c of parsed.cms) {
  log(`${c.y}: "${c.content.replace(/\n/g, " | ").slice(0, 100)}"`);
}
log("== TEXTAREAS ==");
for (const t of parsed.ta) {
  log(`${t.y} name=${t.name}: "${t.content.replace(/\n/g, " | ").slice(0, 100)}"`);
}
