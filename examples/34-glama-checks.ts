/** Glama step 22 — find the checks UI. */
import { writeSync } from "node:fs";
import { BrowserSession } from "../packages/mcp/dist/index.js";

function log(line: string): void {
  writeSync(1, line + "\n");
}

const session = await BrowserSession.connect({ port: 9223 });
const glamaTab = (await session.tabs()).find((t) => t.url?.includes("glama.ai"));
if (!glamaTab) throw new Error("no glama tab");
await session.attachToTab(glamaTab.targetId);

for (const url of [
  "https://glama.ai/mcp/servers/theredhacker0345/redhand/admin/checks",
  "https://glama.ai/mcp/servers/theredhacker0345/redhand/checks",
]) {
  await session.navigate(url);
  const title = (await session.evaluate("document.title")) as string;
  const body = (await session.evaluate("(document.body.innerText||'').slice(0,600)")) as string;
  log(`-- ${url.slice(-30)}\n   title: ${title.slice(0, 60)}\n   body: ${String(body).replace(/\n/g, " | ").slice(0, 350)}\n`);
}
