import { describe, expect, it } from "vitest";
import { parseArgs } from "./args.js";

describe("parseArgs", () => {
  it("parses command with --port flag", () => {
    const args = parseArgs(["serve", "--port", "9222"]);
    expect(args.command).toBe("serve");
    expect(args.port).toBe(9222);
  });

  it("degrades unknown commands to help", () => {
    expect(parseArgs(["frobnicate"]).command).toBe("help");
    expect(parseArgs([]).command).toBe("help");
  });

  it("treats bare flags as boolean strings", () => {
    const args = parseArgs(["setup", "--create-shortcut"]);
    expect(args.flags["create-shortcut"]).toBe("true");
  });

  it("ignores invalid ports gracefully", () => {
    const args = parseArgs(["serve", "--port", "notaport"]);
    expect(args.port).toBeUndefined();
    expect(args.command).toBe("serve");
  });

  it("parses --browser value for setup", () => {
    const args = parseArgs(["setup", "--create-shortcut", "--browser", "C:\\b\\brave.exe"]);
    expect(args.flags["browser"]).toBe("C:\\b\\brave.exe");
  });
});
