/**
 * Example 2 — humanized form fill: ghost typing (cadence + typos) vs natural.
 * Run: node --experimental-strip-types examples/02-form-fill.ts
 */
import { BrowserSession } from "../packages/mcp/dist/index.js";

const session = await BrowserSession.connect({ port: 9222 });
const snap = await session.snapshot();

// Find the first email-ish field and the first password-ish field by reading
// the snapshot — the agent picks indices the same way.
const emailIndex = snap.elements.findIndex((el) => el.placeholder?.includes("@") || el.tag === "input");
const passwordIndex = snap.elements.findIndex((el) => el.text === "password field");

if (emailIndex >= 0) {
  await session.type(emailIndex + 1, "user@example.com", "ghost");
}
if (passwordIndex >= 0) {
  await session.type(passwordIndex + 1, "correct-horse-battery-staple", "natural");
}

// Press Enter on the focused field (submit) and let the page settle.
await session.pressKey("enter");
await session.waitSettled();

process.stdout.write(`network entries captured: ${session.network().length}\n`);
await session.detach();
