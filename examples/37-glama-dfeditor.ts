/** Glama step 25b — dump the Dockerfile admin editor. */
import { writeSync } from "node:fs";
import { BrowserSession } from "../packages/mcp/dist/index.js";

function log(line: string): void {
  writeSync(1, line + "\n");
}

const session = await BrowserSession.connect({ port: 9223 });
const glamaTab = (await session.tabs()).find((t) => t.url?.includes("glama.ai"));
if (!glamaTab) throw new Error("no glama tab");
await session.attachToTab(glamaTab.targetId);
await session.navigate("https://glama.ai/mcp/servers/theredhacker0345/redhand/admin/dockerfile");
await new Promise((r) => setTimeout(r, 1200));
await session.scroll("down", 6);
await new Promise((r) => setTimeout(r, 500));
const snap = await session.snapshot();
log(`== DOCKERFILE EDITOR (${snap.elements.length} elements) ==`);
for (const el of snap.elements) {
  if (el.index >= 28) {
    log(
      `${el.index} <${el.tag}${el.role ? "[" + el.role + "]" : ""}>` +
        ` text="${(el.text ?? "").slice(0, 44)}" ph="${(el.placeholder ?? "").slice(0, 40)}"` +
        ` rect=(${Math.round(el.rect.x)},${Math.round(el.rect.y)},${Math.round(el.rect.width)},${Math.round(el.rect.height)})`,
    );
  }
}
const editors = (await session.evaluate(
  'JSON.stringify({textareas: Array.from(document.querySelectorAll("textarea")).length, codeMirrors: document.querySelectorAll(".cm-editor,.CodeMirror").length, monaco: document.querySelectorAll(".monaco-editor").length})',
)) as string;
log(`editor types: ${editors}`);
