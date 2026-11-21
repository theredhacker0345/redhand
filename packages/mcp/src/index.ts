import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { BrowserSession } from "./session.js";
import { toolDefinitions } from "./tools.js";

export { BrowserSession, type HumanizeMode, type NetworkEntry } from "./session.js";
export { toolDefinitions, type ToolDefinition, type ToolResultContent } from "./tools.js";

/**
 * redhand MCP server entrypoint.
 * stdio is the v1 transport — remote agents add an HTTP transport in phase 2
 * (defensive choice: stdio is the universally-supported path in every MCP client).
 */

/** Build an McpServer instance bound to an attached browser session. */
export function createServer(session: BrowserSession): McpServer {
  const server = new McpServer({ name: "redhand", version: "0.1.0" });
  for (const tool of toolDefinitions()) {
    server.registerTool(tool.name, { description: tool.description, inputSchema: tool.inputSchema }, async (args) => {
      try {
        const content = await tool.run(session, (args ?? {}) as Record<string, unknown>);
        return { content };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: `ERROR: ${message}` }], isError: true };
      }
    });
  }
  return server;
}

/** Run the server over stdio against the local CDP endpoint. */
export async function main(): Promise<void> {
  const port = Number(process.env["REDHAND_CDP_PORT"] ?? 9222);
  const session = await BrowserSession.connect({ port });
  const server = createServer(session);
  await server.connect(new StdioServerTransport());
  process.stderr.write(`redhand MCP ready — attached via CDP port ${port}\n`);
}

const invokedDirectly = process.argv[1]?.includes("mcp");
if (invokedDirectly) {
  main().catch((err: unknown) => {
    process.stderr.write(`redhand fatal: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
