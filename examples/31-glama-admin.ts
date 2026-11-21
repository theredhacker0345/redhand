/** Glama step 19 — screenshot server page + open Admin (Dockerfile/checks). */
import { writeFileSync, writeSync } from "node:fs";
import { BrowserSession } from "../packages/mcp/dist/index.js";

function log(line: string): void {
  writeSync(1, line + "\n");
}

const session = await BrowserSession.connect({ port: 9223 });
const glamaTab = (await session.tabs()).find((t) => t.url?.includes("glama.ai"));
if (!glamaTab) throw new Error("no glama tab");
await session.attachToTab(glamaTab.targetId);

const shot = await session.screenshot();
writeFileSync("C:/Users/Ubaid/.zcode/workspace/default/poc/glama-server-page.png", Buffer.from(shot, "base64"));
log("server page screenshot saved");

const snap = await session.snapshot();
const admin = snap.elements.find((el) => el.text === "Admin");
if (!admin) throw new Error("Admin link not found");
log(`clicking Admin (element ${admin.index})...`);
await session.click(admin.index, "natural");
await new Promise((r) => setTimeout(r, 2000));
await session.waitSettled();
const url = (await session.evaluate("location.href")) as string;
log(`admin url: ${String(url).slice(0, 110)}`);
const snap2 = await session.snapshot();
log(snap2.rendered.slice(0, 1800));
const shot2 = await session.screenshot();
writeFileSync("C:/Users/Ubaid/.zcode/workspace/default/poc/glama-admin.png", Buffer.from(shot2, "base64"));
log("admin screenshot saved: poc/glama-admin.png");
