/**
 * Overlay verification: attach, click with humanized path, capture screenshot
 * showing the banner + red cursor on the page.
 */
import { writeFileSync } from "node:fs";
import { BrowserSession } from "../packages/mcp/dist/index.js";

const session = await BrowserSession.connect({ port: 9223 });
const huntrTab = (await session.tabs()).find((t) => t.url?.includes("huntr.com"));
if (huntrTab) {
  await session.attachToTab(huntrTab.targetId);
} else {
  await session.createTab("https://huntr.com");
}
await session.navigate("https://huntr.com");
const snap = await session.snapshot();

// Humanized click on the Challenges link — cursor animates, ripple fires.
const link = snap.elements.find((el) => el.href?.includes("challenges") || el.text?.includes("Challenges"));
if (link) {
  await session.click(link.index, "natural");
  await session.waitSettled();
}

// Capture the page WITH the banner + cursor visible.
const shot = await session.screenshot();
writeFileSync("C:/Users/Ubaid/.zcode/workspace/default/poc/redhand-overlay-verify.png", Buffer.from(shot, "base64"));
process.stdout.write("screenshot saved: poc/redhand-overlay-verify.png\n");

// Land back on the challenges list and capture once more (post-click state).
await session.navigate("https://huntr.com/challenges");
const shot2 = await session.screenshot();
writeFileSync("C:/Users/Ubaid/.zcode/workspace/default/poc/redhand-challenges-verify.png", Buffer.from(shot2, "base64"));
process.stdout.write("challenges screenshot saved\n");

await session.detach();
process.stdout.write("done\n");
