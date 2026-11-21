/** Glama step 9 — user-activated authorize: scroll, index, real click. */
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
log(`on authorize page: ${String(url).slice(0, 90)}`);

// Bring the Authorize button into the viewport so the executor indexes it,
// then click it with a REAL trusted, user-activation-equivalent CDP press.
await session.evaluate(
  "document.querySelector('button[name=\"authorize\"][value=\"1\"]').scrollIntoView({block:'center'})",
);
await new Promise((r) => setTimeout(r, 400));
const snap2 = await session.snapshot();
const authorizeEl = snap2.elements.find((el) => el.text === "Authorize");
if (!authorizeEl) {
  log("Authorize button not indexed — full dump:");
  log(snap2.rendered.slice(0, 1200));
  throw new Error("Authorize button missing from snapshot");
}
log(`clicking Authorize (element ${authorizeEl.index}, natural humanize)...`);
await session.click(authorizeEl.index, "natural");
await new Promise((r) => setTimeout(r, 5000));
await session.waitSettled();

url = (await session.evaluate("location.href")) as string;
log(`after authorize: ${String(url).slice(0, 110)}`);
const body = (await session.evaluate("(document.body.innerText||'').slice(0,200)")) as string;
log(`page: ${String(body).replace(/\n/g, " | ").slice(0, 200)}`);
