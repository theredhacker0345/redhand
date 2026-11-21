/** Glama step 18 — verify the redhand server page + checks. */
import { writeFileSync, writeSync } from "node:fs";
import { BrowserSession } from "../packages/mcp/dist/index.js";

function log(line: string): void {
  writeSync(1, line + "\n");
}

const session = await BrowserSession.connect({ port: 9223 });
const glamaTab = (await session.tabs()).find((t) => t.url?.includes("glama.ai"));
if (!glamaTab) throw new Error("no glama tab");
await session.attachToTab(glamaTab.targetId);
await session.navigate("https://glama.ai/mcp/servers/theredhacker0345/redhand");
await new Promise((r) => setTimeout(r, 1500));
const snap = await session.snapshot();
const url = (await session.evaluate("location.href")) as string;
log(`page: ${String(url).slice(0, 100)}`);
log(snap.rendered.slice(0, 2000));
const shot = await session.screenshot();
writeFileSync("C:/Users/Ubaid/.zcode/workspace/default/poc/glama-server-page.png", Buffer.from(shot, "base64"));
log("screenshot saved: poc/glama-server-page.png");
