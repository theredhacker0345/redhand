/** Glama step 14 — choose "Runs from source", dump the expanded form. */
import { writeSync } from "node:fs";
import { BrowserSession } from "../packages/mcp/dist/index.js";

function log(line: string): void {
  writeSync(1, line + "\n");
}

const session = await BrowserSession.connect({ port: 9223 });
const glamaTab = (await session.tabs()).find((t) => t.url?.includes("glama.ai"));
if (!glamaTab) throw new Error("no glama tab");
await session.attachToTab(glamaTab.targetId);
await session.navigate("https://glama.ai/mcp/servers");
const snap = await session.snapshot();
const addServer = snap.elements.find((el) => el.text === "Add Server");
if (!addServer) throw new Error("Add Server not found");
await session.click(addServer.index, "fast");
await new Promise((r) => setTimeout(r, 700));
const snap2 = await session.snapshot();
const runsFromSource = snap2.elements.find((el) => el.text === "Runs from source");
if (!runsFromSource) throw new Error("Runs from source not found — snapshot: " + snap2.rendered.slice(0, 300));
log(`clicking "Runs from source" (element ${runsFromSource.index})...`);
await session.click(runsFromSource.index, "fast");
await new Promise((r) => setTimeout(r, 800));
const snap3 = await session.snapshot();
log(`== EXPANDED FORM (${snap3.elements.length} elements) ==`);
log(snap3.rendered.slice(0, 2500));
