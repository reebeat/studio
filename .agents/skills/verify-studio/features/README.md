# reebeat studio feature map

The maintained list of what a person can do or see in the editor, with how to observe each and what counts as broken. The entries live in the files below; this index holds what they share. Commands are relative to the skill directory, `.agents/skills/verify-studio/`.

An entry is a level-3 heading that opens with its id in backticks, then a `Spec: NNNN` line naming the spec(s) that define it. `tools/quality/test/featureMap.test.ts` reads these headings: a spec that no entry names, and does not say `Verify skill: none, <reason>`, fails `bun run test`.

## Features

- [The editor shell](./shell.md) (spec 0000): `shell-load`, `shell-regions`, `shell-inspector-toggle`, `shell-layout`, `shell-build`.

## Planned, not built (no entry yet)

Nothing below can be observed, so no entry exists: an entry for an unbuilt feature would be a claim nobody can check. The PR that builds one adds its entries in the same PR.

| Planned | Spec | Becomes entries like |
| --- | --- | --- |
| Story graph from a real story, preview scrub, one edit one patch, offline journey | [0001](../../../../docs/specs/0001-first-felt-journey.md) (blocked on reebeat 0004 and 0006) | `graph-matches-plan`, `preview-frame-equals-video-frame`, `edit-one-property`, `edit-refused-when-invalid`, `offline-free-journey` |
| The other lenses (Cut, Color, Audio, Deck, Review and so on) | [`docs/design/lenses.md`](../../../../docs/design/lenses.md), design only | one entry per lens when it has a spec |
| Collaboration (replicated document, sync server) | spec 0002 (a spike, PR #3) | entries only if a user-visible surface lands |

## Baseline preconditions

- `scripts/launch.sh` runs under a supervisor and printed `VERIFY READY origin=<url> run=<dir>`; `scripts/doctor.sh` printed `DOCTOR OK`. Never drive an instance that did not.
- The instance is this run's: one per worktree, the port drawn at random and listed in `state.env`. Never drive an origin the run did not print.
- A Chromium on `PATH` (`chromium`; devenv does not provide one) for `doctor.sh` and `page.sh`. The browser tool brings its own.
- No network is needed: the free journey makes no request but its own static files.

## Driving conventions

- **Real browser, user path.** Click and read the page as a person does: ARIA roles and accessible names (`role/button[name='Hide inspector']`), not CSS classes or internals. The OMP `browser` tool is the default: `browser.open({ name, url: origin, app: { tern: false }, viewport, allowed_domains: ["127.0.0.1"], wait_until: "networkidle0" })` (the default Tern backend may have no web engine). The `agent-browser` CLI (skill `agent-browser`) does the same when OMP's tool is not available; use it only then.
- **Capture the action and the result, not only the last screen**: a screenshot or state record before and after each click. Save a PNG with `page.screenshot` through `tab.run` (`tab.run(async ({ page }, p) => { await page.screenshot({ path: p, type: "png" }); }, { args: ["<run>/screenshots/<name>.png"] })`); `tab.screenshot({ path })` writes to `/tmp`, not to `path`.
- **Look at it.** Read each screenshot; never assume it from the DOM alone.
- **A failed entry stays failed.** Record the reason in `<run>/notes.md` with the command and the raw output, and report it. Never weaken an entry's "broken when" to pass. An unreachable entry is reported with the command tried and the missing precondition, never as verified through another path.
- **Every number in the report has its script, its raw output and its command.** A size, a count or a time that is not in a file in the run directory, produced by a command the report names, does not count.
- Save raw results next to the artifacts (`notes-*.json`, `notes.md`). `scripts/cleanup.sh --features "<ids>"` hashes everything into `REPORT.md`.
