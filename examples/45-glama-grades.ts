/** Glama step 34 — find the per-tool grades table on the overview page. */
import { writeSync } from "node:fs";
import { BrowserSession } from "../packages/mcp/dist/index.js";

function log(line: string): void {
  writeSync(1, line + "\n");
}

const session = await BrowserSession.connect({ port: 9223 });
const glamaTab = (await session.tabs()).find((t) => t.url?.includes("glama.ai"));
if (!glamaTab) throw new Error("no glama tab");
await session.attachToTab(glamaTab.targetId);
const full = (await session.evaluate("(document.body.innerText||'')")) as string;

// Extract the section around "Functions exposed"
const idx = full.indexOf("Functions exposed");
if (idx >= 0) {
  log(`== FUNCTIONS EXPOSED SECTION ==\n${full.slice(idx, idx + 2600).replace(/\n/g, " | ").slice(0, 2500)}`);
} else {
  log(`"Functions exposed" not on this page — page length: ${full.length}`);
  log(full.slice(-1500).replace(/\n/g, " | "));
}
