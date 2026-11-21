/** Glama step 1 — attach, open glama.ai, find the submit/sign-in entry. */
import { writeSync } from "node:fs";
import { BrowserSession } from "../packages/mcp/dist/index.js";

function log(line: string): void {
  writeSync(1, line + "\n");
}

const session = await BrowserSession.connect({ port: 9223 });
const tabs = await session.tabs();
const glamaTab = tabs.find((t) => t.url?.includes("glama.ai"));
if (glamaTab) {
  await session.attachToTab(glamaTab.targetId);
  log("attached to existing glama tab");
} else {
  await session.createTab("https://glama.ai/mcp/servers");
  log("opened glama.ai/mcp/servers");
}

await session.navigate("https://glama.ai/mcp/servers");
const snap = await session.snapshot();
log(`== GLAMA SERVERS PAGE (${snap.elements.length} elements) ==`);
log(renderSnapshotLite(snap.elements));

function renderSnapshotLite(elements: Array<Record<string, unknown>>): string {
  return elements
    .map((el) => {
      const label = (el["text"] ?? el["ariaLabel"] ?? "") as string;
      const href = (el["href"] ?? "") as string;
      const tag = el["tag"] as string;
      const idx = el["index"] as number;
      return `${idx} <${tag}> "${String(label).slice(0, 40)}" ${href ? "-> " + String(href).slice(0, 60) : ""}`;
    })
    .filter((l) => l.length > 12)
    .join("\n");
}
