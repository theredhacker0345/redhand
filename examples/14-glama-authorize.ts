/** Glama step 5 — full dump of the GitHub OAuth authorize page + click. */
import { writeSync } from "node:fs";
import { BrowserSession } from "../packages/mcp/dist/index.js";

function log(line: string): void {
  writeSync(1, line + "\n");
}

const session = await BrowserSession.connect({ port: 9223 });
const ghTab = (await session.tabs()).find((t) => t.url?.includes("github.com/login"));
if (!ghTab) throw new Error("no github oauth tab");
await session.attachToTab(ghTab.targetId);
const snap = await session.snapshot();
log(`== OAUTH PAGE FULL DUMP (${snap.elements.length} elements) ==`);
for (const el of snap.elements) {
  log(
    `${el.index} <${el.tag}${el.type ? "[" + el.type + "]" : ""}>` +
      ` text="${(el.text ?? "").slice(0, 40)}" aria="${el.ariaLabel ?? ""}"` +
      ` rect=(${Math.round(el.rect.x)},${Math.round(el.rect.y)},${Math.round(el.rect.width)},${Math.round(el.rect.height)})`,
  );
}
