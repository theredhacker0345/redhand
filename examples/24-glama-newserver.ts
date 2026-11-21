/** Glama step 12 — try direct new-server URLs, else click Add Server again. */
import { writeSync } from "node:fs";
import { BrowserSession } from "../packages/mcp/dist/index.js";

function log(line: string): void {
  writeSync(1, line + "\n");
}

const session = await BrowserSession.connect({ port: 9223 });
const glamaTab = (await session.tabs()).find((t) => t.url?.includes("glama.ai"));
if (!glamaTab) throw new Error("no glama tab");
await session.attachToTab(glamaTab.targetId);

for (const url of ["https://glama.ai/mcp/servers/new", "https://glama.ai/mcp/servers/add", "https://glama.ai/mcp/servers/submit"]) {
  await session.navigate(url);
  const title = (await session.evaluate("document.title")) as string;
  const body = (await session.evaluate("(document.body.innerText||'').slice(0,200)")) as string;
  log(`-- ${url}\n   title: ${title.slice(0, 60)} | body: ${String(body).replace(/\n/g, " | ").slice(0, 120)}`);
}
