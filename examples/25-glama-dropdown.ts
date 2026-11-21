/** Glama step 13 — click Add Server and dump the dropdown. */
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
log(`clicking "Add Server" (element ${addServer.index})...`);
await session.click(addServer.index, "natural");
await new Promise((r) => setTimeout(r, 1200));
const snap2 = await session.snapshot();
log(`== AFTER CLICK (${snap2.elements.length} elements) ==`);
log(snap2.rendered.slice(0, 2200));
const url = (await session.evaluate("location.href")) as string;
log(`url: ${url}`);
