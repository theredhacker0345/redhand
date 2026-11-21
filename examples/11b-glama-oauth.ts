/** Glama step 2b — survey all page targets after the GitHub click. */
import { writeSync } from "node:fs";
import { BrowserSession } from "../packages/mcp/dist/index.js";

function log(line: string): void {
  writeSync(1, line + "\n");
}

const session = await BrowserSession.connect({ port: 9223 });
const tabs = await session.tabs();
log(`== PAGES (${tabs.length}) ==`);
for (const t of tabs) {
  log(`${t.targetId.slice(0, 8)} ${t.title?.slice(0, 50)} | ${t.url?.slice(0, 90)}`);
}

// If a github.com tab exists, drive the OAuth authorize flow.
const ghTab = tabs.find((t) => t.url?.includes("github.com"));
if (ghTab) {
  await session.attachToTab(ghTab.targetId);
  const snap = await session.snapshot();
  log(`\n== GITHUB TAB (${snap.elements.length} elements) ==`);
  log(snap.rendered.slice(0, 1500));
  const authorize = snap.elements.find(
    (el) => /authoriz/i.test(String(el.text)) || /authoriz/i.test(String(el.ariaLabel ?? "")),
  );
  if (authorize) {
    log(`\nclicking authorize (${authorize.index})...`);
    await session.click(authorize.index, "fast");
    await session.waitSettled();
  } else {
    log("no authorize button found on github tab");
  }
  const url = (await session.evaluate("location.href")) as string;
  log(`github tab url now: ${String(url).slice(0, 100)}`);
}
