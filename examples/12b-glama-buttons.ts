/** Glama step 3b — identify OAuth provider buttons via attributes + SVG. */
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
  `JSON.stringify(Array.from(document.querySelectorAll("button")).slice(0, 5).map(function (b, idx) {
    var svg = b.querySelector("svg");
    return {
      n: idx,
      aria: b.getAttribute("aria-label"),
      title: b.getAttribute("title"),
      svgHead: svg ? svg.innerHTML.slice(0, 110) : "none",
    };
  }))`,
)) as unknown;
const parsed = JSON.parse(String(raw)) as Array<{ n: number; aria: string | null; title: string | null; svgHead: string }>;
for (const b of parsed) {
  log(`button ${b.n}: aria="${b.aria ?? ""}" title="${b.title ?? ""}" svg="${b.svgHead.replace(/\s+/g, " ").slice(0, 100)}"`);
}
