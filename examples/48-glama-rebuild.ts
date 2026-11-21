/** Glama step 37 — rebuild & release with the upgraded tool definitions, then re-check grades. */
import { writeSync } from "node:fs";
import { BrowserSession } from "../packages/mcp/dist/index.js";

function log(line: string): void {
  writeSync(1, line + "\n");
}

const session = await BrowserSession.connect({ port: 9223 });
const tabs = await session.tabs();
const glamaTab =
  tabs.find((t) => t.url?.includes("glama.ai") && t.url?.includes("redhand")) ??
  tabs.find((t) => t.url?.includes("glama.ai"));
if (!glamaTab) throw new Error("no glama tab — opening one");
await session.attachToTab(glamaTab.targetId);
await session.navigate("https://glama.ai/mcp/servers/theredhacker0345/redhand/admin/dockerfile");
await new Promise((r) => setTimeout(r, 1200));

// Confirm the last-known commit + build status before rebuilding.
const state = (await session.evaluate(
  '(function(){var t=document.body.innerText;var c=t.match(/Last known commit:\\s*([^\\n]+)/);var m=t.match(/Status\\t([^\\n]+)/);return JSON.stringify({commit:c?c[1]:"?",status:m?m[1]:"?"})})()',
)) as string;
log(`pre-build state: ${state}`);

// Scroll the Build & Release button into view and click it.
await session.evaluate(
  "document.querySelectorAll('button').forEach(function(b){if(b.textContent.trim()==='Build & Release'){b.scrollIntoView({block:'center'})}})",
);
await new Promise((r) => setTimeout(r, 400));
await session.evaluate(
  "document.querySelectorAll('button').forEach(function(b){if(b.textContent.trim()==='Build & Release'){b.click()}})",
);
log("Build & Release clicked — waiting for build + test...");
await new Promise((r) => setTimeout(r, 12000));
await session.waitSettled();

// Poll until the new build test completes (status success/failed).
for (let i = 0; i < 12; i++) {
  await new Promise((r) => setTimeout(r, 15000));
  const poll = (await session.evaluate(
    '(function(){var t=document.body.innerText;var m=t.match(/Status\\t([^\\n]+)/);var d=t.match(/Discovery score\\n?(\\d+)%/);return JSON.stringify({status:m?m[1]:"unknown",score:d?d[1]+"%":"?"})})()',
  )) as string;
  log(`poll ${i + 1}: ${poll}`);
  if (poll.includes("success") || poll.includes("failed") || poll.includes("error")) break;
}

// Re-check the per-tool grades.
await session.navigate("https://glama.ai/mcp/servers/theredhacker0345/redhand/schema");
await new Promise((r) => setTimeout(r, 1500));
const full = (await session.evaluate("(document.body.innerText||'')")) as string;
const idx = full.indexOf("Functions exposed");
if (idx >= 0) {
  log(`\n== FUNCTIONS EXPOSED ==\n${full.slice(idx, idx + 2400).replace(/\n/g, " | ").slice(0, 2300)}`);
} else {
  log("Functions exposed not found");
}
const shot = await session.screenshot();
writeFileSync("C:/Users/Ubaid/.zcode/workspace/default/poc/glama-grades-after.png", Buffer.from(shot, "base64"));
log("screenshot saved: poc/glama-grades-after.png");
