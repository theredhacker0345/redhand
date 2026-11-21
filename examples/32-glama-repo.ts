/** Glama step 20 — Repository admin: Dockerfile editor + checks. */
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
const repo = snap.elements.find((el) => el.text === "Repository");
if (!repo) throw new Error("Repository admin link not found");
log(`clicking Repository (element ${repo.index})...`);
await session.click(repo.index, "natural");
await new Promise((r) => setTimeout(r, 2000));
await session.waitSettled();
const url = (await session.evaluate("location.href")) as string;
log(`url: ${String(url).slice(0, 120)}`);
const snap2 = await session.snapshot();
log(snap2.rendered.slice(0, 2200));
const shot = await session.screenshot();
writeFileSync("C:/Users/Ubaid/.zcode/workspace/default/poc/glama-repository-admin.png", Buffer.from(shot2 ?? shot, "base64"));
log("screenshot saved: poc/glama-repository-admin.png");
