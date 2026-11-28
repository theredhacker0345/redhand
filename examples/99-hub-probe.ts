/**
 * Live hub probe v2 — with hub debug logging.
 */
import { WebSocket } from "ws";
import { CdpClient } from "../packages/core/dist/index.js";
import { BridgeHub } from "../packages/mcp/dist/bridge-hub.js";

function log(line: string): void {
  process.stderr.write(line + "\n");
}

const hub = new BridgeHub({
  port: 0,
  token: "probe-token",
  debugLog: (line) => log(`HUB: ${line}`),
});
await hub.start();
const port = (hub as unknown as { port: number }).port;
log(`hub on ${port}`);

const ext = new WebSocket(`ws://127.0.0.1:${port}/?role=extension&token=probe-token`);
ext.on("open", () => log("ext: open"));
ext.on("message", (data) => {
  log(`ext recv: ${String(data).slice(0, 100)}`);
  const msg = JSON.parse(String(data)) as { op: string; reqId?: string };
  if (msg.op === "ping") ext.send(JSON.stringify({ op: "pong" }));
  if (msg.op === "tabsReq") {
    ext.send(
      JSON.stringify({
        op: "tabsRes",
        reqId: msg.reqId,
        tabs: [
          { targetId: "101", title: "Huntr", url: "https://huntr.com", active: true },
          { targetId: "202", title: "GitHub", url: "https://github.com", active: false },
        ],
      }),
    );
  }
});
ext.on("close", (code) => log(`ext: closed ${code}`));
ext.on("error", (e) => log(`ext: error ${String(e)}`));

await new Promise((r) => setTimeout(r, 400));
log(`hub.extensionConnected=${hub.extensionConnected}`);

const agent = await CdpClient.connect(`ws://127.0.0.1:${port}/?role=agent&token=probe-token`);
log("agent connected");
const targets = await agent.getTargets();
log(`getTargets: ${JSON.stringify(targets).slice(0, 220)}`);
agent.close();

log("PROBE COMPLETE");
hub.close();
process.exit(0);
