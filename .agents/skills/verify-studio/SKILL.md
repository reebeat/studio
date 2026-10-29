---
name: verify-studio
description: "Run the reebeat studio editor (a Foldkit app) on a disposable instance, drive it in a real browser as a person does, and keep evidence that survives cleanup. Use to verify a change to apps/editor or its toolchain, to review a studio pull request, or to update the feature map when a PR adds or changes user-visible behaviour."
---

<!-- Provenance: adapted from phibkro/vektorprogrammet-reimagined @ 1104c3019a76c619c4c8e9ee04c71ce191467ed4
     (.agents/skills/verify-vektorprogrammet): the launch, doctor, drive, evidence and cleanup shape, `headroom.sh` and
     `lib.sh`. Deviations: no database, CMS or overlay; one Vite app; headless Chromium and the OMP `browser` tool.
     Spec 0003 introduced it. See PROVENANCE.md. -->

# Verify reebeat studio

You are reading this cold, mid-task. This skill builds and serves the editor of one worktree, checks that the instance is worth driving, drives the features in the feature map as a user does, saves evidence outside the worktree, and tears everything down without touching the evidence.

The surface is a **web UI**: `apps/editor`, a Foldkit single-page app. Today it is a placeholder shell (spec 0000): the map lists only that. Read `AGENTS.md` for the repository's rules (devenv for everything; no `--no-verify`; never `git worktree` bare, see "Reviewing a pull request").

```text
scripts/launch.sh [preview|dev] ─► headroom ─► (bun install) ─► vp build (preview) ─► vp preview|dev on a random loopback port
                                   └─ doctor must pass, then it prints "VERIFY READY origin=… run=…" and stays in the foreground
scripts/doctor.sh   read-only: alive, ours, at this commit, document served, runtime booted in Chromium
drive:   browser tool (clicks, state) · scripts/page.sh (DOM + screenshot, no clicks)
scripts/cleanup.sh  stop what we started, write REPORT.md, keep the run directory
```

Paths below are relative to this skill's directory, `.agents/skills/verify-studio/`. Scripts find the tree with `git rev-parse --show-toplevel`; set `VERIFY_TREE=<path>` to verify another worktree.

## Launch

```sh
.agents/skills/verify-studio/scripts/launch.sh          # preview: the production bundle (default)
.agents/skills/verify-studio/scripts/launch.sh dev      # vp dev
```

Run it under a supervisor that keeps custody and waits for the ready line; never background it with `nohup`, `setsid` or `&`. In OMP: the `bash` tool with a `name` (for example `verify-studio-pr7`) and `ready: { "log": "VERIFY READY", "timeout": 240 }`.

In order: refuses a second live run for the worktree; runs `headroom.sh` (the operator's limits of 2026-10-29: `MemAvailable` after the job's demand at least 20% of RAM, swap-in under 1000 pages per second over a 10 s sample, memory PSI `full` avg60 under 10%, 1-minute load average under the CPU threads, and free disk for the job's writes; short on any → exit 1 and it names each one; `VERIFY_FORCE=1` skips it and the report records that); installs dependencies in a fresh worktree; creates the run directory and a per-worktree pointer **before** starting anything, so `cleanup.sh` finds the run even if the server never comes up; builds (preview); serves; runs the doctor. **Ready means usable.** A build that fails stops the launch: that is a finding, with the log in `serve.log`. Back off your own job if PSI `full` avg60 stays above 20%, or swap-in stays above its limit, for a minute.

Knobs: `VERIFY_TREE`, `VERIFY_PR` (names the run directory `<UTC date>-pr<N>`, else the short sha), `VERIFY_EVIDENCE_ROOT` (default `~/.local/state/reebeat-studio-verify`), `VERIFY_FORCE=1`, and `DEMAND_MEM_MIB` / `DEMAND_DISK_MIB` / `SAMPLE_SECONDS` for `headroom.sh`. Never drive an origin this run did not print.

## Doctor

`scripts/doctor.sh` prints `DOCTOR OK` and exits 0 only if: `launch.sh` is alive; the worktree is still at the commit that was launched (a checkout underneath a running instance makes every observation about another commit); the port is held by this run's process tree; `/` answers with `<title>reebeat studio</title>`; and headless Chromium renders the `h1` and the `Story graph`, `Preview` and `Timeline` regions (the Foldkit runtime booted). Run it before the first drive, after any failed drive, and whenever a page looks wrong. On `DOCTOR FAILED` read `serve.log` in the run directory.

## Drive

Pick the entries from [`features/README.md`](features/README.md) (index, conventions) and follow each entry in [`features/shell.md`](features/shell.md): how to observe it, what counts as broken. Two tools, both writing into the run directory:

- **What it rendered, no clicks**: `scripts/page.sh <name> [--path /] [--size 1280x900]` saves `pages/<name>.html` (the DOM after the runtime booted) and `screenshots/<name>.png`. Read the image.
- **What happens when a person acts**: the OMP `browser` tool. The default Tern backend may have no web engine, so open with `app: { tern: false }`. `tab.screenshot({ path })` writes to `/tmp`, not to `path`: save evidence with `page.screenshot` through `tab.run`.

```js
const run = "<run directory from state.env>"; // origin: VERIFY_ORIGIN in <run>/state.env
const tab = await browser.open({ name: "studio-verify", url: origin + "/", app: { tern: false },
  viewport: { width: 1280, height: 900 }, allowed_domains: ["127.0.0.1"], wait_until: "networkidle0" });
const shot = (name) => tab.run(async ({ page }, p) => { await page.screenshot({ path: p, type: "png" }); },
  { args: [`${run}/screenshots/${name}.png`] });
await shot("toggle-1-initial");
await tab.click("role/button[name='Hide inspector']");   // accessible roles and names, not CSS classes
const state = { inspector: await tab.count("aside[aria-label='Inspector']"), expanded: await tab.attr("button", "aria-expanded") };
await Bun.write(`${run}/notes-browser-drive.json`, JSON.stringify(state, null, 2));
await tab.close();
```

The `agent-browser` CLI (skill `agent-browser`) is the fallback when the OMP tool is unavailable. Where the instance is real and where it is not: the app, the bundle, the Vite server and Chromium are real; there is no backend, no story and no network (nothing reads the story IR yet).

## Evidence

The run directory is `~/.local/state/reebeat-studio-verify/<UTC date>-pr<N>/` (a second run the same day gets `-2`): outside the worktree and outside every path a worktree or `git clean` removes. `cleanup.sh` never deletes it.

| Path | What |
| --- | --- |
| `REPORT.md` | commit, branch, mode, whether headroom was forced, the entries driven, every artifact with size and SHA-256 |
| `meta.env`, `state.env`, `git-status.txt` | what launch decided, origin and pids, the tree's dirty paths at launch (no secrets) |
| `serve.log` | build and server output |
| `screenshots/`, `pages/` | what you captured |
| `notes.md`, `notes-*.json` | what you observed, with the command that produced each figure |

Proof standards:

- **Exercise the real user path**: clicks and reads by accessible name, not internal setters or a patched Model.
- **Capture the action and the state**, before and after each click; look at each screenshot.
- **Every number in the report has its script, its raw output and its command.** A figure that is not in a file in the run directory, produced by a command the notes name, does not count.
- **A failed entry stays failed.** Record the reason, keep the artifacts, do not weaken the entry. An unreachable entry is reported with the command tried and the missing precondition, never as verified through another path.
- Mark the entries that you did not drive. `scripts/cleanup.sh --features "<ids>"` records what you did.

## Cleanup

Stop the supervised launch (OMP: kill the named bash job) or let `scripts/cleanup.sh --features "<ids>"` do it: it interrupts a live `launch.sh`, stops any listener left on this run's recorded port, writes `REPORT.md`, removes the pointer, and prints the files kept. It is safe after a failed launch and safe twice (`nothing to clean`). To regenerate the report of a finished run: `VERIFY_RUN_DIR=<run> scripts/cleanup.sh --features "<ids>"`. Close browser tabs you opened. Remove a reviewer worktree once the evidence is kept (it lives in the evidence root, not in the worktree).

## Reviewing a pull request

1. **Head in its own worktree**, from a clean place. Use the full path: the harness rewrites a bare `git worktree` into `omp worktree`, which once copied `.worktrees/` into itself (189 to 215 GB).

   ```sh
   /run/current-system/sw/bin/git worktree add --detach .worktrees/pr-$N-verify origin/<head branch>
   VERIFY_TREE=$PWD/.worktrees/pr-$N-verify VERIFY_PR=$N .agents/skills/verify-studio/scripts/launch.sh   # supervised
   ```

   Run `.agents/skills/verify-studio/scripts/headroom.sh` first when other jobs are running (launch runs it too). Use `git diff --name-only origin/<base>...HEAD` for the changed paths.

2. **Pick the entries from the changed paths:**

   | Changed path | Drive |
   | --- | --- |
   | `apps/editor/src/{main,application,entry}.ts`, `index.html`, `styles.css`, `apps/editor/vite.config.ts` | every `shell-*` entry, in preview; `shell-load` and `shell-inspector-toggle` again in `dev` |
   | `package.json`, `apps/editor/package.json`, `bun.lock`, root `vite.config.ts`, an Effect or Foldkit version | `shell-build`, `shell-load`, `shell-inspector-toggle`: a version bump that breaks the boot shows only in a browser |
   | `devenv.nix` | `shell-build` |
   | a new feature under `apps/editor/src` | its new entries (added in the same PR) plus every `shell-*` entry |
   | `apps/editor/src/*.test.ts`, `testModels.ts`, `vitestSetup.ts` | nothing to drive; check that the behaviour a test now pins is in the map |
   | `.agents/skills/verify-studio/**` | run this skill once on the head and say so; the feature-map test runs in `bun run test` |
   | `tools/quality/**`, `.github/**`, `knip.json`, `docs/**`, `.agents/**`, `AGENTS.md` only | nothing to drive; say so, and verify the docs' claims against the code |

3. **Keep the skill true** (the maintenance rule of `AGENTS.md`): for each changed behaviour check that the map still describes it, that this table maps the changed paths, and that the PR added its entries. A gap is a `maintenance` finding.

## Helpers

| Script | Invocation | Purpose |
| --- | --- | --- |
| `scripts/launch.sh` | `scripts/launch.sh [preview\|dev]` (supervised, foreground) | build, serve, print `VERIFY READY` |
| `scripts/doctor.sh` | `scripts/doctor.sh` | read-only health and identity check |
| `scripts/page.sh` | `scripts/page.sh shell-phone --size 390x844` | DOM and screenshot through headless Chromium |
| `scripts/cleanup.sh` | `scripts/cleanup.sh --features "shell-load, shell-layout"` | tear down, write `REPORT.md`, keep evidence |
| `scripts/headroom.sh` | `scripts/headroom.sh` | the admission check on its own |
| `scripts/lib.sh` | sourced by the others | tree, run directory, process helpers |

`tools/quality/test/featureMap.test.ts` (part of `bun run test`) fails when a spec has no entry and no `Verify skill:` line, or an entry names a spec that does not exist.

## Exercised, and not

Exercised on 2026-10-29 (spec 0003): launch in preview and in dev from a fresh worktree of PR #1's head (`bdb3a01`, then `643096e`), the doctor, `page.sh`, the OMP `browser` tool on the toggle and the layout, `cleanup.sh` (and a second run: `nothing to clean`), a refused launch for short headroom, and two controls on `643096e` (an `update` that ignores the toggle fails `shell-inspector-toggle`; an `h1` turned into a `p` makes the doctor refuse the launch). Evidence paths are in the PR of spec 0003. Not exercised: a Windows or macOS host, a browser other than Chromium, `agent-browser`, the `VERIFY_FORCE=1` path, a PR head fetched from GitHub by number.

## Gotchas

- Chromium is on `PATH` on this host but devenv does not provide it: `doctor.sh` and `page.sh` need it; the browser tool brings its own.
- `vp preview` serves `apps/editor/dist`: a stale `dist` is rebuilt by launch in preview mode; in `dev` mode no build runs.
- The dev server prints `[foldkit:devTools] MCP relay listening at ws://127.0.0.1:<port>/__foldkit/devtools-mcp` and, per page load, `runtime connected` / `runtime disconnected`. The relay is loopback and token-guarded; never expose it. A `[foldkit] No response from @foldkit/vite-plugin` warning in the browser console means the plugin is not loaded: that is a finding (spec 0005).
- `/favicon.ico` may be requested and answers 404: the app ships none (a browser that cached the 404 does not ask again, so a run may show it or not). A different 404 is broken.
- Hooks: `bun install` runs `prepare` (`vp config`, `effect-tsgo patch`) as in any checkout. Never commit with `--no-verify`.
