/**
 * Live bridge E2E probe: real Brave + real MV3 extension through BridgeHub.
 * Launches Brave with the unpacked bridge, waits for the extension to pair,
 * lists tabs, attaches, and evaluates 1+1 in a real page.
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { CdpClient } from "../packages/core/dist/index.js";
import { BridgeHub } from "../packages/mcp/dist/bridge-hub.js";

function log(line: string): void {
  process.stderr.write(line + "\n");
}

// Empty token = dev pairing for this probe only (loopback-only bind still applies).
const hub = new BridgeHub({ port: 9223, token: "" });
await hub.start();
log("hub on 9223");

const profile = "C:\\Users\\Ubaid\\.zcode\\workspace\\default\\poc\\bridge-e2e-profile";
mkdirSync(profile, { recursive: true });
const extPath = "C:\\Users\\Ubaid\\.zcode\\workspace\\default\\redhand\\bridge";
const brave = "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe";
const proc = spawn(brave, [
  `--user-data-dir=${profile}`,
  `--load-extension=${extPath}`,
  "--no-first-run",
  "--window-minimized",
  "about:blank",
], { detached: true, stdio: "ignore" });
proc.unref();
log("brave launched");

// wait for the extension to pair
const deadline = Date.now() + 30_000;
while (!hub.extensionConnected && Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 500));
}
if (!hub.extensionConnected) {
  log("FAIL: extension never paired");
  process.exit(1);
}
log("extension paired ✓");

const agent = await CdpClient.connect(hub.agentUrl);
const targets = await agent.getTargets();
log(`tabs through bridge: ${JSON.stringify(targets.map((t) => ({ id: t.targetId, t: t.title })))}`);

// attach to the first page tab and evaluate
const page = targets.find((t) => t.type === "page");
if (!page) {
  log("FAIL: no page target");
  process.exit(1);
}
const attach = await agent.send("Target.attachToTarget", { targetId: page.targetId, flatten: true });
const sessionId = (attach as { sessionId?: string }).sessionId;
log(`attached session=${sessionId}`);
const evalRes = await agent.send("Runtime.evaluate", { expression: "1+1", returnByValue: true }, { sessionId });
log(`Runtime.evaluate via bridge: ${JSON.stringify(evalRes)}`);
await agent.send("Target.detachFromTarget", { sessionId });
log("detached ✓");

agent.close();
hub.close();
writeFileSync(`${process.env.TEMP ?? "/tmp"}/bridge-e2e-ok`, "ok");
log("E2E COMPLETE");
process.exit(0);
