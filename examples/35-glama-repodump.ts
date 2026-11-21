/** Glama step 23 — full dump of the Repository admin after sync. */
import { writeSync } from "node:fs";
import { BrowserSession } from "../packages/mcp/dist/index.js";

function log(line: string): void {
  writeSync(1, line + "\n");
}

const session = await BrowserSession.connect({ port: 9223 });
const glamaTab = (await session.tabs()).find((t) => t.url?.includes("glama.ai"));
if (!glamaTab) throw new Error("no glama tab");
await session.attachToTab(glamaTab.targetId);
await session.navigate("https://glama.ai/mcp/servers/theredhacker0345/redhand/admin/repository");
await new Promise((r) => setTimeout(r, 1500));
await session.scroll("down", 15);
await new Promise((r) => setTimeout(r, 600));
const snap = await session.snapshot();
log(`== REPOSITORY ADMIN FULL (${snap.elements.length} elements) ==`);
for (const el of snap.elements) {
  if (el.index >= 33) {
    log(
      `${el.index} <${el.tag}${el.role ? "[" + el.role + "]" : ""}>` +
        ` text="${(el.text ?? "").slice(0, 50)}" ph="${el.placeholder ?? ""}" aria="${el.ariaLabel ?? ""}"` +
        ` rect=(${Math.round(el.rect.x)},${Math.round(el.rect.y)},${Math.round(el.rect.width)},${Math.round(el.rect.height)})`,
    );
  }
}
const body = (await session.evaluate("(document.body.innerText||'').slice(0,1200)")) as string;
log(`\nbody text: ${String(body).replace(/\n/g, " | ").slice(0, 1000)}`);
