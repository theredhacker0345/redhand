/**
 * The in-page executor — the zero-dependency engine injected into every page.
 *
 * This file exports the executor as a single self-evaluating source string.
 * The source is dependency-free vanilla JavaScript (no backticks, no template
 * expressions, ES5-compatible) so it can be evaluated verbatim in any page
 * context via Runtime.evaluate or Page.addScriptToEvaluateOnNewDocument.
 */

export const EXECUTOR_VERSION = "0.1.0";

export const EXECUTOR_SOURCE = `
(function () {
  'use strict';

  var INDEX_ATTR = 'data-redhand-id';
  var MAX_CANDIDATES = 1500;
  var OVERLAP_RATIO = 0.8;
  var IMG_MIN_SIZE = 28;
  var TEXT_LIMIT = 80;

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
      if (out.length >= MAX_CANDIDATES) { break; }
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
          // Prefer keeping the interactive-tag element (A/BUTTON/INPUT/...) so
          // card-style wrappers keep their href; otherwise drop the larger one.
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

  function visibleText(el) {
    var tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') {
      var t = el.type;
      if (t === 'password') { return 'password field'; }
      return String(el.value || '');
    }
    var text = el.textContent || '';
    text = text.replace(/\\s+/g, ' ').trim();
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
    var cands = collectCandidates();
    cands = pruneOverlap(cands);
    var filtered = [];
    for (var i = 0; i < cands.length; i++) {
      var r = cands[i].getBoundingClientRect();
      if (!inViewport(r)) { continue; }
      filtered.push(cands[i]);
    }
    document.querySelectorAll('[' + INDEX_ATTR + ']').forEach(function (prev) {
      prev.removeAttribute(INDEX_ATTR);
    });
    var out = [];
    var index = 1;
    for (var j = 0; j < filtered.length; j++) {
      var el = filtered[j];
      el.setAttribute(INDEX_ATTR, String(index));
      var rect = el.getBoundingClientRect();
      var role = el.getAttribute('role');
      var entry = {
        index: index,
        tag: el.tagName.toLowerCase(),
        role: role || undefined,
        text: visibleText(el) || undefined,
        ariaLabel: el.getAttribute('aria-label') || undefined,
        placeholder: el.getAttribute('placeholder') || undefined,
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

  function element(i) {
    var n = Number(i);
    if (!isFinite(n) || n < 1) { return null; }
    return document.querySelector('[' + INDEX_ATTR + '="' + n + '"]');
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

  window.__redhand = {
    version: '0.1.0',
    snapshot: snapshot,
    element: element,
    liveRect: liveRect,
    focus: focus,
    scrollIntoView: scrollIntoView,
    selectOption: selectOption,
    clear: clear,
    describe: describe
  };
})();
`;
