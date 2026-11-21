/**
 * GIF demo capture — redhand operates a styled sandbox demo page while
 * frames are captured concurrently. Frames assemble into a GIF afterwards
 * (WSL + Pillow). Never touches live third-party pages.
 * Run: node --experimental-strip-types examples/09-gif-demo.ts
 */
import { writeFileSync } from "node:fs";
import { BrowserSession } from "../packages/mcp/dist/index.js";

const PORT = Number(process.env["REDHAND_CDP_PORT"] ?? 9223);
const FRAME_DIR = "C:/Users/Ubaid/.zcode/workspace/default/poc/frames";
let frameIdx = 0;

const DEMO_PAGE_HTML = `
(function () {
  document.documentElement.innerHTML = ''
    + '<head><style>'
    + 'body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;'
    + 'background:radial-gradient(circle at 30% 20%, #1a1f2e 0%, #0B0E14 60%);'
    + 'font-family:system-ui,sans-serif;color:#E6E9EF}'
    + '.card{background:rgba(17,24,39,.92);border:1px solid rgba(255,59,78,.45);'
    + 'border-radius:6px;padding:34px 38px;width:380px;box-shadow:0 20px 60px rgba(0,0,0,.6)}'
    + 'h1{font-size:20px;margin:0 0 4px}.brand{color:#FF3B4E}p{margin:0 0 22px;color:#8B93A5;font-size:12.5px}'
    + 'label{display:block;font-size:11px;color:#8B93A5;margin:14px 0 5px;letter-spacing:.4px}'
    + 'input{width:100%;box-sizing:border-box;padding:10px 12px;font-size:14px;color:#E6E9EF;'
    + 'background:#0B0E14;border:1px solid #2a3142;border-radius:4px;outline:none}'
    + 'input:focus{border-color:#FF3B4E}'
    + 'button{width:100%;margin-top:24px;padding:12px;font-size:14px;font-weight:700;color:#fff;'
    + 'background:#FF3B4E;border:none;border-radius:4px;cursor:pointer}'
    + '.ok{display:flex;gap:12px;align-items:center}'
    + '.ok h1{color:#FF3B4E}'
    + '</style></head>'
    + '<body><div class="card" id="card">'
    + '<h1><span class="brand">redhand</span> demo console</h1>'
    + '<p>an agent is operating this form</p>'
    + '<label>AGENT IDENTITY</label><input id="f1" placeholder="agent identity">'
    + '<label>ACCESS PHRASE</label><input id="f2" placeholder="access phrase">'
    + '<button id="go">Operate</button>'
    + '</div></body>';
  document.getElementById('go').addEventListener('click', function () {
    var card = document.getElementById('card');
    card.innerHTML = '<div style="display:flex;gap:12px;align-items:center">'
      + '<svg width="34" height="34" viewBox="0 0 24 24"><path d="M4 2 L20 12 L12 13.5 L15.5 21 L13 22 L9.5 14.5 L4 19 Z" fill="#FF3B4E" stroke="#fff"/></svg>'
      + '<div><h1>Access granted</h1>'
      + '<p style="margin:0">the agent operated this form - visible, precise, humanized</p></div></div>';
  });
})();
`;

const session = await BrowserSession.connect({ port: PORT });

// Isolated sandbox tab with the styled demo page.
await session.createTab("about:blank");
await session.evaluate(DEMO_PAGE_HTML);
await session.evaluate(
  "window.__redhand.clear(); document.querySelectorAll('[data-redhand-id]').forEach(function(e){e.removeAttribute('data-redhand-id')}); 'demo-ready'",
);

let capturing = true;
const frames: string[] = [];
const captureLoop = (async () => {
  while (capturing) {
    try {
      const data = await session.screenshot();
      frames.push(data);
    } catch {
      // capture raced an action — skip this frame
    }
  }
})();

await new Promise((r) => setTimeout(r, 700));
const snap = await session.snapshot();

// ghost-type the user field (cadence + typos — the signature visual)
const emailEl = snap.elements.find((el) => el.placeholder === "agent identity");
if (emailEl) await session.type(emailEl.index, "agent@redhand.dev", "ghost");

// humanized click into the access field, then natural fill
const accessEl = snap.elements.find((el) => el.placeholder === "access phrase");
if (accessEl) {
  await session.click(accessEl.index, "natural");
  await session.type(accessEl.index, "correct-horse-battery-staple", "natural");
}

// submit with a humanized click — the page swaps to its welcome state
const submit = snap.elements.find((el) => el.text === "Operate");
if (submit) await session.click(submit.index, "natural");

await new Promise((r) => setTimeout(r, 900));
capturing = false;
await captureLoop;

for (const data of frames) {
  writeFileSync(`${FRAME_DIR}/f${String(frameIdx++).padStart(3, "0")}.png`, Buffer.from(data, "base64"));
}
process.stdout.write(`captured ${frames.length} frames -> ${FRAME_DIR}\n`);
await session.detach();
