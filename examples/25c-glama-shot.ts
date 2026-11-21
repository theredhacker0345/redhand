/** Glama step 13c — click Add Server, screenshot the immediate UI. */
import { writeFileSync } from "node:fs";
import { BrowserSession } from "../packages/mcp/dist/index.js";

const session = await BrowserSession.connect({ port: 9223 });
const glamaTab = (await session.tabs()).find((t) => t.url?.includes("glama.ai"));
if (!glamaTab) throw new Error("no glama tab");
await session.attachToTab(glamaTab.targetId);
await session.navigate("https://glama.ai/mcp/servers");
const snap = await session.snapshot();
const addServer = snap.elements.find((el) => el.text === "Add Server");
if (!addServer) throw new Error("Add Server not found");
await session.click(addServer.index, "fast");
await new Promise((r) => setTimeout(r, 900));
const shot = await session.screenshot();
writeFileSync("C:/Users/Ubaid/.zcode/workspace/default/poc/glama-addserver-ui.png", Buffer.from(shot, "base64"));
process.stdout.write("screenshot saved: poc/glama-addserver-ui.png\n");
