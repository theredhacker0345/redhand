/** Glama step 36 — sync AFTER the description-upgrade commit, then re-check grades. */
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
  target = await session.createTab("https://glama.ai/mcp/servers/theredhacker0345/redhand/admin/repository");
}
await session.attachToTab(target.targetId);
await session.navigate("https://glama.ai/mcp/servers/theredhacker0345/redhand/admin/repository");
await new Promise((r) => setTimeout(r, 1200));
const snap = await session.snapshot();
const syncBtn = snap.elements.find((el) => el.text === "Sync Server");
if (!syncBtn) throw new Error("Sync Server not found");
log("clicking Sync Server (post-upgrade commit)...");
await session.click(syncBtn.index, "natural");
await new Promise((r) => setTimeout(r, 6000));
await session.waitSettled();
log("synced");

// Verify the last-known commit is the upgraded one, then re-check grades.
await session.navigate("https://glama.ai/mcp/servers/theredhacker0345/redhand/schema");
await new Promise((r) => setTimeout(r, 1500));
const full = (await session.evaluate("(document.body.innerText||'')")) as string;
const idx = full.indexOf("Functions exposed");
if (idx >= 0) {
  log(`== FUNCTIONS EXPOSED ==\n${full.slice(idx, idx + 2400).replace(/\n/g, " | ").slice(0, 2300)}`);
} else {
  log("Functions exposed section not found");
}
