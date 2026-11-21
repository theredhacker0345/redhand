/**
 * Parse CLI argv into a command + options record.
 * Hand-rolled — the runtime dependency list is closed by policy.
 */

export interface CliArgs {
  command: "setup" | "attach" | "serve" | "help" | "version";
  port?: number;
  flags: Record<string, string>;
}

const KNOWN_COMMANDS = new Set(["setup", "attach", "serve", "help", "version"]);

/**
 * @param argv process.argv.slice(2) — e.g. ["serve", "--port", "9222"].
 * @throws never — unknown input degrades to `help` (defensive CLI behavior).
 */
export function parseArgs(argv: string[]): CliArgs {
  const filtered = argv.filter((a) => a !== "");
  const first = filtered[0] ?? "help";
  const command = KNOWN_COMMANDS.has(first) ? (first as CliArgs["command"]) : "help";
  const args: CliArgs = { command, flags: {} };
  let i = 1;
  while (i < filtered.length) {
    const token = filtered[i] as string;
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const value = filtered[i + 1];
      if (value !== undefined && !value.startsWith("--")) {
        args.flags[key] = value;
        i += 2;
        continue;
      }
      args.flags[key] = "true";
      i += 1;
      continue;
    }
    i += 1;
  }
  const portRaw = args.flags["port"];
  if (portRaw !== undefined) {
    const port = Number(portRaw);
    if (Number.isInteger(port) && port > 0 && port < 65536) {
      args.port = port;
    }
  }
  return args;
}
