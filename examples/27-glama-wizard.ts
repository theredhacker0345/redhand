/** Glama step 15 — full wizard run in one session: open dropdown, choose type, dump form. */
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
log("clicking Add Server...");
await session.click(addServer.index, "fast");
await new Promise((r) => setTimeout(r, 800));
const snap2 = await session.snapshot();
const runsFromSource = snap2.elements.find((el) => el.text === "Runs from source");
if (!runsFromSource) throw new Error("Runs from source missing after dropdown");
log("clicking Runs from source...");
await session.click(runsFromSource.index, "fast");
await new Promise((r) => setTimeout(r, 900));
const snap3 = await session.snapshot();
log(`== WIZARD STATE (${snap3.elements.length} elements) ==`);
log(snap3.rendered.slice(0, 2600));

// Keep the session alive for the next phase.
process.stdout.write("SESSION-ALIVE\n");
await new Promise((r) => setTimeout(r, 600_000));
