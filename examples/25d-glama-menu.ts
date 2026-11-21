/** Glama step 13d — click Add Server, capture fast frames + tabs + snapshot. */
import { writeFileSync } from "node:fs";
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

const beforeTabs = (await session.tabs()).length;
await session.click(addServer.index, "fast");
await new Promise((r) => setTimeout(r, 250));
const shot1 = await session.screenshot();
writeFileSync("C:/Users/Ubaid/.zcode/workspace/default/poc/glama-menu-250ms.png", Buffer.from(shot1, "base64"));
await new Promise((r) => setTimeout(r, 500));
const snap2 = await session.snapshot();
const afterTabs = (await session.tabs()).length;
const url = (await session.evaluate("location.href")) as string;
log(`tabs: ${beforeTabs} -> ${afterTabs} | url: ${url.slice(0, 70)}`);
log(`snapshot elements after: ${snap2.elements.length}`);
const newElements = snap2.elements.filter((e) => e.index > snap.elements.length);
log(`new elements: ${newElements.length}`);
log(newElements.map((e) => `${e.index} <${e.tag}> "${String(e.text ?? e.ariaLabel ?? "").slice(0, 40)}"`).join("\n").slice(0, 1000));
log("shot saved: poc/glama-menu-250ms.png");
