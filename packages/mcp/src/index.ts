import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { BrowserSession } from "./session.js";
import { toolDefinitions } from "./tools.js";

export { BrowserSession, type HumanizeMode, type NetworkEntry } from "./session.js";
export { toolDefinitions, type ToolDefinition, type ToolResultContent } from "./tools.js";

/**
 * redhand MCP server entrypoint.
 * The server STARTS instantly and lists all tools without a browser; the
 * browser connects lazily on the first tool call (defensive: introspection
 * checks and clients start the server before any browser is reachable).
 * stdio is the v1 transport; streamable HTTP is phase 2.
 */

export interface RedhandServerOptions {
  /** CDP port to attach to on first tool call (default 9222 / REDHAND_CDP_PORT). */
  port?: number;
  /** Pre-connected session (tests / embedding). Overrides lazy connect. */
  session?: BrowserSession;
}

/** Build an McpServer whose tools lazily attach to the local browser. */
export function createServer(options: RedhandServerOptions = {}): McpServer {
  const state: { session: BrowserSession | null } = { session: options.session ?? null };
  const getSession = async (): Promise<BrowserSession> => {
    if (state.session === null) {
      const port = Number(process.env["REDHAND_CDP_PORT"] ?? options.port ?? 9222);
      state.session = await BrowserSession.connect({ port });
    }
    return state.session;
  };

  const server = new McpServer({ name: "redhand", version: "0.1.0" });
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
  return server;
}

/** Run the server over stdio. The browser connects lazily on first tool call. */
export async function main(): Promise<void> {
  const server = createServer({
    port: Number(process.env["REDHAND_CDP_PORT"] ?? 9222),
  });
  await server.connect(new StdioServerTransport());
  process.stderr.write(
    `redhand MCP ready (v0.1.0) — tools listed; browser attaches on first tool call (REDHAND_CDP_PORT=${process.env["REDHAND_CDP_PORT"] ?? 9222})\n`,
  );
}

const invokedDirectly = process.argv[1]?.includes("mcp");
if (invokedDirectly) {
  main().catch((err: unknown) => {
    process.stderr.write(`redhand fatal: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
