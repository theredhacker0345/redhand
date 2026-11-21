/**
 * The in-page executor — the zero-dependency engine injected into every page.
 *
 * This file exports the executor as a single self-evaluating source string.
 * The source is dependency-free vanilla JavaScript (no backticks, no template
 * expressions, ES5-compatible) so it can be evaluated verbatim in any page
 * context via Runtime.evaluate or Page.addScriptToEvaluateOnNewDocument.
 */

export const EXECUTOR_VERSION = "0.1.1";

export const EXECUTOR_SOURCE = `
(function () {
  'use strict';

  var INDEX_ATTR = 'data-redhand-id';
  var COLLECT_CAP = 2000;
  var MAX_CANDIDATES = 1500;
  var OVERLAP_RATIO = 0.8;
  var IMG_MIN_SIZE = 28;
  var TEXT_LIMIT = 80;
  var registry = {};
  var tampered = false;

  var BLACKLIST = {
    SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, META: 1, LINK: 1, TITLE: 1,
    TEMPLATE: 1, SVG: 1, HEAD: 1, BASE: 1, BR: 1, HR: 1, IFRAME: 1
  };

  var CLICKABLE_TAGS = {
    A: 1, BUTTON: 1, INPUT: 1, SELECT: 1, TEXTAREA: 1, LABEL: 1, SUMMARY: 1
  };

  var CLICKABLE_ROLES = {
    button: 1, link: 1, checkbox: 1, radio: 1, menuitem: 1, menuitemcheckbox: 1,
    menuitemradio: 1, tab: 1, option: 1, switch: 1, textbox: 1, searchbox: 1,
    combobox: 1, slider: 1, treeitem: 1, listbox: 1, spinbutton: 1
  };

  var BANNER_ID = 'redhand-overlay-banner';
  var CURSOR_ID = 'redhand-cursor-overlay';
  var CARD_ID = 'redhand-view-card';
  var TOAST_ID = 'redhand-tab-toast';

  function tabLabel() {
    var t = document.title || window.location.hostname || 'this tab';
    return t.length > 44 ? t.slice(0, 44) + '...' : t;
  }

  /* ---------- visibility layer (banner, cursor, card, toast) ---------- */

  var GLASS = 'background:rgba(11,14,20,.92);color:#E6E9EF;backdrop-filter:blur(10px);'
    + '-webkit-backdrop-filter:blur(10px);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;'
    + 'pointer-events:none;';

  function ensureOverlay() {
    if (!document.body) { return; }
    if (!document.getElementById(BANNER_ID)) {
      var b = document.createElement('div');
      b.id = BANNER_ID;
      b.setAttribute('style', 'position:fixed;top:10px;left:50%;transform:translateX(-50%);'
        + 'z-index:2147483647;display:flex;align-items:center;gap:8px;padding:7px 14px 7px 11px;'
        + 'border-radius:4px;border:1px solid rgba(255,59,78,.45);border-left:3px solid #FF3B4E;'
        + 'box-shadow:0 4px 18px rgba(0,0,0,.5);opacity:.96;white-space:nowrap;max-width:62vw;'
        + 'overflow:hidden;transition:opacity .3s ease;' + GLASS + 'font-size:11.5px;');
      b.innerHTML = '<span class="rh-pulse"></span><span class="rh-banner-text"></span>';
      document.body.appendChild(b);
      var pulse = b.querySelector('.rh-pulse');
      pulse.setAttribute('style', 'width:8px;height:8px;border-radius:50%;background:#FF3B4E;'
        + 'flex:0 0 auto;animation:rhPulse 1.6s ease-in-out infinite;');
      var style = document.createElement('style');
      style.textContent = '@keyframes rhPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(.7)}}';
      document.head.appendChild(style);
      setBannerDefault();
    }
    if (!document.getElementById(CURSOR_ID)) {
      var c = document.createElement('div');
      c.id = CURSOR_ID;
      c.setAttribute('style', 'position:fixed;left:0;top:0;z-index:2147483646;pointer-events:none;'
        + 'width:20px;height:20px;transform:translate(-100px,-100px);transition:transform 50ms linear;'
        + 'opacity:0;filter:drop-shadow(0 1px 4px rgba(255,59,78,.6))');
      c.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24">'
        + '<path d="M4 2 L20 12 L12 13.5 L15.5 21 L13 22 L9.5 14.5 L4 19 Z" '
        + 'fill="#FF3B4E" stroke="#ffffff" stroke-width="1.1"/></svg>';
      document.body.appendChild(c);
    }
  }

  function setBannerDefault() {
    var b = document.getElementById(BANNER_ID);
    if (b) {
      b.querySelector('.rh-banner-text').textContent = 'redhand is operating: ' + tabLabel();
    }
  }

  function setBanner(text) {
    ensureOverlay();
    var b = document.getElementById(BANNER_ID);
    if (b) {
      b.querySelector('.rh-banner-text').textContent = text;
    }
  }

  /* Announce what the agent is doing ON THE OPERATED TAB.
     Self-gates: the card/banner variants only render when the user is
     actually looking at this tab (visibilityState === 'visible'). */
  function announce(kind) {
    if (document.visibilityState !== 'visible') {
      setBannerDefault();
      return;
    }
    ensureOverlay();
    if (kind === 'viewed') {
      var old = document.getElementById(CARD_ID);
      if (old && old.parentNode) { old.parentNode.removeChild(old); }
      var card = document.createElement('div');
      card.id = CARD_ID;
      card.setAttribute('style', 'position:fixed;top:52px;left:50%;transform:translateX(-50%);'
        + 'z-index:2147483647;display:flex;gap:10px;align-items:flex-start;padding:10px 14px 10px 12px;'
        + 'border-radius:4px;border:1px solid rgba(255,59,78,.45);border-left:3px solid #FF3B4E;'
        + 'box-shadow:0 8px 28px rgba(0,0,0,.55);opacity:0;transition:opacity .25s ease,transform .25s ease;'
        + 'transform:translateY(-6px);max-width:440px;' + GLASS + 'font-size:11.5px;');
      card.innerHTML = '<div style="flex:0 0 auto">' + cursorSvg(18) + '</div>'
        + '<div><div style="font-weight:700;color:#FF3B4E;margin-bottom:3px">agent viewed this page</div>'
        + '<div style="color:#E6E9EF">' + escapeHtml(tabLabel()) + '</div>'
        + '<div style="color:#8B93A5;margin-top:2px">' + clock() + '</div></div>';
      document.body.appendChild(card);
      requestAnimationFrame(function () {
        card.style.opacity = '1';
        card.style.transform = 'translateX(-50%)';
      });
      setTimeout(function () {
        card.style.opacity = '0';
        card.style.transform = 'translateX(-50%) translateY(-6px)';
        setTimeout(function () {
          if (card.parentNode) { card.parentNode.removeChild(card); }
        }, 300);
      }, 3200);
    } else if (kind === 'watching') {
      setBanner('redhand agent is seeing your current tab');
    }
  }

  function clock() {
    var d = new Date();
    function p(n) { return n < 10 ? '0' + n : '' + n; }
    return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function cursorSvg(size) {
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24">'
      + '<path d="M4 2 L20 12 L12 13.5 L15.5 21 L13 22 L9.5 14.5 L4 19 Z" '
      + 'fill="#FF3B4E" stroke="#ffffff" stroke-width="1.1"/></svg>';
  }

  function cursorMove(x, y) {
    ensureOverlay();
    var c = document.getElementById(CURSOR_ID);
    if (c) {
      c.style.transform = 'translate(' + (x - 2) + 'px,' + (y - 2) + 'px)';
      c.style.opacity = '1';
    }
  }

  function cursorClick(x, y) {
    cursorMove(x, y);
    var r = document.createElement('div');
    r.setAttribute('style', 'position:fixed;z-index:2147483646;pointer-events:none;'
      + 'left:' + (x - 15) + 'px;top:' + (y - 15) + 'px;width:30px;height:30px;'
      + 'border:2px solid #FF3B4E;border-radius:50%;opacity:.9;transition:all .35s ease-out');
    document.body.appendChild(r);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        r.style.transform = 'scale(2.2)';
        r.style.opacity = '0';
      });
    });
    setTimeout(function () {
      if (r.parentNode) { r.parentNode.removeChild(r); }
    }, 420);
  }

  function animatePath(points) {
    var t = 0;
    for (var i = 0; i < points.length; i++) {
      var p = points[i];
      t = t + (p[2] || 0);
      (function (x, y, at) {
        setTimeout(function () { cursorMove(x, y); }, at);
      })(p[0], p[1], t);
    }
  }

  /* Toast on the tab the USER is looking at (self-gated on visibility).
     Heartbeat model: every action re-invokes this; the toast stays visible
     during active work and fades only after the quiet period. */
  function showToast(line1, line2) {
    if (document.visibilityState !== 'visible') { return; }
    var root = document.body || document.documentElement;
    if (!root) { return; }
    var el = document.getElementById(TOAST_ID);
    if (!el) {
      el = document.createElement('div');
      el.id = TOAST_ID;
      el.setAttribute('style', 'position:fixed;bottom:16px;right:16px;z-index:2147483647;'
        + 'display:flex;align-items:center;gap:9px;padding:9px 14px 9px 12px;'
        + 'border-radius:4px;border:1px solid rgba(255,59,78,.45);border-left:3px solid #FF3B4E;'
        + 'box-shadow:0 8px 28px rgba(0,0,0,.55);pointer-events:none;max-width:400px;'
        + 'opacity:0;transform:translateY(8px);transition:opacity .25s ease,transform .25s ease;'
        + GLASS + 'font-size:11.5px;');
      el.innerHTML = '<span class="rh-pulse"></span><div><div class="rh-t1"></div>'
        + '<div class="rh-t2" style="color:#8B93A5;margin-top:2px"></div></div>';
      root.appendChild(el);
    }
    el.querySelector('.rh-t1').textContent = line1;
    el.querySelector('.rh-t2').textContent = line2 || '';
    el.style.opacity = '1';
    el.style.transform = 'translateY(0)';
    if (el.__redhandToastTimer) { clearTimeout(el.__redhandToastTimer); }
    el.__redhandToastTimer = setTimeout(function () {
      el.style.opacity = '0';
      el.style.transform = 'translateY(8px)';
    }, 9000);
  }

  function hideOverlay() {
    var ids = [BANNER_ID, CURSOR_ID, CARD_ID, TOAST_ID];
    for (var i = 0; i < ids.length; i++) {
      var el = document.getElementById(ids[i]);
      if (el && el.parentNode) { el.parentNode.removeChild(el); }
    }
    return { done: true };
  }

  /* Screenshot masking: opaque covers over every visible credential field's
     rect so Page.captureScreenshot never ships secret values as pixels.
     Covers INPUT/TEXTAREA value rendering (including reveal-toggles); text
     rendered by the page itself is shape-scrubbed in text channels only —
     documented residual gap. */
  var MASK_CLASS = 'redhand-secret-mask';

  function maskSecrets() {
    var fields = document.querySelectorAll('input,textarea');
    var added = 0;
    for (var i = 0; i < fields.length; i++) {
      var el = fields[i];
      if (!isSensitiveField(el)) { continue; }
      if (!isVisible(el)) { continue; }
      var r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) { continue; }
      var m = document.createElement('div');
      m.className = MASK_CLASS;
      m.setAttribute('style', 'position:fixed;z-index:2147483645;pointer-events:none;background:#111827;'
        + 'left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;height:' + r.height + 'px');
      document.body.appendChild(m);
      added = added + 1;
    }
    return { masked: added };
  }

  function unmask() {
    document.querySelectorAll('.' + MASK_CLASS).forEach(function (m) {
      if (m.parentNode) { m.parentNode.removeChild(m); }
    });
    return { done: true };
  }

  /* ---------- element discovery ---------- */

  function isVisible(el) {
    var cs = null;
    try { cs = window.getComputedStyle(el); } catch (err) { cs = null; }
    if (!cs) { return false; }
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') { return false; }
    var r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) { return false; }
    return true;
  }

  function inViewport(r) {
    return r.right > 0 && r.bottom > 0 && r.left < window.innerWidth && r.top < window.innerHeight;
  }

  function isClickable(el) {
    var tag = el.tagName.toUpperCase();
    if (CLICKABLE_TAGS[tag]) { return true; }
    var role = el.getAttribute('role');
    if (role && CLICKABLE_ROLES[role.toLowerCase()]) { return true; }
    if (el.hasAttribute('onclick') || el.hasAttribute('jsaction') || el.hasAttribute('ng-click')) { return true; }
    if (el.isContentEditable) { return true; }
    var cs = null;
    try { cs = window.getComputedStyle(el); } catch (err) { cs = null; }
    if (cs && cs.cursor === 'pointer') { return true; }
    var ti = el.getAttribute('tabindex');
    if (ti !== null && ti !== '' && Number(ti) >= 0) { return true; }
    return false;
  }

  function collectCandidates() {
    var root = document.body || document.documentElement;
    if (!root) { return []; }
    var all = root.querySelectorAll('*');
    var out = [];
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (!el || !el.tagName) { continue; }
      var tag = el.tagName.toUpperCase();
      if (BLACKLIST[tag]) { continue; }
      var clickable = isClickable(el);
      var isImg = tag === 'IMG';
      if (!clickable) {
        if (!isImg) { continue; }
        if (el.offsetWidth < IMG_MIN_SIZE || el.offsetHeight < IMG_MIN_SIZE) { continue; }
      }
      if (!isVisible(el)) { continue; }
      out.push(el);
      if (out.length >= COLLECT_CAP) { break; }
    }
    return out;
  }

  function pruneOverlap(els) {
    if (els.length <= 1 || els.length > MAX_CANDIDATES) { return els; }
    var rects = [];
    var areas = [];
    var dropped = [];
    for (var i = 0; i < els.length; i++) {
      var r = els[i].getBoundingClientRect();
      rects.push(r);
      areas.push(r.width * r.height);
      dropped.push(false);
    }
    for (var a = 0; a < els.length; a++) {
      for (var b = a + 1; b < els.length; b++) {
        if (dropped[a] || dropped[b]) { continue; }
        var r1 = rects[a], r2 = rects[b];
        var ix = Math.min(r1.right, r2.right) - Math.max(r1.left, r2.left);
        var iy = Math.min(r1.bottom, r2.bottom) - Math.max(r1.top, r2.top);
        if (ix <= 0 || iy <= 0) { continue; }
        var inter = ix * iy;
        var minArea = Math.min(areas[a], areas[b]);
        if (minArea <= 0) { continue; }
        if (inter / minArea > OVERLAP_RATIO) {
          var aTag = els[a].tagName.toUpperCase();
          var bTag = els[b].tagName.toUpperCase();
          var aTagged = !!CLICKABLE_TAGS[aTag];
          var bTagged = !!CLICKABLE_TAGS[bTag];
          if (aTagged !== bTagged) {
            if (aTagged) { dropped[b] = true; } else { dropped[a] = true; }
          } else if (areas[a] >= areas[b]) { dropped[a] = true; } else { dropped[b] = true; }
        }
      }
    }
    var kept = [];
    for (var k = 0; k < els.length; k++) {
      if (!dropped[k]) { kept.push(els[k]); }
    }
    return kept;
  }

  var SENSITIVE_HINTS = /token|api[-_]?key|apikey|secret|password|passwd|pwd|pass|credential|auth|authz|bearer|session|sess|sid|cookie|jwt|otp|one[-_]?time|nonce|sig|signature|refresh|private[-_]?key/i;
  var PEM_PATTERN = /-----BEGIN[A-Z ]*PRIVATE KEY-----|-----BEGIN [A-Z ]+-----/i;
  var TOKEN_SHAPE = /ghp_[A-Za-z0-9_]{20,}|gho_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|xox[abprs]-[A-Za-z0-9-]{10,}|eyJ[A-Za-z0-9_-]{8,}[.][A-Za-z0-9_-]{8,}[.][A-Za-z0-9_-]{8,}/;

  /* Credential-field detection: password inputs, fields whose name/id/
     placeholder/aria/autocomplete suggest secrets, and secret-looking
     content (PEM blocks, long opaque blobs). Redaction applies to VALUES
     only — the agent still sees that a credential field exists, which is
     what it needs to operate, but never the value itself. */
  function isSensitiveField(el) {
    if (el.tagName === 'INPUT' && el.type === 'password') { return true; }
    if (el.getAttribute && el.getAttribute('autocomplete') === 'one-time-code') { return true; }
    var hay = [el.name, el.id, el.getAttribute('placeholder'), el.getAttribute('aria-label'), el.getAttribute('autocomplete')].join(' ');
    if (SENSITIVE_HINTS.test(hay)) { return true; }
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.isContentEditable) {
      var v = el.isContentEditable ? String(el.textContent || '') : String(el.value || '');
      if (PEM_PATTERN.test(v)) { return true; }
      if (TOKEN_SHAPE.test(v)) { return true; }
      var dense = v.replace(/\\s+/g, '');
      if (dense.length > 60 && /^[A-Za-z0-9_+=\\/.:@-]+$/.test(dense)) { return true; }
      if (v.length > 120 && !/\\s/.test(v)) { return true; }
    }
    return false;
  }

  var REDACTED = '[REDACTED credential field]';

  function visibleText(el) {
    var tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') {
      if (isSensitiveField(el)) { return REDACTED; }
      if (tag === 'INPUT' && el.type === 'password') { return 'password field'; }
      return String(el.value || '');
    }
    var text = el.textContent || '';
    text = text.replace(/\\s+/g, ' ').trim();
    /* Non-input widgets can carry secrets too (contenteditable pseudo-fields,
       role=textbox, copy chips, labelled divs) — scrub before truncation. */
    if (PEM_PATTERN.test(text) || TOKEN_SHAPE.test(text)) { return REDACTED; }
    var dense = text.replace(/\\s+/g, '');
    if (dense.length > 60 && /^[A-Za-z0-9_+=\\/.:@-]+$/.test(dense)) { return REDACTED; }
    if (text.length > TEXT_LIMIT) { text = text.slice(0, TEXT_LIMIT) + '...'; }
    return text;
  }

  function describe(el) {
    var tag = el.tagName.toLowerCase();
    var id = el.id ? '#' + el.id : '';
    var cls = typeof el.className === 'string' && el.className
      ? '.' + el.className.split(/\\s+/).slice(0, 3).join('.')
      : '';
    var role = el.getAttribute('role') ? '[role=' + el.getAttribute('role') + ']' : '';
    var text = visibleText(el);
    return '<' + tag + id + cls + role + '>' + (text ? ' ' + text : '');
  }

  function snapshot() {
    ensureOverlay();
    var cands = collectCandidates();
    cands = pruneOverlap(cands);
    var filtered = [];
    for (var i = 0; i < cands.length; i++) {
      var r = cands[i].getBoundingClientRect();
      if (!inViewport(r)) { continue; }
      filtered.push(cands[i]);
      if (filtered.length >= MAX_CANDIDATES) { break; }
    }
    document.querySelectorAll('[' + INDEX_ATTR + ']').forEach(function (prev) {
      prev.removeAttribute(INDEX_ATTR);
    });
    registry = {};
    var out = [];
    var index = 1;
    for (var j = 0; j < filtered.length; j++) {
      var el = filtered[j];
      el.setAttribute(INDEX_ATTR, String(index));
      registry[index] = el;
      var rect = el.getBoundingClientRect();
      var role = el.getAttribute('role');
      var entry = {
        index: index,
        tag: el.tagName.toLowerCase(),
        role: role || undefined,
        text: visibleText(el) || undefined,
        ariaLabel: (el.getAttribute('aria-label') || '').slice(0, 200) || undefined,
        placeholder: (el.getAttribute('placeholder') || '').slice(0, 200) || undefined,
        href: el.tagName === 'A' ? el.getAttribute('href') || undefined : undefined,
        disabled: el.disabled === true ? true : undefined,
        rect: {
          x: Math.round(rect.left * 100) / 100,
          y: Math.round(rect.top * 100) / 100,
          width: Math.round(rect.width * 100) / 100,
          height: Math.round(rect.height * 100) / 100
        }
      };
      out.push(entry);
      index = index + 1;
    }
    return out;
  }

  /* Element lookup reads the CLOSURE registry, not the DOM attribute — a
     page cannot reassign what an index points to between snapshot and click
     (TOCTOU/attribute-reassignment defense). The attribute is kept for
     debugging only. */
  function element(i) {
    var n = Number(i);
    if (!isFinite(n) || n < 1) { return null; }
    return registry[n] || null;
  }

  function liveRect(i) {
    var el = element(i);
    if (!el) { return { rect: null }; }
    var r = el.getBoundingClientRect();
    return { rect: {
      x: Math.round(r.left * 100) / 100,
      y: Math.round(r.top * 100) / 100,
      width: Math.round(r.width * 100) / 100,
      height: Math.round(r.height * 100) / 100
    } };
  }

  function focus(i) {
    var el = element(i);
    if (!el || typeof el.focus !== 'function') { return { ok: false }; }
    el.focus();
    return { ok: document.activeElement === el };
  }

  function scrollIntoView(i) {
    var el = element(i);
    if (!el) { return { done: false }; }
    try {
      if (typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ block: 'center', behavior: 'instant' });
      }
    } catch (err) {
      return { done: false };
    }
    return { done: true };
  }

  function selectOption(i, value) {
    var el = element(i);
    if (!el || el.tagName !== 'SELECT') { return { ok: false }; }
    el.value = value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true };
  }

  function clear() {
    document.querySelectorAll('[' + INDEX_ATTR + ']').forEach(function (prev) {
      prev.removeAttribute(INDEX_ATTR);
    });
    return { done: true };
  }

  /* Poison-proof install: defineProperty replaces any page-set accessor and
     survives page reassignment attempts (writable:false). A page that locked
     the property non-configurable trips the tampered flag — the driver
     surfaces it instead of silently operating on forged data. */
  var API = {
    version: '0.1.1',
    snapshot: snapshot,
    element: element,
    liveRect: liveRect,
    focus: focus,
    scrollIntoView: scrollIntoView,
    selectOption: selectOption,
    clear: clear,
    describe: describe,
    tagOf: function (i) {
      var el = element(i);
      return el ? el.tagName.toLowerCase() : '';
    },
    cursorMove: cursorMove,
    cursorClick: cursorClick,
    animatePath: animatePath,
    hideOverlay: hideOverlay,
    maskSecrets: maskSecrets,
    unmask: unmask,
    ensureOverlay: ensureOverlay,
    showToast: showToast,
    announce: announce,
    tabLabel: tabLabel,
    isTampered: function () { return tampered; }
  };
  try {
    Object.defineProperty(window, '__redhand', { value: API, writable: false, configurable: true });
  } catch (err) {
    try { window.__redhand = API; } catch (err2) { tampered = true; }
    if (window.__redhand !== API) { tampered = true; }
  }
})();
`;
