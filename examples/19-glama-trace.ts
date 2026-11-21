/** Glama step 8b — filtered trace: find the OAuth callback + failures. */
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
log(`== TRACE (${entries.length} total) — callback + failures + github ==`);
for (const e of entries) {
  const interesting =
    e.url.includes("code=") ||
    e.url.includes("oauth") ||
    e.url.includes("sign-in") ||
    e.url.includes("login") ||
    (e.status !== undefined && e.status >= 400);
  if (interesting) {
    log(`${e.method} ${e.status ?? "..."} ${e.url.slice(0, 140)}`);
  }
}
const body = (await session.evaluate(
  'JSON.stringify({toast: (document.getElementById("redhand-tab-toast")||{}).textContent || null, body: (document.body.innerText||"").slice(0,250)})',
)) as string;
log(`page: ${body}`);
