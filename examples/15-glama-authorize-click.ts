/** Glama step 6 — click Authorize, verify redirect + signed-in session. */
import { writeSync } from "node:fs";
import { BrowserSession } from "../packages/mcp/dist/index.js";

function log(line: string): void {
  writeSync(1, line + "\n");
}

const session = await BrowserSession.connect({ port: 9223 });
const ghTab = (await session.tabs()).find((t) => t.url?.includes("github.com"));
if (!ghTab) throw new Error("no github tab");
await session.attachToTab(ghTab.targetId);

await session.evaluate(
  `document.querySelector('button[name="authorize"][value="1"]').click()`,
);
log("authorize clicked — waiting for redirect...");
await new Promise((r) => setTimeout(r, 2500));
await session.waitSettled();

const url = (await session.evaluate("location.href")) as string;
log(`URL now: ${String(url).slice(0, 110)}`);
const title = (await session.evaluate("document.title")) as string;
log(`title: ${String(title).slice(0, 80)}`);
