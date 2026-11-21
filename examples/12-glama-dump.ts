/** Glama step 3 — full element dump of the sign-in page. */
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
log(`== SIGN-IN PAGE FULL DUMP (${snap.elements.length} elements) ==`);
for (const el of snap.elements) {
  log(
    `${el.index} <${el.tag}${el.role ? "[" + el.role + "]" : ""}>` +
      ` text="${el.text ?? ""}" aria="${el.ariaLabel ?? ""}" ph="${el.placeholder ?? ""}"` +
      ` href="${el.href ?? ""}" rect=(${Math.round(el.rect.x)},${Math.round(el.rect.y)},${Math.round(el.rect.width)},${Math.round(el.rect.height)})`,
  );
}
