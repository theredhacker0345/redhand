/** Glama step 8d — requestSubmit with the Authorize submitter. */
import { writeSync } from "node:fs";
import { BrowserSession } from "../packages/mcp/dist/index.js";

function log(line: string): void {
  writeSync(1, line + "\n");
}

const session = await BrowserSession.connect({ port: 9223 });
const glamaTab = (await session.tabs()).find((t) => t.url?.includes("glama.ai"));
if (!glamaTab) throw new Error("no glama tab");
await session.attachToTab(glamaTab.targetId);
await session.navigate("https://glama.ai/sign-in");
const snap = await session.snapshot();
const gh = snap.elements.find((el) => el.index === 3 && el.tag === "button");
if (!gh) throw new Error("GitHub OAuth button not found");
log("clicking GitHub OAuth (element 3)...");
await session.evaluate("document.querySelectorAll('button')[1].click()");
await new Promise((r) => setTimeout(r, 2500));
await session.waitSettled();

let url = (await session.evaluate("location.href")) as string;
log(`on authorize page: ${String(url).slice(0, 100)}`);

await session.evaluate(
  `(function(){var b=document.querySelector('button[name="authorize"][value="1"]');if(b&&b.form){b.form.requestSubmit(b);}else if(b){b.click();}})()`,
);
log("requestSubmit(authorize) fired");
await new Promise((r) => setTimeout(r, 5000));
await session.waitSettled();
url = (await session.evaluate("location.href")) as string;
log(`after authorize: ${String(url).slice(0, 110)}`);

const entries = session.network();
log(`\n== TRACE (${entries.length}) ==`);
for (const e of entries) {
  if (e.url.includes("callback") || e.url.includes("code=") || (e.status !== undefined && e.status >= 300)) {
    log(`${e.method} ${e.status ?? "..."} ${e.url.slice(0, 150)}`);
  }
}
for (const e of entries.slice(-6)) {
  log(`${e.method} ${e.status ?? "..."} ${e.url.slice(0, 130)}`);
}
const body = (await session.evaluate("(document.body.innerText||'').slice(0,220)")) as string;
log(`page: ${String(body).replace(/\n/g, " | ").slice(0, 220)}`);
