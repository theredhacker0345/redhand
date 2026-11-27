/** Glama step 36b — GitHub OAuth sign-in on the gif-profile instance, then admin dump. */
import { writeSync } from "node:fs";
import { BrowserSession } from "../packages/mcp/dist/index.js";

function log(line: string): void {
  writeSync(1, line + "\n");
}

const session = await BrowserSession.connect({ port: 9222 });
const tabs = await session.tabs();
const glamaTab =
  tabs.find((t) => t.url?.includes("glama.ai") && t.url?.includes("redhand")) ??
  tabs.find((t) => t.url?.includes("glama.ai"));
let target = glamaTab;
if (!target) {
  target = await session.createTab("https://glama.ai/sign-in");
}
await session.attachToTab(target.targetId);
await session.navigate("https://glama.ai/sign-in");
await new Promise((r) => setTimeout(r, 1200));
const snap = await session.snapshot();

// The GitHub OAuth button was executor element 3 on this page (proven flow).
const gh = snap.elements.find((el) => el.index === 3 && el.tag === "button");
if (!gh) {
  log("GitHub button not at index 3 — dumping page:");
  log(snap.rendered.slice(0, 1200));
  throw new Error("stop");
}
log("clicking GitHub OAuth (element 3, natural)...");
await session.click(gh.index, "natural");
await new Promise((r) => setTimeout(r, 2500));
await session.waitSettled();

let url = (await session.evaluate("location.href")) as string;
log(`url: ${String(url).slice(0, 110)}`);

// If GitHub authorize page appeared: scroll the button into view, index it,
// real click (user-activated — the proven technique).
if (String(url).includes("github.com/login/oauth")) {
  await session.evaluate(
    'document.querySelector(\'button[name="authorize"][value="1"]\')?.scrollIntoView({block:"center"})',
  );
  await new Promise((r) => setTimeout(r, 500));
  const snap2 = await session.snapshot();
  const authBtn = snap2.elements.find((el) => el.text === "Authorize");
  if (authBtn) {
    log(`clicking Authorize (element ${authBtn.index}, natural)...`);
    await session.click(authBtn.index, "natural");
    await new Promise((r) => setTimeout(r, 4000));
    await session.waitSettled();
    url = (await session.evaluate("location.href")) as string;
    log(`url after authorize: ${String(url).slice(0, 110)}`);
  } else {
    log("no Authorize button indexed — dumping:");
    log(snap2.rendered.slice(0, 800));
  }
}

// Verify signed in, then go to the Dockerfile admin.
await session.navigate("https://glama.ai/mcp/servers/theredhacker0345/redhand/admin/dockerfile");
await new Promise((r) => setTimeout(r, 1500));
const snap3 = await session.snapshot();
log(`== ADMIN DOCKERFILE (${snap3.elements.length} elements) ==`);
log(snap3.rendered.slice(0, 2000));
const shot = await session.screenshot();
writeFileSync("C:/Users/Ubaid/.zcode/workspace/default/poc/glama-admin-dockerfile.png", Buffer.from(shot, "base64"));
log("screenshot saved: poc/glama-admin-dockerfile.png");
