/** Glama step 35b — open redhand schema page, check per-tool grades. */
import { writeSync } from "node:fs";
import { BrowserSession } from "../packages/mcp/dist/index.js";

function log(line: string): void {
  writeSync(1, line + "\n");
}

const session = await BrowserSession.connect({ port: 9223 });
const tabs = await session.tabs();
const glamaTab =
  tabs.find((t) => t.url?.includes("glama.ai") && t.url?.includes("redhand")) ??
  tabs.find((t) => t.url?.includes("glama.ai"));
let target = glamaTab;
if (!target) {
  target = await session.createTab("https://glama.ai/mcp/servers/theredhacker0345/redhand/schema");
}
await session.attachToTab(target.targetId);
await session.navigate("https://glama.ai/mcp/servers/theredhacker0345/redhand/schema");
await new Promise((r) => setTimeout(r, 1500));
const full = (await session.evaluate("(document.body.innerText||'')")) as string;
log(`page: ${(await session.evaluate("location.href")) as string}`);
const idx = full.indexOf("Functions exposed");
if (idx >= 0) {
  log(`== FUNCTIONS EXPOSED ==\n${full.slice(idx, idx + 2400).replace(/\n/g, " | ").slice(0, 2300)}`);
} else {
  log(`"Functions exposed" not found (page length ${full.length})`);
  const lines = full.split("\n").filter((l) => /rated|quality|maintenance|license|^[ABC]$|browser_/.test(l));
  log(lines.slice(0, 50).join(" | ").slice(0, 2200));
}
