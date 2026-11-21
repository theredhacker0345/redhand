/** Glama step 16b — clear stray search text, fill wizard fields properly. */
import { writeFileSync, writeSync } from "node:fs";
import { BrowserSession } from "../packages/mcp/dist/index.js";

function log(line: string): void {
  writeSync(1, line + "\n");
}

const session = await BrowserSession.connect({ port: 9223 });
const glamaTab = (await session.tabs()).find((t) => t.url?.includes("glama.ai"));
if (!glamaTab) throw new Error("no glama tab");
await session.attachToTab(glamaTab.targetId);

// Clear the accidental search text from the last run.
await session.evaluate(
  'var s=document.querySelector("input[placeholder*=Search]");if(s){s.value="";s.dispatchEvent(new Event("input",{bubbles:true}));} "cleared"',
);
await session.navigate("https://glama.ai/mcp/servers");
const snap = await session.snapshot();
const addServer = snap.elements.find((el) => el.text === "Add Server");
if (!addServer) throw new Error("Add Server not found");
await session.click(addServer.index, "fast");
await new Promise((r) => setTimeout(r, 800));
const snap2 = await session.snapshot();
const tab = snap2.elements.find((el) => el.text === "Runs from source");
if (!tab) throw new Error("Runs from source tab missing");
await session.click(tab.index, "fast");
await new Promise((r) => setTimeout(r, 800));
const form = await session.snapshot();

// Name input: an <input> that is NOT the page search box.
const nameInput = form.elements.find(
  (el) => el.tag === "input" && !(el.placeholder ?? "").includes("Search"),
);
if (!nameInput) throw new Error("Wizard name input not found");
log(`filling name (element ${nameInput.index})...`);
await session.type(nameInput.index, "redhand", "natural");

const descArea = form.elements.find((el) => el.tag === "textarea");
if (descArea) {
  log(`filling description (element ${descArea.index})...`);
  await session.type(
    descArea.index,
    "Browser-automation MCP server: agents drive the user's real, logged-in browser via raw CDP with element-index precision, humanized input, secret redaction and network capture.",
    "natural",
  );
}

await session.scroll("down", 12);
await new Promise((r) => setTimeout(r, 500));
const snapDown = await session.snapshot();
log(`== FIELDS BELOW THE FOLD (${snapDown.elements.length} elements) ==`);
for (const el of snapDown.elements) {
  if (el.index > 40) {
    log(
      `${el.index} <${el.tag}${el.role ? "[" + el.role + "]" : ""}>` +
        ` text="${(el.text ?? "").slice(0, 40)}" ph="${el.placeholder ?? ""}" aria="${el.ariaLabel ?? ""}"` +
        ` rect=(${Math.round(el.rect.x)},${Math.round(el.rect.y)},${Math.round(el.rect.width)},${Math.round(el.rect.height)})`,
    );
  }
}
const shot = await session.screenshot();
writeFileSync("C:/Users/Ubaid/.zcode/workspace/default/poc/glama-wizard-state.png", Buffer.from(shot, "base64"));
log("screenshot saved: poc/glama-wizard-state.png");
