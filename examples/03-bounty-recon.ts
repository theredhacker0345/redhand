/**
 * Example 3 — bounty recon: drive a logged-in session while capturing network.
 * Use only on targets you are authorized to test.
 * Run: node --experimental-strip-types examples/03-bounty-recon.ts
 */
import { BrowserSession } from "../packages/mcp/dist/index.js";

const session = await BrowserSession.connect({ port: 9222 });
const reconStart = Date.now();

// Navigate manually in your browser (or via evaluate) to the app area you are
// testing, then snapshot the interactive surface behind auth.
const snap = await session.snapshot();
process.stdout.write(`== SURFACE (${snap.elements.length}) ==\n`);

// Probe every button and form-looking element, recording what each fires.
for (const el of snap.elements) {
  if (el.tag === "button" || el.tag === "a") {
    const since = Date.now();
    await session.click(el.index, "fast");
    const requests = session.network(since);
    for (const req of requests) {
      process.stdout.write(`${el.index} <${el.tag}> "${el.text ?? ""}" -> ${req.method} ${req.status ?? "..."} ${req.url}\n`);
    }
    if (requests.some((r) => r.url.includes("/api/"))) {
      process.stdout.write(`   ^^ API hit from UI element ${el.index} — inspect manually\n`);
    }
  }
}

process.stdout.write(`recon window: ${Date.now() - reconStart}ms\n`);
await session.detach();
