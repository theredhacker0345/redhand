import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { BridgeHub, generatePairingToken } from "./bridge-hub.js";
import { BrowserSession } from "./session.js";
import { toolDefinitions } from "./tools.js";

export { BrowserSession, type HumanizeMode, type NetworkEntry } from "./session.js";
export { toolDefinitions, type ToolDefinition, type ToolResultContent } from "./tools.js";
export { BridgeHub, generatePairingToken, type BridgeHubOptions, type BridgeHubTab } from "./bridge-hub.js";

export interface RedhandServerOptions {
  /**
   * Attach mode:
   *  - "bridge" (default): start the loopback hub; the companion extension
   *    connects the user's RUNNING browser — no relaunch, no debug port.
   *  - "cdp": attach to a browser already launched with --remote-debugging-port.
   */
  mode?: "bridge" | "cdp";
  /** CDP port for "cdp" mode (default 9222 / REDHAND_CDP_PORT). */
  port?: number;
  /** Loopback port for the bridge hub (default 9223 / REDHAND_BRIDGE_PORT). */
  bridgePort?: number;
  /** Pairing token for the bridge (default: generated). */
  bridgeToken?: string;
  /** Pre-connected session (tests / embedding). Overrides attach modes. */
  session?: BrowserSession;
}

export interface RedhandServer {
  server: McpServer;
  hub: BridgeHub | null;
  /** Attaches to the browser (lazily on first tool call in bridge mode). */
  getSession: () => Promise<BrowserSession>;
}

/** Build an McpServer whose tools lazily attach to the local browser. */
export function createServer(options: RedhandServerOptions = {}): RedhandServer {
  const state: { session: BrowserSession | null } = { session: options.session ?? null };
  const mode = options.mode ?? "bridge";
  const cdpPort = options.port ?? Number(process.env["REDHAND_CDP_PORT"] ?? 9222);
  const hub =
    mode === "bridge"
      ? new BridgeHub({
          port: options.bridgePort ?? Number(process.env["REDHAND_BRIDGE_PORT"] ?? 9223),
          token: options.bridgeToken ?? process.env["REDHAND_BRIDGE_TOKEN"] ?? generatePairingToken(),
        })
      : null;

  const getSession = async (): Promise<BrowserSession> => {
    if (state.session !== null) return state.session;
    if (mode === "cdp") {
      state.session = await BrowserSession.connect({ port: cdpPort });
    } else {
      // Bridge mode: wait for the extension peer, then attach through the hub.
      const deadline = Date.now() + 120_000;
      while ((hub?.extensionConnected ?? false) === false && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 300));
      }
      if (hub === null || !hub.extensionConnected) {
        throw new Error(
          "bridge extension not connected — load the redhand-bridge extension and paste the pairing token (see redhand setup)",
        );
      }
      state.session = await BrowserSession.connect({ wsUrl: hub.agentUrl });
    }
    return state.session;
  };

  const server = new McpServer({ name: "redhand", version: "0.2.0" });
  for (const tool of toolDefinitions()) {
    server.registerTool(tool.name, { description: tool.description, inputSchema: tool.inputSchema }, async (args) => {
      try {
        const content = await tool.run(getSession, (args ?? {}) as Record<string, unknown>);
        return { content };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: `ERROR: ${message}` }], isError: true };
      }
    });
  }
  return { server, hub, getSession };
}

/** Run the MCP server over stdio; the bridge hub listens for the extension. */
export async function main(): Promise<void> {
  const { server, hub } = createServer({ mode: "bridge" });
  process.stderr.write(
    `redhand bridge hub listening on ${hub?.extensionUrl}\n` +
      `pairing token: ${hub?.pairingToken}\n` +
      `paste this token into the redhand-bridge extension popup (one time)\n`,
  );
  await server.connect(new StdioServerTransport());
  process.stderr.write("redhand MCP ready (stdio) — browser attaches lazily via the bridge\n");
}

const invokedDirectly = process.argv[1]?.includes("mcp");
if (invokedDirectly) {
  main().catch((err: unknown) => {
    process.stderr.write(`redhand fatal: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
