/** Glama step 7 — verify signed-in state on the servers page. */
import { writeSync } from "node:fs";
import { BrowserSession } from "../packages/mcp/dist/index.js";

function log(line: string): void {
  writeSync(1, line + "\n");
}

const session = await BrowserSession.connect({ port: 9223 });
const glamaTab = (await session.tabs()).find((t) => t.url?.includes("glama.ai"));
if (!glamaTab) throw new Error("no glama tab");
await session.attachToTab(glamaTab.targetId);
await session.navigate("https://glama.ai/mcp/servers");
const snap = await session.snapshot();

const signIn = snap.elements.find((el) => el.text === "Sign In");
const addServer = snap.elements.find((el) => el.text === "Add Server");
log(`Sign In button present: ${signIn ? "NO — signed in" : "wait, checking"}`);
log(`"Sign In" element found: ${signIn ? JSON.stringify({ index: signIn.index }) : "absent (good)"}`);
log(`"Add Server" element found: ${addServer ? "yes, index " + addServer.index : "no"}`);
const userMenu = snap.elements.find((el) => /theredhacker0345|darkmaster|account|avatar/i.test(String(el.text) + String(el.ariaLabel ?? "")));
log(`user-ish element: ${userMenu ? `${userMenu.index} "${userMenu.text}"` : "none in snapshot"}`);
log(snap.rendered.slice(0, 900));
