/** Glama step 17 — fill GitHub repo URL, submit for review. */
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

const urlInput = snap.elements.find((el) => (el.placeholder ?? "").includes("owner/repository"));
if (!urlInput) throw new Error("GitHub URL input not found — is the wizard still open?");
log(`filling GitHub URL (element ${urlInput.index})...`);
await session.type(urlInput.index, "https://github.com/theredhacker0345/redhand", "natural");

const submitBtn = snap.elements.find((el) => /submit for review/i.test(String(el.text)));
if (!submitBtn) throw new Error("Submit for Review not found");
log(`clicking "${submitBtn.text}" (element ${submitBtn.index})...`);
await session.click(submitBtn.index, "natural");
await new Promise((r) => setTimeout(r, 3000));
await session.waitSettled();

const url = (await session.evaluate("location.href")) as string;
log(`after submit: ${String(url).slice(0, 110)}`);
const shot = await session.screenshot();
writeFileSync("C:/Users/Ubaid/.zcode/workspace/default/poc/glama-submitted.png", Buffer.from(shot, "base64"));
log("screenshot saved: poc/glama-submitted.png");
const body = (await session.evaluate("(document.body.innerText||'').slice(0,700)")) as string;
log(`page: ${String(body).replace(/\n/g, " | ").slice(0, 650)}`);
