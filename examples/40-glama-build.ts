/** Glama step 28 — fill build config editors, trigger Build & Release. */
import { writeFileSync, writeSync } from "node:fs";
import { BrowserSession } from "../packages/mcp/dist/index.js";

function log(line: string): void {
  writeSync(1, line + "\n");
}

const session = await BrowserSession.connect({ port: 9223 });
const glamaTab = (await session.tabs()).find((t) => t.url?.includes("glama.ai"));
if (!glamaTab) throw new Error("no glama tab");
await session.attachToTab(glamaTab.targetId);

const BUILD_STEPS = '["npm install -g pnpm@12","pnpm install --frozen-lockfile","pnpm build"]';
const CMD_ARGS = '["node","packages/mcp/dist/index.js"]';

async function fillCm(index: number, content: string): Promise<void> {
  await session.evaluate(
    `(function(){var c=document.querySelectorAll(".cm-editor")[${index}];var m=c&&c.querySelector(".cm-content");if(m){m.focus();}})()`,
  );
  await session.pressKey("ctrl+a");
  await session.insertTextAtFocus(content);
  await new Promise((r) => setTimeout(r, 200));
}

// Build steps editor (index 0), CMD arguments editor (index 1).
await fillCm(0, BUILD_STEPS);
log("build steps filled");
await fillCm(1, CMD_ARGS);
log("cmd arguments filled");

// Verify the hidden selects synced.
const raw = (await session.evaluate(
  'JSON.stringify({steps: document.querySelector("select[name=buildSteps]").value, cmd: document.querySelector("select[name=cmdArguments]").value})',
)) as string;
const synced = JSON.parse(raw) as { steps: string; cmd: string };
log(`synced steps: ${synced.steps.slice(0, 80)}`);
log(`synced cmd: ${synced.cmd.slice(0, 80)}`);

// Scroll to the Build & Release button and click it.
await session.evaluate(
  "document.querySelectorAll('button').forEach(function(b){if(b.textContent.trim()==='Build & Release'){b.scrollIntoView({block:'center'})}})",
);
await new Promise((r) => setTimeout(r, 400));
await session.evaluate(
  "document.querySelectorAll('button').forEach(function(b){if(b.textContent.trim()==='Build & Release'){b.click()}})",
);
log("Build & Release clicked — waiting for the build...");
await new Promise((r) => setTimeout(r, 8000));
const body = (await session.evaluate("(document.body.innerText||'').slice(0,900)")) as string;
log(`page after build: ${String(body).replace(/\n/g, " | ").slice(0, 700)}`);
const shot = await session.screenshot();
writeFileSync("C:/Users/Ubaid/.zcode/workspace/default/poc/glama-build.png", Buffer.from(shot, "base64"));
log("screenshot saved: poc/glama-build.png");
