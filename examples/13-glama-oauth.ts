/** Glama step 4 — click GitHub OAuth, authorize, verify session. */
import { writeSync } from "node:fs";
import { BrowserSession } from "../packages/mcp/dist/index.js";

function log(line: string): void {
  writeSync(1, line + "\n");
}

const session = await BrowserSession.connect({ port: 9223 });
const glamaTab = (await session.tabs()).find((t) => t.url?.includes("glama.ai"));
if (!glamaTab) throw new Error("no glama tab");
await session.attachToTab(glamaTab.targetId);
await session.navigate("https://glama.ai/sign-in");
const snap = await session.snapshot();

const ghButton = snap.elements.find((el) => el.index === 3);
if (!ghButton) throw new Error("GitHub button (index 3) not in snapshot");
log("clicking GitHub OAuth button (element 3)...");
await session.click(ghButton.index, "fast");
await new Promise((r) => setTimeout(r, 1500));
await session.waitSettled();

let url = (await session.evaluate("location.href")) as string;
log(`URL after click: ${String(url).slice(0, 110)}`);

// If GitHub authorize page appeared, click the green Authorize button.
let snapNow = await session.snapshot();
const authorize = snapNow.elements.find(
  (el) =>
    /authoriz/i.test(String(el.text)) ||
    (/^button$/i.test(el.tag) && /green|authoriz/i.test(String(el.ariaLabel ?? ""))),
);
if (authorize) {
  log(`clicking "${authorize.text ?? authorize.ariaLabel}" (element ${authorize.index})...`);
  await session.click(authorize.index, "fast");
  await new Promise((r) => setTimeout(r, 2000));
  await session.waitSettled();
  url = (await session.evaluate("location.href")) as string;
  log(`URL after authorize: ${String(url).slice(0, 110)}`);
  snapNow = await session.snapshot();
}

// Verify signed in: look for an account/avatar indicator (signed-in pages have
// a user menu; the sign-in page has the Email login form).
const signedIn = snapNow.elements.some(
  (el) => /sign out|log out|account|settings/i.test(String(el.text) + String(el.ariaLabel ?? "")),
);
log(`signed-in indicator: ${signedIn ? "YES" : "not found in snapshot"}`);
log(snapNow.rendered.slice(0, 1200));
