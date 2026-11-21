/** Glama step 11 — open the Add Server form. */
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
await new Promise((r) => setTimeout(r, 2500));
await session.waitSettled();
const url = (await session.evaluate("location.href")) as string;
log(`== ADD SERVER: ${String(url).slice(0, 90)} ==`);
const snap2 = await session.snapshot();
log(snap2.rendered.slice(0, 1600));
