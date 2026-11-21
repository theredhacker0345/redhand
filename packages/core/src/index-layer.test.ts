import { describe, expect, it } from "vitest";
import { diffSnapshots, renderSnapshot } from "./index-layer.js";
import type { RedhandElement } from "./schema.js";

function element(index: number, overrides: Partial<RedhandElement> = {}): RedhandElement {
  return {
    index,
    tag: "button",
    text: `element ${index}`,
    rect: { x: 10, y: 20, width: 100, height: 30 },
    ...overrides,
  };
}

describe("diffSnapshots", () => {
  it("detects added, removed and changed elements", () => {
    const before = [element(1), element(2), element(3)];
    const after = [element(1, { text: "element 1 (changed)" }), element(3), element(4)];
    const diff = diffSnapshots(before, after);
    expect(diff.added.map((e) => e.index)).toEqual([4]);
    expect(diff.removed.map((e) => e.index)).toEqual([2]);
    expect(diff.changed).toEqual([
      { index: 1, field: "text", before: "element 1", after: "element 1 (changed)" },
    ]);
  });

  it("detects rect moves as changes", () => {
    const before = [element(1)];
    const after = [element(1, { rect: { x: 50, y: 60, width: 100, height: 30 } })];
    const diff = diffSnapshots(before, after);
    expect(diff.changed).toHaveLength(1);
    expect(diff.changed[0]?.field).toBe("rect");
  });

  it("returns empty diff for identical snapshots", () => {
    const snap = [element(1), element(2)];
    const diff = diffSnapshots(snap, snap.map((e) => ({ ...e, rect: { ...e.rect } })));
    expect(diff).toEqual({ added: [], removed: [], changed: [] });
  });
});

describe("renderSnapshot", () => {
  it("renders one line per element with index, tag, text and rect", () => {
    const line = renderSnapshot([element(1, { text: "Sign in", role: "button" })]);
    expect(line).toBe('1 <button [button]> "Sign in" rect=(10,20,100,30)');
  });

  it("falls back to ariaLabel then placeholder for text", () => {
    const lines = renderSnapshot([
      element(1, { text: undefined, ariaLabel: "Close dialog" }),
      element(2, { text: undefined, ariaLabel: undefined, placeholder: "you@example.com" }),
      element(3, { text: undefined, ariaLabel: undefined }),
    ]).split("\n");
    expect(lines[0]).toContain('"Close dialog"');
    expect(lines[1]).toContain("(placeholder: you@example.com)");
    expect(lines[2]).not.toContain('"');
  });

  it("marks disabled elements", () => {
    const line = renderSnapshot([element(1, { disabled: true })]);
    expect(line).toContain("[disabled]");
  });
});
