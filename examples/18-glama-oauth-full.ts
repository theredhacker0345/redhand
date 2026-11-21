/** Glama step 8c — full OAuth round-trip: click Authorize button, filter trace. */
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
log(`after github-button click: ${String(url).slice(0, 110)}`);

if (String(url).includes("github.com/login/oauth")) {
  await session.evaluate(
    'document.querySelector(\'button[name="authorize"][value="1"]\').click()',
  );
  log("Authorize button clicked");
  await new Promise((r) => setTimeout(r, 4000));
  await session.waitSettled();
  url = (await session.evaluate("location.href")) as string;
  log(`after authorize: ${String(url).slice(0, 110)}`);
}

const entries = session.network();
log(`\n== TRACE (${entries.length} total) — callback + failures ==`);
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
  'JSON.stringify({signedIn: !document.body.innerText.includes("Sign In\\nSign Up"), body: (document.body.innerText||"").slice(0,250)})',
)) as string;
log(`page: ${body}`);
