/** Glama step 31 — view the build test result. */
import { writeFileSync, writeSync } from "node:fs";
import { BrowserSession } from "../packages/mcp/dist/index.js";

function log(line: string): void {
  writeSync(1, line + "\n");
}

const session = await BrowserSession.connect({ port: 9223 });
const glamaTab = (await session.tabs()).find((t) => t.url?.includes("glama.ai"));
if (!glamaTab) throw new Error("no glama tab");
await session.attachToTab(glamaTab.targetId);
const snap = await session.snapshot();
const viewTest = snap.elements.find((el) => /view build test/i.test(String(el.text)));
if (!viewTest) throw new Error("View build test link not found");
log(`clicking "View build test"...`);
await session.click(viewTest.index, "fast");
await new Promise((r) => setTimeout(r, 2500));
await session.waitSettled();
const url = (await session.evaluate("location.href")) as string;
log(`url: ${String(url).slice(0, 120)}`);
const body = (await session.evaluate("(document.body.innerText||'').slice(0,900)")) as string;
log(`page: ${String(body).replace(/\n/g, " | ").slice(0, 750)}`);
const shot = await session.screenshot();
writeFileSync("C:/Users/Ubaid/.zcode/workspace/default/poc/glama-build-test.png", Buffer.from(shot, "base64"));
log("screenshot saved: poc/glama-build-test.png");
