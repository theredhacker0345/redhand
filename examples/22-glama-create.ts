/** Glama step 10 — create the account, then open the Add Server flow. */
import { writeSync } from "node:fs";
import { BrowserSession } from "../packages/mcp/dist/index.js";

function log(line: string): void {
  writeSync(1, line + "\n");
}

const session = await BrowserSession.connect({ port: 9223 });
const glamaTab = (await session.tabs()).find((t) => t.url?.includes("glama.ai"));
if (!glamaTab) throw new Error("no glama tab");
await session.attachToTab(glamaTab.targetId);

const url = (await session.evaluate("location.href")) as string;
log(`current: ${String(url).slice(0, 90)}`);
const snap = await session.snapshot();

const createBtn = snap.elements.find((el) => /create account/i.test(String(el.text)));
if (createBtn) {
  log(`clicking "Create account" (element ${createBtn.index})...`);
  await session.click(createBtn.index, "natural");
  await new Promise((r) => setTimeout(r, 2500));
  await session.waitSettled();
}

const after = await session.snapshot();
const urlAfter = (await session.evaluate("location.href")) as string;
log(`after create: ${String(urlAfter).slice(0, 90)}`);
log(after.rendered.slice(0, 1000));

// If signed in, open the Add Server flow.
const addServer = after.elements.find((el) => el.text === "Add Server");
if (addServer) {
  log(`\nclicking "Add Server" (element ${addServer.index})...`);
  await session.click(addServer.index, "natural");
  await new Promise((r) => setTimeout(r, 2000));
  await session.waitSettled();
  const addSnap = await session.snapshot();
  const addUrl = (await session.evaluate("location.href")) as string;
  log(`== ADD SERVER: ${String(addUrl).slice(0, 90)} ==`);
  log(addSnap.rendered.slice(0, 1500));
}
