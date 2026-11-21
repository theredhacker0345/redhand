/** Glama step 21 — Sync Server, then look for checks/Dockerfile UI. */
import { writeFileSync, writeSync } from "node:fs";
import { BrowserSession } from "../packages/mcp/dist/index.js";

function log(line: string): void {
  writeSync(1, line + "\n");
}

const session = await BrowserSession.connect({ port: 9223 });
const glamaTab = (await session.tabs()).find((t) => t.url?.includes("glama.ai"));
if (!glamaTab) throw new Error("no glama tab");
await session.attachToTab(glamaTab.targetId);
const snap = await session.snapshot();
const syncBtn = snap.elements.find((el) => el.text === "Sync Server");
if (!syncBtn) throw new Error("Sync Server not found");
log("clicking Sync Server...");
await session.click(syncBtn.index, "natural");
await new Promise((r) => setTimeout(r, 3000));
await session.waitSettled();
const url = (await session.evaluate("location.href")) as string;
log(`url: ${String(url).slice(0, 120)}`);
const snap2 = await session.snapshot();
log(snap2.rendered.slice(0, 1500));
const shot = await session.screenshot();
writeFileSync("C:/Users/Ubaid/.zcode/workspace/default/poc/glama-sync.png", Buffer.from(shot, "base64"));
log("screenshot saved: poc/glama-sync.png");
