/** Glama step 2 — sign in via GitHub OAuth, verify session. */
import { writeSync } from "node:fs";
import { BrowserSession } from "../packages/mcp/dist/index.js";

function log(line: string): void {
  writeSync(1, line + "\n");
}
function brief(elements: Array<Record<string, unknown>>): string {
  return elements
    .map((el) => `${el["index"]} <${el["tag"]}> "${String(el["text"] ?? el["ariaLabel"] ?? "").slice(0, 36)}" ${(el["href"] ?? "") as string}`.slice(0, 110))
    .filter((l) => l.length > 14)
    .join("\n");
}

const session = await BrowserSession.connect({ port: 9223 });
const tabs = await session.tabs();
const glamaTab = tabs.find((t) => t.url?.includes("glama.ai"));
if (!glamaTab) throw new Error("no glama tab — run step 1");
await session.attachToTab(glamaTab.targetId);
const snap = await session.snapshot();

// 1. click Sign In
const signIn = snap.elements.find((el) => el.text === "Sign In");
if (!signIn) throw new Error("Sign In element not found");
log("clicking Sign In...");
await session.click(signIn.index, "fast");
await session.waitSettled();

// 2. find the GitHub login option on the sign-in page
const signSnap = await session.snapshot();
const urlNow = (await session.evaluate("location.href")) as string;
log(`sign-in page: ${urlNow}`);
log(brief(signSnap.elements).slice(0, 1600));
const gh = signSnap.elements.find(
  (el) => (el.text ?? "").toLowerCase().includes("github") || (el.href ?? "").includes("github"),
);
if (gh) {
  log(`clicking GitHub entry (${gh.index})...`);
  await session.click(gh.index, "fast");
  await session.waitSettled();
  const after = await session.snapshot();
  const urlAfter = (await session.evaluate("location.href")) as string;
  log(`after GitHub: ${urlAfter}`);
  log(brief(after.elements).slice(0, 1200));
} else {
  log("no GitHub option found — inspect the snapshot above");
}
