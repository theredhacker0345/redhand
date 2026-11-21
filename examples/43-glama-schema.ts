/** Glama step 32 — verify badge + schema listing. */
import { writeFileSync, writeSync } from "node:fs";
import { BrowserSession } from "../packages/mcp/dist/index.js";

function log(line: string): void {
  writeSync(1, line + "\n");
}

const session = await BrowserSession.connect({ port: 9223 });
const glamaTab = (await session.tabs()).find((t) => t.url?.includes("glama.ai"));
if (!glamaTab) throw new Error("no glama tab");
await session.attachToTab(glamaTab.targetId);

// Schema tab — Glama lists the server's tools.
await session.navigate("https://glama.ai/mcp/servers/theredhacker0345/redhand/schema");
await new Promise((r) => setTimeout(r, 1500));
const snap = await session.snapshot();
log(`== SCHEMA TAB (${snap.elements.length} elements) ==`);
const toolNames = snap.elements
  .map((el) => String(el.text ?? ""))
  .filter((t) => t.startsWith("browser_"));
log(toolNames.slice(0, 16).join("\n"));
const shot = await session.screenshot();
writeFileSync("C:/Users/Ubaid/.zcode/workspace/default/poc/glama-schema.png", Buffer.from(shot, "base64"));
log("screenshot saved: poc/glama-schema.png");
