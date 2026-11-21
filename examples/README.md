# Examples

Runnable sessions against your real browser. Start the browser CDP-ready first
(`redhand setup` shortcut, or launch with `--remote-debugging-port=9222`), then:

```bash
node --experimental-strip-types examples/01-snapshot-click.ts
```

| File | What it shows |
|---|---|
| `01-snapshot-click.ts` | Attach, snapshot a page, click by index, read the state-after diff |
| `02-form-fill.ts` | Humanized typing into fields (ghost vs natural) + select + submit |
| `03-bounty-recon.ts` | Drive a logged-in session behind auth while capturing network requests — the security-research loop |

> Use only against systems you own or are authorized to test.
