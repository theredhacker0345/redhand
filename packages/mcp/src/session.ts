import { z } from "zod";
import {
  CdpClient,
  RedhandError,
  diffSnapshots,
  installExecutor,
  liveRect as coreLiveRect,
  focusElement as coreFocusElement,
  scrollIntoView as coreScrollIntoView,
  selectOption as coreSelectOption,
  snapshot as coreSnapshot,
  renderSnapshot,
  type RedhandElement,
  type SnapshotDiff,
  type TargetInfo,
} from "@redhand/core";
import { Rng, cadence, dwell, mousePath, type Point } from "@redhand/humanize";

/**
 * BrowserSession — one attached tab of the user's real browser.
 * Wires the CDP client, the in-page executor and the humanize engine into
 * the high-level operations the MCP tools expose.
 */

export type HumanizeMode = "ghost" | "natural" | "fast";

export interface NetworkEntry {
  ts: number;
  requestId: string;
  method: string;
  url: string;
  status?: number;
  resourceType?: string;
}

const networkRequestSchema = z.object({
  requestId: z.string(),
  request: z.object({ url: z.string(), method: z.string() }),
});
const networkResponseSchema = z.object({
  requestId: z.string(),
  response: z.object({ status: z.number(), mimeType: z.string() }),
});
const screenshotSchema = z.object({ data: z.string().min(1) });

/** Credential-looking query parameter names — values get masked in URLs. */
const CRED_PARAM = /(access_token|refresh_token|id_token|api[-_]?key|apikey|token|secret|client_secret|signature|sig|password|passwd|pwd|session[-_]?id|sessionid|sid|auth|jwt|nonce|key|credential|otp)$/i;
const SECRET_SHAPE =
  /ghp_[A-Za-z0-9_]{20,}|gho_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|xox[abprs]-[A-Za-z0-9-]{10,}|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}(\.[A-Za-z0-9_-]{8,})?|-----BEGIN [A-Z ]+-----[\s\S]{0,400}/g;

/** Mask credential query params in a URL (display + ingestion). */
export function scrubUrl(url: string): string {
  try {
    const parsed = new URL(url);
    for (const key of [...parsed.searchParams.keys()]) {
      if (CRED_PARAM.test(key)) {
        parsed.searchParams.set(key, "[REDACTED]");
      }
    }
    return parsed.toString().slice(0, 300);
  } catch {
    return url.slice(0, 300);
  }
}

/** Replace secret-shaped values in any text bound for the LLM context. */
export function scrubSecrets(text: string): string {
  return text.replace(SECRET_SHAPE, "[REDACTED]");
}

const KEY_CODES: Record<string, { key: string; code: string; vk: number }> = {
  enter: { key: "Enter", code: "Enter", vk: 13 },
  tab: { key: "Tab", code: "Tab", vk: 9 },
  escape: { key: "Escape", code: "Escape", vk: 27 },
  backspace: { key: "Backspace", code: "Backspace", vk: 8 },
  delete: { key: "Delete", code: "Delete", vk: 46 },
  arrowup: { key: "ArrowUp", code: "ArrowUp", vk: 38 },
  arrowdown: { key: "ArrowDown", code: "ArrowDown", vk: 40 },
  arrowleft: { key: "ArrowLeft", code: "ArrowLeft", vk: 37 },
  arrowright: { key: "ArrowRight", code: "ArrowRight", vk: 39 },
  home: { key: "Home", code: "Home", vk: 36 },
  end: { key: "End", code: "End", vk: 35 },
  pageup: { key: "PageUp", code: "PageUp", vk: 33 },
  pagedown: { key: "PageDown", code: "PageDown", vk: 34 },
  space: { key: " ", code: "Space", vk: 32 },
};

const MODIFIER_BITS: Record<string, number> = { ctrl: 2, alt: 1, shift: 4, meta: 8 };

/** Parse "ctrl+shift+a" into a key spec + CDP modifier bitmask. */
export function parseKeySpec(spec: string): {
  key: string;
  code: string;
  vk: number;
  modifiers: number;
  text?: string;
} {
  const parts = spec.toLowerCase().split("+");
  const mods = parts.filter((p) => p in MODIFIER_BITS);
  const base = parts.filter((p) => !(p in MODIFIER_BITS)).join("");
  let key: string;
  let code: string;
  let vk: number;
  let text: string | undefined;
  if (KEY_CODES[base]) {
    ({ key, code, vk } = KEY_CODES[base]);
  } else if (base.length === 1) {
    key = base.toUpperCase();
    code = /[a-z]/i.test(base) ? `Key${base.toUpperCase()}` : base;
    vk = base.toUpperCase().charCodeAt(0);
    text = base;
  } else if (/^f\d{1,2}$/.test(base)) {
    key = base.toUpperCase();
    code = base.toUpperCase();
    vk = 112 + Number(base.slice(1)) - 1;
  } else {
    throw new RedhandError("VALIDATION", `Unknown key "${base}"`, { spec });
  }
  let modifiers = 0;
  for (const m of mods) {
    modifiers |= MODIFIER_BITS[m] ?? 0;
  }
  return { key, code, vk, modifiers, text };
}

const MAX_NETWORK_BUFFER = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Live tag of an indexed element ("" when absent). */
async function session_tagOf(cdp: CdpClient, sessionId: string, index: number): Promise<string | null> {
  const raw = await cdp.evaluate(sessionId, `__redhand.tagOf(${index})`);
  const value = (raw.result.value as string | undefined) ?? null;
  return value;
}

export class BrowserSession {
  private readonly cdp: CdpClient;
  private sessionId: string | null = null;
  private primaryTargetId: string | null = null;
  private primaryTitle = "a tab";
  private readonly networkBuffer: NetworkEntry[] = [];
  private cursor: Point | null = null;
  private readonly rng: Rng = new Rng();
  /** Lazily-attached sessions for OTHER page tabs (toast broadcast). */
  private readonly sideSessions = new Map<string, string>();
  /** Executor reinstall retries before declaring the page hostile. */
  private reinstallBudget = 3;

  private constructor(cdp: CdpClient) {
    this.cdp = cdp;
  }

  /** Test/embedding entry point — wrap an already-connected client. */
  static fromClient(cdp: CdpClient): BrowserSession {
    return new BrowserSession(cdp);
  }

  /** Discover the local CDP endpoint, connect, and attach to the first page target. */
  static async connect(opts: { port?: number } = {}): Promise<BrowserSession> {
    const port = opts.port ?? 9222;
    const { wsUrl } = await CdpClient.discover(port);
    const cdp = await CdpClient.connect(wsUrl);
    const session = new BrowserSession(cdp);
    const targets = await session.tabs();
    const first = targets.find((t) => t.type === "page");
    if (first) {
      await session.attachToTab(first.targetId);
    }
    return session;
  }

  /** List browser page targets (titles/urls scrubbed + truncated). */
  async tabs(): Promise<TargetInfo[]> {
    const all = await this.cdp.getTargets();
    return all
      .filter((t) => t.type === "page")
      .map((t) => ({
        ...t,
        title: t.title?.slice(0, 120),
        url: t.url ? scrubUrl(t.url) : t.url,
      }));
  }

  /** Open a new tab with the given URL and attach to it. */
  async createTab(url: string): Promise<TargetInfo> {
    const created = await this.cdp.send("Target.createTarget", { url }, { schema: z.object({ targetId: z.string() }) });
    await this.attachToTab(created.targetId);
    const tabs = await this.tabs();
    const createdTab = tabs.find((t) => t.targetId === created.targetId);
    return createdTab ?? { targetId: created.targetId, type: "page" };
  }

  /** Navigate the attached tab to a URL and wait for the document to settle. */
  async navigate(url: string): Promise<void> {
    if (this.sessionId === null) throw new RedhandError("NOT_ATTACHED", "No tab attached");
    await this.cdp.send("Page.navigate", { url }, { sessionId: this.sessionId });
    await sleep(1200);
    await this.waitSettled();
    await this.ensureExecutor();
    const host = new URL(url).hostname;
    this.primaryTitle = host;
    await this.announce("viewed");
    void this.broadcastToast(`opening ${host}`).catch(() => undefined);
  }

  /** Attach to a page target, enable domains, and install the executor. */
  async attachToTab(targetId: string): Promise<void> {
    this.sessionId = await this.cdp.attachToTarget(targetId);
    this.primaryTargetId = targetId;
    const tabs = await this.tabs();
    this.primaryTitle = tabs.find((t) => t.targetId === targetId)?.title?.slice(0, 48) ?? "a tab";
    await this.cdp.send("Page.enable", {}, { sessionId: this.sessionId });
    await this.cdp.send("Network.enable", {}, { sessionId: this.sessionId });
    this.bindNetworkHandlers(this.sessionId);
    await this.ensureExecutor();
  }

  /**
   * Show a toast on the tab the user is CURRENTLY looking at (any visible
   * page tab other than the one being operated). Self-contained script —
   * works on tabs where the full executor was never installed. Heartbeat:
   * every action re-invokes; the toast stays up during active work.
   */
  async broadcastToast(line1: string, line2?: string): Promise<void> {
    if (this.sessionId === null) return;
    const safe1 = line1.replace(/'/g, "");
    const safe2 = (line2 ?? this.primaryTitle).replace(/'/g, "").slice(0, 60);
    const toastScript =
      `(function(){if(document.visibilityState!=='visible')return;` +
      `var r=document.body||document.documentElement;if(!r)return;` +
      `var T='redhand-tab-toast';var el=document.getElementById(T);` +
      `if(!el){el=document.createElement('div');el.id=T;` +
      `el.setAttribute('style','position:fixed;bottom:16px;right:16px;z-index:2147483647;` +
      `display:flex;align-items:center;gap:9px;padding:9px 14px 9px 12px;` +
      `border-radius:4px;border:1px solid rgba(255,59,78,.45);border-left:3px solid #FF3B4E;` +
      `box-shadow:0 8px 28px rgba(0,0,0,.55);pointer-events:none;max-width:400px;` +
      `opacity:0;transform:translateY(8px);transition:opacity .25s ease,transform .25s ease;` +
      `background:rgba(11,14,20,.92);color:#E6E9EF;font-family:ui-monospace,Menlo,Consolas,monospace;` +
      `font-size:11.5px');` +
      `el.innerHTML='<span style="width:8px;height:8px;border-radius:50%;background:#FF3B4E;flex:0 0 auto"></span>` +
      `<div><div class="rh-t1"></div><div class="rh-t2" style="color:#8B93A5;margin-top:2px"></div></div>';` +
      `r.appendChild(el);}` +
      `el.querySelector('.rh-t1').textContent='${safe1}';` +
      `el.querySelector('.rh-t2').textContent='${safe2}';` +
      `el.style.opacity='1';el.style.transform='translateY(0)';` +
      `if(el.__t){clearTimeout(el.__t)}el.__t=setTimeout(function(){el.style.opacity='0';` +
      `el.style.transform='translateY(8px)'},9000)})()`;
    const targets = await this.tabs();
    for (const target of targets) {
      if (target.targetId === this.primaryTargetId) continue;
      let sid = this.sideSessions.get(target.targetId);
      if (sid === undefined) {
        try {
          sid = await this.cdp.attachToTarget(target.targetId);
          this.sideSessions.set(target.targetId, sid);
        } catch {
          continue;
        }
      }
      await this.cdp.evaluate(sid, toastScript).catch(() => undefined);
    }
  }

  /** Element text from the last snapshot — used for human-readable action labels. */
  private labelFor(index: number): string {
    const el = this.lastSnapshot.find((e) => e.index === index);
    const text = el?.text ?? el?.ariaLabel ?? el?.placeholder ?? "";
    return text.slice(0, 30) || `<${el?.tag ?? "element"}>`;
  }

  /** Fire the in-page announce() for the operated tab (self-gated on visibility). */
  private async announce(kind: "viewed" | "watching"): Promise<void> {
    if (this.sessionId === null) return;
    await this.cdp.evaluate(this.sessionId, `__redhand.announce('${kind}')`).catch(() => undefined);
  }

  private bindNetworkHandlers(sessionId: string): void {
    this.cdp.on(
      "Network.requestWillBeSent",
      (raw, sid) => {
        if (sid !== sessionId) return;
        const p = networkRequestSchema.parse(raw);
        this.pushNetwork({ ts: Date.now(), requestId: p.requestId, method: p.request.method, url: p.request.url });
      },
      sessionId,
    );
    this.cdp.on(
      "Network.responseReceived",
      (raw, sid) => {
        if (sid !== sessionId) return;
        const p = networkResponseSchema.parse(raw);
        const entry = this.networkBuffer.findLast((e) => e.requestId === p.requestId);
        if (entry) {
          entry.status = p.response.status;
          entry.resourceType = p.response.mimeType;
        }
      },
      sessionId,
    );
  }

  private pushNetwork(entry: NetworkEntry): void {
    entry.url = scrubUrl(entry.url);
    this.networkBuffer.push(entry);
    if (this.networkBuffer.length > MAX_NETWORK_BUFFER) {
      this.networkBuffer.splice(0, this.networkBuffer.length - MAX_NETWORK_BUFFER);
    }
  }

  private async ensureExecutor(): Promise<void> {
    if (this.sessionId === null) {
      throw new RedhandError("NOT_ATTACHED", "No tab attached");
    }
    await installExecutor(this.cdp, this.sessionId);
  }

  /** Indexed snapshot of interactive elements, rendered for LLM consumption. */
  async snapshot(): Promise<{ elements: RedhandElement[]; rendered: string; diff: SnapshotDiff | null }> {
    if (this.sessionId === null) {
      throw new RedhandError("NOT_ATTACHED", "No tab attached");
    }
    let elements: RedhandElement[];
    try {
      elements = await coreSnapshot(this.cdp, this.sessionId);
    } catch (err) {
      // Navigation replaces the document and clears the executor — reinstall,
      // but bound the retries: repeated failure means the page is hostile.
      if (err instanceof RedhandError && (err.code === "PROTOCOL_ERROR" || err.code === "VALIDATION")) {
        if (this.reinstallBudget-- <= 0) {
          throw new RedhandError(
            "TAMPERING",
            "Executor integrity checks failed repeatedly on this tab — page is likely tampering with __redhand; operate elsewhere or detach",
          );
        }
        await this.ensureExecutor();
        elements = await coreSnapshot(this.cdp, this.sessionId);
      } else {
        throw err;
      }
    }
    const tampered = (await this.evaluate("window.__redhand && window.__redhand.isTampered ? window.__redhand.isTampered() : false")) === true;
    if (tampered) {
      throw new RedhandError("TAMPERING", "Page locked or replaced the redhand executor API — snapshot cannot be trusted");
    }
    this.reinstallBudget = 3;
    const diff = diffSnapshots(this.lastSnapshot, elements);
    this.lastSnapshot = elements;
    await this.announce("viewed");
    void this.broadcastToast(`viewing: ${this.primaryTitle}`).catch(() => undefined);
    return { elements, rendered: renderSnapshot(elements), diff };
  }

  private lastSnapshot: RedhandElement[] = [];

  private async dispatchMousePath(path: Array<{ x: number; y: number; delayMs: number }>): Promise<void> {
    if (this.sessionId === null) throw new RedhandError("NOT_ATTACHED", "No tab attached");
    // Animate the visible redhand cursor along the same path client-side
    // (fire-and-forget — the real CDP events below are the trusted timeline).
    await this.cdp.evaluate(
      this.sessionId,
      `__redhand.animatePath(${JSON.stringify(path.map((p) => [p.x, p.y, p.delayMs]))})`,
    );
    for (const pt of path) {
      await sleep(pt.delayMs);
      await this.cdp.send(
        "Input.dispatchMouseEvent",
        { type: "mouseMoved", x: pt.x, y: pt.y, buttons: 0 },
        { sessionId: this.sessionId },
      );
      this.cursor = { x: pt.x, y: pt.y };
    }
  }

  private async pressAndRelease(point: Point): Promise<void> {
    if (this.sessionId === null) throw new RedhandError("NOT_ATTACHED", "No tab attached");
    await sleep(dwell(this.rng));
    await this.cdp.evaluate(this.sessionId, `__redhand.cursorClick(${point.x}, ${point.y})`);
    await this.cdp.send(
      "Input.dispatchMouseEvent",
      { type: "mousePressed", x: point.x, y: point.y, button: "left", buttons: 1, clickCount: 1 },
      { sessionId: this.sessionId },
    );
    await sleep(this.rng.int(30, 80));
    await this.cdp.send(
      "Input.dispatchMouseEvent",
      { type: "mouseReleased", x: point.x, y: point.y, button: "left", buttons: 0, clickCount: 1 },
      { sessionId: this.sessionId },
    );
    this.cursor = point;
  }

  private async moveTo(i: number, mode: HumanizeMode): Promise<Point> {
    if (this.sessionId === null) throw new RedhandError("NOT_ATTACHED", "No tab attached");
    await coreScrollIntoView(this.cdp, this.sessionId, i);
    const rect = await coreLiveRect(this.cdp, this.sessionId, i);
    if (rect === null) {
      throw new RedhandError("NOT_ATTACHED", `Element index ${i} no longer exists — take a new snapshot`);
    }
    // Tamper check: the live element's tag must match the snapshot's tag.
    // A page reassigning what index i points to (data-redhand-id games,
    // __redhand poisoning) gets surfaced instead of clicked.
    const snapEl = this.lastSnapshot.find((e) => e.index === i);
    const liveTag = (await session_tagOf(this.cdp, this.sessionId, i)) ?? "";
    if (snapEl && liveTag && liveTag !== snapEl.tag) {
      throw new RedhandError(
        "TAMPERING",
        `Element ${i} changed identity (snapshot tag <${snapEl.tag}>, live tag <${liveTag}>) — page may be tampering; take a new snapshot`,
      );
    }
    const center: Point = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    if (mode === "fast") {
      await this.dispatchMousePath([{ x: center.x, y: center.y, delayMs: 0 }]);
      return center;
    }
    const from: Point = this.cursor ?? { x: Math.max(center.x - 120, 5), y: Math.max(center.y - 90, 5) };
    const path = mousePath(from, center, { rng: this.rng, overshootChance: mode === "ghost" ? 0.2 : 0.15 });
    await this.dispatchMousePath(path);
    return center;
  }

  /** Click an indexed element with the requested humanize mode. */
  async click(index: number, mode: HumanizeMode = "natural"): Promise<{ point: Point }> {
    const point = await this.moveTo(index, mode);
    await this.pressAndRelease(point);
    await this.announce("watching");
    void this.broadcastToast(`clicking "${this.labelFor(index)}"`, `in: ${this.primaryTitle}`).catch(() => undefined);
    return { point };
  }

  /** Hover an indexed element (move without pressing). */
  async hover(index: number, mode: HumanizeMode = "natural"): Promise<{ point: Point }> {
    const point = await this.moveTo(index, mode);
    return { point };
  }

  /** Type text into an indexed field with the requested humanize mode. */
  async type(index: number, text: string, mode: HumanizeMode = "natural"): Promise<{ chars: number }> {
    if (this.sessionId === null) throw new RedhandError("NOT_ATTACHED", "No tab attached");
    await this.moveTo(index, mode);
    await coreFocusElement(this.cdp, this.sessionId, index);
    if (mode === "ghost") {
      const steps = cadence(text, { typoProbability: 0.08, rng: this.rng });
      for (const step of steps) {
        await sleep(step.delayMs);
        if (step.kind === "char") {
          await this.cdp.send("Input.insertText", { text: step.char }, { sessionId: this.sessionId });
        } else if (step.kind === "erase") {
          await this.pressKey("backspace");
        }
      }
      return { chars: text.length };
    }
    await this.cdp.send("Input.insertText", { text }, { sessionId: this.sessionId });
    await this.announce("watching");
    void this.broadcastToast(`typing into "${this.labelFor(index)}"`, `in: ${this.primaryTitle}`).catch(() => undefined);
    return { chars: text.length };
  }

  /** Press a key or combo: "enter", "ctrl+a", "ctrl+shift+t", "escape", "f5", ... */
  async pressKey(specName: string): Promise<void> {
    if (this.sessionId === null) throw new RedhandError("NOT_ATTACHED", "No tab attached");
    const parsed = parseKeySpec(specName);
    await this.cdp.send(
      "Input.dispatchKeyEvent",
      {
        type: "rawKeyDown",
        key: parsed.key,
        code: parsed.code,
        windowsVirtualKeyCode: parsed.vk,
        modifiers: parsed.modifiers,
        text: parsed.text,
      },
      { sessionId: this.sessionId },
    );
    await this.cdp.send(
      "Input.dispatchKeyEvent",
      {
        type: "keyUp",
        key: parsed.key,
        code: parsed.code,
        windowsVirtualKeyCode: parsed.vk,
        modifiers: parsed.modifiers,
      },
      { sessionId: this.sessionId },
    );
    await this.announce("watching");
    void this.broadcastToast(`pressing ${parsed.key}`, `in: ${this.primaryTitle}`).catch(() => undefined);
  }

  /** Scroll the page at the current cursor position. */
  async scroll(direction: "up" | "down", amount = 3): Promise<void> {
    if (this.sessionId === null) throw new RedhandError("NOT_ATTACHED", "No tab attached");
    const deltaY = direction === "down" ? amount * 120 : -amount * 120;
    const at = this.cursor ?? { x: 400, y: 300 };
    await this.cdp.send(
      "Input.dispatchMouseEvent",
      { type: "mouseWheel", x: at.x, y: at.y, deltaX: 0, deltaY },
      { sessionId: this.sessionId },
    );
  }

  /** Select an option on an indexed <select>. */
  async select(index: number, value: string): Promise<boolean> {
    if (this.sessionId === null) throw new RedhandError("NOT_ATTACHED", "No tab attached");
    return coreSelectOption(this.cdp, this.sessionId, index, value);
  }

  /** Evaluate JS in the page; results are scrubbed for secret-shaped values. */
  async evaluate(expression: string): Promise<unknown> {
    if (this.sessionId === null) throw new RedhandError("NOT_ATTACHED", "No tab attached");
    const raw = await this.cdp.evaluate(this.sessionId, expression, true);
    if (raw.exceptionDetails) {
      const desc = scrubSecrets(raw.exceptionDetails.exception?.description ?? raw.exceptionDetails.text);
      throw new RedhandError("PROTOCOL_ERROR", `Page evaluation failed: ${desc}`, raw.exceptionDetails);
    }
    return raw.result.value;
  }

  /** Capture a PNG screenshot with credential fields masked first. */
  async screenshot(): Promise<string> {
    if (this.sessionId === null) throw new RedhandError("NOT_ATTACHED", "No tab attached");
    await this.cdp.evaluate(this.sessionId, "__redhand.maskSecrets()").catch(() => undefined);
    try {
      const result = await this.cdp.send("Page.captureScreenshot", { format: "png" }, { sessionId: this.sessionId, schema: screenshotSchema });
      return result.data;
    } finally {
      await this.cdp.evaluate(this.sessionId, "__redhand.unmask()").catch(() => undefined);
    }
  }

  /** Network entries captured since the given timestamp (default: all). */
  network(since?: number): NetworkEntry[] {
    if (since === undefined) {
      return [...this.networkBuffer];
    }
    return this.networkBuffer.filter((e) => e.ts > since);
  }

  /** Resolve when the page has been mutation-quiet for 450ms (5s cap). */
  async waitSettled(): Promise<boolean> {
    if (this.sessionId === null) throw new RedhandError("NOT_ATTACHED", "No tab attached");
    const expression =
      "(function(){return new Promise(function(res){var t=null;" +
      "var o=new MutationObserver(function(){if(t){clearTimeout(t)}" +
      "t=setTimeout(function(){o.disconnect();res(true)},450)});" +
      "o.observe(document.documentElement,{childList:true,subtree:true,attributes:true});" +
      "setTimeout(function(){o.disconnect();res(true)},5000)})})()";
    const raw = await this.cdp.evaluate(this.sessionId, expression, true);
    return raw.result.value === true;
  }

  /** Detach the current tab session (overlay removed from the page). */
  async detach(): Promise<void> {
    if (this.sessionId !== null) {
      await this.cdp
        .evaluate(this.sessionId, "__redhand.hideOverlay()")
        .catch(() => undefined);
      await this.cdp.detachFromTarget(this.sessionId);
      this.sessionId = null;
    }
  }
}
