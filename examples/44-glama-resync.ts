/** Glama step 33 — sync server (re-fetch defs), then check per-tool grades. */
import { writeSync } from "node:fs";
import { BrowserSession } from "../packages/mcp/dist/index.js";

function log(line: string): void {
  writeSync(1, line + "\n");
}

const session = await BrowserSession.connect({ port: 9223 });
const glamaTab = (await session.tabs()).find((t) => t.url?.includes("glama.ai"));
if (!glamaTab) throw new Error("no glama tab");
await session.attachToTab(glamaTab.targetId);
await session.navigate("https://glama.ai/mcp/servers/theredhacker0345/redhand/admin/repository");
await new Promise((r) => setTimeout(r, 1200));
const snap = await session.snapshot();
const syncBtn = snap.elements.find((el) => el.text === "Sync Server");
if (!syncBtn) throw new Error("Sync Server not found");
log("clicking Sync Server (re-fetches tool definitions)...");
await session.click(syncBtn.index, "natural");
await new Promise((r) => setTimeout(r, 4000));
await session.waitSettled();
log("synced");

// Check the per-tool grades table.
await session.navigate("https://glama.ai/mcp/servers/theredhacker0345/redhand");
await new Promise((r) => setTimeout(r, 1500));
const page = (await session.evaluate("(document.body.innerText||'').slice(0, 2500)")) as string;
log(`\n== SERVER PAGE ==\n${String(page).replace(/\n/g, " | ").slice(0, 2200)}`);
