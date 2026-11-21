# Medium draft v2 — redhand launch

Title: **I Orchestrated an AI Agent Into Building a Browser Operator. Then It Submitted Itself to a Directory.**

Subtitle: Three days, one AI agent, two red-team passes, 27 license exploits, and a build test that passed in 85 seconds. This is what orchestration over prompting actually looks like.

---

Last month I wrote that prompting is a dead end and orchestration is where agents actually get useful.

This post is the case study.

Three days ago I got curious about how commercial AI browser operators work — the ones where an agent signs into websites, fills forms, clicks buttons while the human watches. The marketing says "AI controls your browser." I didn't want the marketing. I wanted the mechanism.

So I ran an investigation the way I now run everything: I pointed. An AI agent executed. I graded the output, killed what was wrong, and redirected.

---

## What the decompile revealed

The operator I studied is an extension. Decompiled, the secret wasn't AI at all — it was three boring-looking engineering decisions stacked together:

**Element-index addressing, not vision.** No screenshots. No "find the button in this image." The tool tags every interactive element with an ID, builds a text list — index, tag, label, position — and hands the model a number to answer with. Coordinates get computed from the DOM *at click time*, not from a stale screenshot.

**Trusted input.** Every click and keystroke goes through the browser's own input pipeline. The page receives events with `isTrusted: true` — indistinguishable from a human.

**State-after-every-action.** Each action returns the new element list. The model closes decide→act→see in one round-trip. No re-screenshotting to check if the click worked.

Vision loops — screenshot, model, guess coordinates, miss, retry — are doing it wrong. The tools that get browser control right stopped asking a model to *see* and started letting it *read*.

---

## The rebuild, orchestrated

I didn't write the code. That's not the flex people think it is — it's the workflow.

I set the rules: raw CDP over WebSocket, no automation frameworks, the browser is never a disposable copy (your real sessions, your real fingerprint), the user always knows what's happening, secrets stay secrets. The agent picked the language, wrote the code, and defended the choices when I pushed back — and I pushed back twice.

Once on a lazy design decision. Once when the first draft of this project's own README erased who did what — a 7 out of 10, and the reason this post exists in its current form.

The result: a tool where an AI agent can drive your *real* logged-in browser — element-index addressing, humanized mouse curves with overshoot-and-correct, cadence typing with typos, state-after every action. Snapshot in 69 milliseconds. Click in 0.46 to 1.1 seconds, deliberately humanized.

---

## The part GitHub taught me

The flow I'm proudest of: my agent submitting redhand to a directory listing. By itself. While I watched WhatsApp.

The agent opened the site, signed in through the GitHub OAuth button, authorized the app, created the account, opened the Add Server wizard, filled the form, configured its own Docker build, and triggered Build & Release.

One minute twenty-five seconds later: build test passed. Listing live. Score badge published.

The instructive failure came first. My agent's first attempts to authorize used JavaScript — `form.requestSubmit()`, direct `.click()` calls. GitHub rejected every single one: `error=access_denied. The user has denied your application access.`

The form was submitting fine. But without a **user-activated gesture**, GitHub treats the authorization as denied. A silent script click isn't consent — by design.

The fix: stop clicking from JavaScript. Scroll the button into view, let the tool index it, and dispatch a real trusted press through the input pipeline — the exact event a human click produces. Authorized on the first try.

That's the whole lesson of this project in one bug. *Calling* an action and *performing* it are different things, and the gap is where most agent tooling dies.

---

## The red team, turned inward

Two features got the adversarial treatment, because I know how I'd attack them.

**Secret redaction.** Credential values (passwords, API keys, tokens) get redacted at the source — the agent can type into a login field but the value never enters the agent's context. I had two red-team agents attack that guarantee. They found twelve bypasses: secrets as plain page text, contenteditable pseudo-fields, token-shaped strings under 120 characters, page-poisoned APIs, element reassignment between snapshot and click. Every one patched — text-channel scrubbing, closure registries, poison-proof installs, tamper detection that throws typed errors instead of silently clicking wrong things.

**The license.** The first draft of the Additional Use Grant said "free for bug bounty work." My exploit analysis was one sentence: *BugHound Ltd builds a scanning SaaS on this, sells it to clients, and calls it bug bounty work — free forever.* Three agents took that further and found twenty-seven exploits total. The rewritten grant follows the *user and the offering*, not the label of the activity. Individuals stay free — even paid bounties. Entities, products, and client work don't.

---

## The visibility system

The part users actually feel: you always know what the agent is doing.

A banner sits on every operated tab — *"redhand is operating: \<tab name\>"*. A red cursor traces the agent's path with click ripples. When the agent works in a background tab while you're elsewhere, your active tab shows a toast — *"clicking 'Sign in' — in: \<other tab\>"*.

The background part is not a trick. I verified it: clicked elements in a tab whose `visibilityState` was `hidden` while I was chatting on WhatsApp. The tab never needed focus. You never stopped working.

---

## The honest part

- Screenshots mask credential fields, but text a page renders openly is text a multimodal model can read. Documented, not hidden.
- Background tabs throttle their own timers — cosmetic animations slow down. The actions don't.
- The humanized click is deliberately slower than raw automation (1.1s vs 0.46s). That's the anti-detection feature working. There's a `fast` dial for your own admin panels.
- Async re-grading exists: my tool-description upgrades are live, the score re-evaluation is still processing. The badge updates itself.

---

## What it's for

Anything a browser can do:

- The repetitive form you fill every day — seconds, no typos, while you do something else.
- Data extraction behind logins, with the network traffic captured alongside.
- QA loops on your own apps with real sessions.
- Security research on authorized targets — the niche it was born in.
- Browser games. I'm not even embarrassed. An agent playing with humanized mouse curves is the best demo I've recorded.

---

## Orchestration, demonstrated

The stack that shipped this: one human directing, one AI agent executing, two red-team agents attacking, three license-review agents exploiting. Every grade I gave came back as a fix. Every exploit came back as a patch.

That's the difference between prompting and orchestrating. Prompting is asking a model for an answer. Orchestration is pointing a system at a goal and grading the output until it's done.

redhand is on GitHub. The README has a live demo GIF — the banner, the red cursor, the typo-and-correct typing. The full reverse-engineering notes, the benchmarks, and the license are in the docs.

⭐ [github.com/theredhacker0345/redhand](https://github.com/theredhacker0345/redhand)
