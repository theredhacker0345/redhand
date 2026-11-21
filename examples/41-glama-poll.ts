/** Glama step 30 — check the test run result + take the screenshot. */
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
writeFileSync("C:/Users/Ubaid/.zcode/workspace/default/poc/glama-build-result.png", Buffer.from(shot, "base64"));
log("screenshot saved: poc/glama-build-result.png");

// Click into the recent test entry for its detailed status.
const snap = await session.snapshot();
const testEntry = snap.elements.find((el) => String(el.text).includes("01a1ff3f") || String(el.text).includes("0.1.0"));
if (testEntry) {
  log(`clicking test entry (element ${testEntry.index}, "${String(testEntry.text).slice(0, 40)}")...`);
  await session.click(testEntry.index, "fast");
  await new Promise((r) => setTimeout(r, 2500));
  await session.waitSettled();
  const url = (await session.evaluate("location.href")) as string;
  log(`test detail url: ${String(url).slice(0, 110)}`);
  const snap2 = await session.snapshot();
  log(snap2.rendered.slice(0, 1800));
  const shot2 = await session.screenshot();
  writeFileSync(
    "C:/Users/Ubaid/.zcode/workspace/default/poc/glama-test-detail.png",
    Buffer.from(shot2, "base64"),
  );
  log("test detail screenshot saved");
} else {
  log("test entry not found in snapshot");
}
