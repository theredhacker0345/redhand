#!/usr/bin/env node
import { execFile } from "node:child_process";
import { RedhandError } from "@redhand/core";
import { BrowserSession, main as serveMcp } from "redhand-mcp";
import { parseArgs } from "./args.js";

/**
 * redhand CLI — setup wizard, attach inspector, and MCP server launcher.
 * The runtime dependency list is closed by policy, so argument parsing and
 * platform integration are hand-rolled here.
 */

const HELP = `redhand — the agent's hand inside your browser

Usage:
  redhand serve [--port 9222]    Run the MCP server (stdio) against the local browser
  redhand attach [--port 9222]   List browser tabs reachable over CDP
  redhand setup                  Print per-platform setup steps
  redhand version                Print version

Environment:
  REDHAND_CDP_PORT               CDP port override (default 9222)`;

const SETUP_STEPS = `redhand setup — one-time setup

1. Close your browser fully.
2. Relaunch it from the shortcut redhand created (see below) — same profile,
   same sessions, now reachable over CDP.
3. Load the bridge extension (optional, for attach-to-running-browser):
   chrome://extensions -> Developer mode -> Load unpacked -> select ./bridge
4. Add the MCP server to your AI client:

   {"mcpServers": {"redhand": {"command": "npx", "args": ["redhand-mcp"]}}}

The launcher shortcut launches your browser with the debug port enabled.
Re-run "redhand setup --create-shortcut" to (re)create it.`;

function createWindowsShortcut(browserPath: string, shortcutPath: string, port: number): void {
  const ps = [
    "$s = (New-Object -ComObject WScript.Shell).CreateShortcut('" + shortcutPath + "')",
    "$s.TargetPath = '" + browserPath + "'",
    "$s.Arguments = '--remote-debugging-port=" + port + "'",
    "$s.Save()",
  ].join("; ");
  execFile("powershell", ["-NoProfile", "-Command", ps], (err) => {
    if (err !== null) {
      process.stderr.write(`shortcut creation failed: ${err.message}\n`);
      return;
    }
    process.stdout.write(`shortcut written: ${shortcutPath}\n`);
  });
}

async function runAttach(port?: number): Promise<void> {
  const session = await BrowserSession.connect({ port: port ?? 9222 });
  const tabs = await session.tabs();
  for (const tab of tabs) {
    process.stdout.write(`${tab.targetId}  "${tab.title ?? ""}"  ${tab.url ?? ""}\n`);
  }
  process.stdout.write(`${tabs.length} tab(s) reachable\n`);
  await session.detach();
}

/** Entry point — degrades to help on anything unknown (defensive CLI). */
export async function run(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  switch (args.command) {
    case "serve": {
      if (args.port !== undefined) {
        process.env["REDHAND_CDP_PORT"] = String(args.port);
      }
      await serveMcp();
      return;
    }
    case "attach": {
      await runAttach(args.port);
      return;
    }
    case "setup": {
      process.stdout.write(SETUP_STEPS + "\n");
      if (args.flags["create-shortcut"] === "true") {
        const browserPath = args.flags["browser"] ?? "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe";
        const desktop = args.flags["desktop"] ?? "C:\\Users\\Public\\Desktop";
        createWindowsShortcut(browserPath, `${desktop}\\Browser (redhand).lnk`, args.port ?? 9222);
      }
      return;
    }
    case "version": {
      process.stdout.write("redhand 0.1.0\n");
      return;
    }
    case "help": {
      process.stdout.write(HELP + "\n");
      return;
    }
  }
}

const isMain = process.argv[1]?.endsWith("cli") === true || process.argv[1]?.includes("redhand") === true;
if (isMain) {
  run(process.argv.slice(2)).catch((err: unknown) => {
    const message = err instanceof RedhandError ? `${err.code}: ${err.message}` : err instanceof Error ? err.message : String(err);
    process.stderr.write(`redhand: ${message}\n`);
    process.exit(1);
  });
}
