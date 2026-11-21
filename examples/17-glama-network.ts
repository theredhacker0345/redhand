/** Glama step 7b — inspect network entries from the OAuth callback. */
import { writeSync } from "node:fs";
import { BrowserSession } from "../packages/mcp/dist/index.js";

function log(line: string): void {
  writeSync(1, line + "\n");
}

const session = await BrowserSession.connect({ port: 9223 });
const glamaTab = (await session.tabs()).find((t) => t.url?.includes("glama.ai"));
if (!glamaTab) throw new Error("no glama tab");
await session.attachToTab(glamaTab.targetId);
const entries = session.network();
log(`== NETWORK (${entries.length}) ==`);
for (const e of entries) {
  log(`${e.method} ${e.status ?? "..."} ${e.url.slice(0, 140)}`);
}
const pageState = (await session.evaluate(
  'JSON.stringify({visibility: document.visibilityState, body: (document.body.innerText||"").slice(0,300)})',
)) as string;
log(`page: ${pageState}`);
