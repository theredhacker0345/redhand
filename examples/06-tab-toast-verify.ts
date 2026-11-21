/**
 * Example 6 — verify: banner shows tab name; toast appears on the tab the
 * user is looking at while redhand operates a background tab.
 * Run: node --experimental-strip-types examples/06-tab-toast-verify.ts
 */
import { writeFileSync } from "node:fs";
import { BrowserSession } from "../packages/mcp/dist/index.js";

const session = await BrowserSession.connect({ port: 9223 });
const tabs = await session.tabs();

// 1. Operate the huntr tab (background or foreground — CDP doesn't care).
const huntrTab = tabs.find((t) => t.url?.includes("huntr.com"));
if (huntrTab) {
  await session.attachToTab(huntrTab.targetId);
} else {
  await session.createTab("https://huntr.com/challenges");
}
await session.navigate("https://huntr.com/challenges");
const huntrVisibility = (await session.evaluate("document.visibilityState")) as string;
process.stdout.write(`huntr tab visibilityState: ${String(huntrVisibility)}\n`);

// 2. Humanized click in the huntr tab — broadcastToast fires on the visible tab.
const snap = await session.snapshot();
const link = snap.elements.find((el) => el.text === "Active" || el.text === "All");
if (link) {
  await session.click(link.index, "natural");
}
const shot1 = await session.screenshot();
writeFileSync("C:/Users/Ubaid/.zcode/workspace/default/poc/redhand-banner-tabname.png", Buffer.from(shot1, "base64"));
process.stdout.write("huntr screenshot (banner with tab name) saved\n");

// 3. Find the tab the user is looking at and screenshot its toast.
for (const t of await session.tabs()) {
  if (t.targetId === huntrTab?.targetId) continue;
  await session.attachToTab(t.targetId);
  const visibility = (await session.evaluate("document.visibilityState")) as string;
  process.stdout.write(`${t.title?.slice(0, 40)} -> ${String(visibility)}\n`);
  if (visibility === "visible") {
    const shot2 = await session.screenshot();
    writeFileSync(
      "C:/Users/Ubaid/.zcode/workspace/default/poc/redhand-toast-verify.png",
      Buffer.from(shot2, "base64"),
    );
    process.stdout.write("visible-tab screenshot (toast) saved\n");
    break;
  }
}

await session.detach();
process.stdout.write("done\n");
