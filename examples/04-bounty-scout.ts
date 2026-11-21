/**
 * Example 4 — LIVE bounty scout: redhand drives the user's real logged-in
 * browser to discover bug bounty programs. Dogfooding session: every layer
 * (CDP client, executor injection, index layer, humanized navigation) runs
 * against a real browser.
 *
 * Run: node --experimental-strip-types examples/04-bounty-scout.ts
 */
import { writeSync } from "node:fs";
import { BrowserSession } from "../packages/mcp/dist/index.js";
import { renderSnapshot } from "../packages/core/dist/index.js";

const PORT = Number(process.env["REDHAND_CDP_PORT"] ?? 9223);
// Piped stdout on Windows is async-buffered — sync writes survive process death.
function log(line: string): void {
  writeSync(1, line + "\n");
}

const session = await BrowserSession.connect({ port: PORT });

// 1. What is open right now?
const tabs = await session.tabs();
log(`== TABS (${tabs.length}) ==`);
for (const t of tabs) {
  log(`${t.targetId.slice(0, 8)}  ${t.title?.slice(0, 50)}  ${t.url?.slice(0, 65)}`);
}

// 2. Find an existing huntr tab, or open one (reuses the logged-in session).
const huntrTab = tabs.find((t) => t.url?.includes("huntr.com"));
if (huntrTab) {
  await session.attachToTab(huntrTab.targetId);
  log("attached to existing huntr tab");
} else {
  await session.createTab("https://huntr.com");
  log("opened fresh huntr tab");
}

// 3. Land on huntr home and discover the real bounty-list link (404-proof).
await session.navigate("https://huntr.com");
const home = await session.snapshot();
log(`\n== HUNTR HOME (${home.elements.length} elements) ==`);
const listLink = home.elements.find(
  (el) => (el.href?.includes("bounties") || el.href?.includes("challenges")) && (el.text ?? "").length > 2,
);
log(`list link found: ${listLink ? `${listLink.index} ${listLink.text} -> ${listLink.href}` : "none"}`);

// 4. Follow the discovered link by INDEX with a humanized click (dogfood the
//    whole operator loop), then snapshot the bounty list.
if (listLink) {
  await session.click(listLink.index, "natural");
  await session.waitSettled();
} else {
  await session.navigate("https://huntr.com/challenges");
}
const list = await session.snapshot();
log(`\n== LIST PAGE: ${await session.evaluate("location.href")} ==`);
log(renderSnapshot(list.elements).slice(0, 3500));

// 5. Extract program entries.
const entries = list.elements
  .filter((el) => el.href?.includes("/challenges/") || el.href?.includes("/bounties/"))
  .map((el) => `${el.text ?? el.ariaLabel ?? "?"} -> ${el.href}`);
if (entries.length > 0) {
  log(`\n== PROGRAM ENTRIES (${entries.length}) ==`);
  for (const e of entries.slice(0, 25)) {
    log(e);
  }
}

log(`\nnetwork captured: ${session.network().length} requests`);
await session.detach();
log("done");
