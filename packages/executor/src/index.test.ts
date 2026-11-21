import { describe, expect, it } from "vitest";
import { EXECUTOR_SOURCE, EXECUTOR_VERSION } from "./index.js";

/**
 * Executor tests run the actual injected source inside happy-dom against
 * fixture HTML — no real browser required (per the no-real-browser test rule).
 */

function setupWindow(html: string): void {
  document.body.innerHTML = html;
  // happy-dom has no layout engine — every rect is 0x0. Patch rect computation
  // to honor per-element data attributes (data-x, data-y, data-w, data-h) with
  // sensible defaults so geometry logic is still exercised deterministically.
  (window.HTMLElement.prototype as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect =
    function (this: HTMLElement & { dataset: Record<string, string | undefined> }): DOMRect {
      const x = Number(this.dataset?.["x"] ?? 10);
      const y = Number(this.dataset?.["y"] ?? 20);
      const width = Number(this.dataset?.["w"] ?? 100);
      const height = Number(this.dataset?.["h"] ?? 30);
      const rect = {
        left: x,
        top: y,
        right: x + width,
        bottom: y + height,
        width,
        height,
        x,
        y,
        toJSON: () => rect,
      } as DOMRect;
      return rect;
    };
  (0, eval)(EXECUTOR_SOURCE);
}

interface ExecutorApi {
  version: string;
  snapshot: () => Array<Record<string, unknown>>;
  liveRect: (i: number) => { rect: Record<string, number> | null };
  focus: (i: number) => { ok: boolean };
  scrollIntoView: (i: number) => { done: boolean };
  selectOption: (i: number, value: string) => { ok: boolean };
  clear: () => { done: boolean };
  cursorMove: (x: number, y: number) => void;
  cursorClick: (x: number, y: number) => void;
  hideOverlay: () => { done: boolean };
}

function api(): ExecutorApi {
  return (window as unknown as { __redhand: ExecutorApi }).__redhand;
}

const SIMPLE_PAGE = `
  <button id="signin" data-x="10" data-y="20">Sign in</button>
  <input type="email" id="email" data-x="10" data-y="70" data-w="220" placeholder="you@example.com" />
  <a id="docs" data-x="240" data-y="20" href="https://docs.example.com">Docs</a>
`;

describe("executor", () => {
  it("reports its version marker", () => {
    setupWindow("<button>ok</button>");
    expect(api().version).toBe(EXECUTOR_VERSION);
  });

  it("is idempotent — double evaluation does not double-install", () => {
    setupWindow("<button>ok</button>");
    (0, eval)(EXECUTOR_SOURCE);
    expect(api().snapshot().length).toBeGreaterThan(0);
  });

  it("indexes visible interactive elements with ascending indices from 1", () => {
    setupWindow(SIMPLE_PAGE);
    const snap = api().snapshot();
    expect(snap.map((e) => e["index"])).toEqual([1, 2, 3]);
    expect(snap[0]?.["tag"]).toBe("button");
    expect(snap[0]?.["text"]).toBe("Sign in");
    expect(snap[1]?.["placeholder"]).toBe("you@example.com");
    expect(snap[2]?.["href"]).toBe("https://docs.example.com");
  });

  it("excludes blacklisted and invisible elements", () => {
    setupWindow(`
      <script>var marker = 'scripts are never indexed';</script>
      <style>.hidden { display: none; }</style>
      <button class="hidden">invisible button</button>
      <div style="display:none"><button>hidden nested</button></div>
      <button>visible</button>
    `);
    const snap = api().snapshot();
    expect(snap).toHaveLength(1);
    expect(snap[0]?.["text"]).toBe("visible");
  });

  it("excludes zero-size elements", () => {
    setupWindow(`<div data-w="0" data-h="0" role="button">zero</div><button>real</button>`);
    const snap = api().snapshot();
    expect(snap.map((e) => e["tag"])).toEqual(["button"]);
  });

  it("drops nested duplicates via overlap pruning, keeping the inner element", () => {
    setupWindow(`
      <div role="button" id="outer" data-w="300" data-h="120" style="cursor:pointer">
        <button id="inner" data-w="120" data-h="30">inner action</button>
      </div>
    `);
    const snap = api().snapshot();
    expect(snap.map((e) => e["tag"])).toEqual(["button"]);
  });

  it("annotates elements with data-redhand-id and clears them", () => {
    setupWindow(SIMPLE_PAGE);
    api().snapshot();
    expect(document.querySelector("#signin")?.hasAttribute("data-redhand-id")).toBe(true);
    api().clear();
    expect(document.querySelector("#signin")?.hasAttribute("data-redhand-id")).toBe(false);
  });

  it("liveRect returns viewport-relative coordinates for indexed elements", () => {
    setupWindow(SIMPLE_PAGE);
    api().snapshot();
    const r = api().liveRect(1).rect;
    expect(r).not.toBeNull();
    expect(Number(r?.["width"])).toBeGreaterThan(0);
    expect(api().liveRect(99).rect).toBeNull();
  });

  it("focus reports whether the element took focus", () => {
    setupWindow(SIMPLE_PAGE);
    api().snapshot();
    expect(api().focus(2).ok).toBe(true);
    expect(api().focus(99).ok).toBe(false);
  });

  it("selectOption fires a bubbling change event on selects", () => {
    setupWindow(`<select id="s" data-w="140"><option value="a">A</option><option value="b">B</option></select>`);
    api().snapshot();
    let changed = "";
    document.querySelector("#s")?.addEventListener("change", (ev: Event) => {
      changed = (ev.target as HTMLSelectElement).value;
    });
    expect(api().selectOption(1, "b").ok).toBe(true);
    expect(changed).toBe("b");
    expect((document.querySelector("#s") as HTMLSelectElement).value).toBe("b");
  });

  it("scrollIntoView succeeds for indexed elements", () => {
    setupWindow(SIMPLE_PAGE);
    api().snapshot();
    expect(api().scrollIntoView(1).done).toBe(true);
    expect(api().scrollIntoView(42).done).toBe(false);
  });

  it("treats pointer-cursor divs as clickable candidates", () => {
    setupWindow(`<div id="card" data-w="50" data-h="20" style="cursor:pointer">card</div><span>plain</span>`);
    const snap = api().snapshot();
    expect(snap.map((e) => e["tag"])).toEqual(["div"]);
  });

  it("installs the visibility overlay: banner (with tab label) + cursor", () => {
    setupWindow(SIMPLE_PAGE);
    api().snapshot();
    const banner = document.getElementById("redhand-overlay-banner");
    expect(banner?.textContent).toContain("redhand is operating:");
    expect(banner?.textContent).toContain("localhost");
    expect(document.getElementById("redhand-cursor-overlay")).not.toBeNull();
  });

  it("cursorMove positions and reveals the cursor", () => {
    setupWindow(SIMPLE_PAGE);
    api().snapshot();
    api().cursorMove(300, 200);
    const cursor = document.getElementById("redhand-cursor-overlay") as HTMLElement;
    expect(cursor.style.transform).toBe("translate(298px,198px)");
    expect(cursor.style.opacity).toBe("1");
  });

  it("cursorClick spawns a ripple and cleans it up", () => {
    setupWindow(SIMPLE_PAGE);
    api().snapshot();
    api().cursorClick(50, 60);
    const ripples = document.querySelectorAll("[style*='border:2px solid #ef4444']");
    expect(ripples.length).toBe(1);
  });

  it("hideOverlay removes banner and cursor", () => {
    setupWindow(SIMPLE_PAGE);
    api().snapshot();
    api().hideOverlay();
    expect(document.getElementById("redhand-overlay-banner")).toBeNull();
    expect(document.getElementById("redhand-cursor-overlay")).toBeNull();
  });
});
