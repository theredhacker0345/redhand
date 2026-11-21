/**
 * Example 1 — attach, snapshot, click by index, read state-after.
 * Run: node --experimental-strip-types examples/01-snapshot-click.ts
 */
import { BrowserSession } from "../packages/mcp/dist/index.js";
import { renderSnapshot } from "../packages/core/dist/index.js";

const session = await BrowserSession.connect({ port: 9222 });

const snap = await session.snapshot();
process.stdout.write(`== SNAPSHOT (${snap.elements.length} elements) ==\n${renderSnapshot(snap.elements)}\n`);

// Click element index 1 with natural humanization; the click returns the
// post-click state diff + any new network requests.
await session.click(1, "natural");
const after = await session.snapshot();
process.stdout.write(`== AFTER CLICK ==\n${renderSnapshot(after.elements)}\n`);

await session.detach();
