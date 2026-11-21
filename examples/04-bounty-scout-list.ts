/**
 * Example 4b — enumerate the full huntr challenges list.
 * Run: node --experimental-strip-types examples/04-bounty-scout-list.ts
 */
import { writeSync } from "node:fs";
import { BrowserSession } from "../packages/mcp/dist/index.js";
import { renderSnapshot } from "../packages/core/dist/index.js";

const PORT = Number(process.env["REDHAND_CDP_PORT"] ?? 9223);
function log(line: string): void {
  writeSync(1, line + "\n");
}

const session = await BrowserSession.connect({ port: PORT });
const huntrTab = (await session.tabs()).find((t) => t.url?.includes("huntr.com"));
if (huntrTab) {
  await session.attachToTab(huntrTab.targetId);
} else {
  await session.createTab("https://huntr.com/challenges");
}

await session.navigate("https://huntr.com/challenges");
const snap = await session.snapshot();
log(`== CHALLENGES PAGE (${snap.elements.length} elements) ==`);
log(renderSnapshot(snap.elements).slice(0, 5000));

const hrefs = new Map<string, string>();
for (const el of snap.elements) {
  if (el.href && (el.text ?? "").length > 2) {
    hrefs.set(el.href, el.text as string);
  }
}
log(`\n== UNIQUE LINKS (${hrefs.size}) ==`);
for (const [href, text] of hrefs) {
  log(`${text.slice(0, 70)} -> ${href}`);
}

// Click the "Active" filter to see live challenges only (humanized).
const activeEl = snap.elements.find((el) => el.text === "Active");
if (activeEl) {
  await session.click(activeEl.index, "fast");
  await session.waitSettled();
  const after = await session.snapshot();
  log(`\n== ACTIVE FILTER (${after.elements.length} elements) ==`);
  const activeLinks = new Set<string>();
  for (const el of after.elements) {
    if (el.href?.includes("/challenges/")) {
      activeLinks.add(`${el.text ?? "?"} -> ${el.href}`);
    }
  }
  for (const link of activeLinks) {
    log(link);
  }
}

log(`\nnetwork: ${session.network().length} requests`);
await session.detach();
log("done");
