/** Glama step 5b — direct DOM probe of the GitHub OAuth page. */
import { writeSync } from "node:fs";
import { BrowserSession } from "../packages/mcp/dist/index.js";

function log(line: string): void {
  writeSync(1, line + "\n");
}

const session = await BrowserSession.connect({ port: 9223 });
const ghTab = (await session.tabs()).find((t) => t.url?.includes("github.com"));
if (!ghTab) throw new Error("no github tab");
await session.attachToTab(ghTab.targetId);

const raw = (await session.evaluate(
  `JSON.stringify({
    title: document.title,
    forms: document.forms.length,
    candidates: Array.from(document.querySelectorAll("button,input[type=submit],a.btn")).map(function (b) {
      return { tag: b.tagName, type: b.getAttribute("type") || "", text: (b.textContent || "").trim().slice(0, 40), value: b.getAttribute("value") || "", name: b.getAttribute("name") || "" };
    }),
    bodySnippet: (document.body ? document.body.innerText : "").slice(0, 400),
  })`,
)) as unknown;
const parsed = JSON.parse(String(raw)) as {
  title: string;
  forms: number;
  candidates: Array<{ tag: string; type: string; text: string; value: string; name: string }>;
  bodySnippet: string;
};
log(`title: ${parsed.title}`);
log(`forms: ${parsed.forms}`);
for (const c of parsed.candidates) {
  log(`candidate <${c.tag} type=${c.type}> text="${c.text}" value="${c.value}" name="${c.name}"`);
}
log(`body: ${parsed.bodySnippet.replace(/\n/g, " | ").slice(0, 380)}`);
