/** Glama step 25 — navigate to admin/dockerfile directly. */
import { writeSync } from "node:fs";
import { BrowserSession } from "../packages/mcp/dist/index.js";

function log(line: string): void {
  writeSync(1, line + "\n");
}

const session = await BrowserSession.connect({ port: 9223 });
const glamaTab = (await session.tabs()).find((t) => t.url?.includes("glama.ai"));
if (!glamaTab) throw new Error("no glama tab");
await session.attachToTab(glamaTab.targetId);
await session.navigate("https://glama.ai/mcp/servers/theredhacker0345/redhand/admin/dockerfile");
await new Promise((r) => setTimeout(r, 1500));
const url = (await session.evaluate("location.href")) as string;
const title = (await session.evaluate("document.title")) as string;
log(`url: ${String(url).slice(0, 120)}`);
log(`title: ${String(title).slice(0, 70)}`);
const snap = await session.snapshot();
log(`== DOCKERFILE ADMIN (${snap.elements.length} elements) ==`);
log(snap.rendered.slice(0, 2200));
const shot = await session.screenshot();
writeFileSync("C:/Users/Ubaid/.zcode/workspace/default/poc/glama-dockerfile-editor.png", Buffer.from(shot, "base64"));
log("screenshot saved: poc/glama-dockerfile-editor.png");
