/** Glama step 13b — inspect the Add Server button. */
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
  `JSON.stringify(Array.from(document.querySelectorAll("button,a")).map(function (b) {
    var txt = (b.textContent || "").trim();
    return { text: txt.slice(0, 30), tag: b.tagName, href: b.getAttribute("href") || null, html: b.outerHTML.slice(0, 300) };
  }).filter(function (b) { return /add server/i.test(b.text); }))`,
)) as unknown;
const parsed = JSON.parse(String(raw)) as Array<{ text: string; tag: string; href: string | null; html: string }>;
for (const b of parsed) {
  log(`[${b.tag}] "${b.text}" href=${b.href ?? "none"}\n  HTML: ${b.html}`);
}
