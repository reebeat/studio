# 0005 Foldkit 0.170.0 and the Vite plugin back on

Status: **spec** (frozen when its PR opens). Date: 2026-10-29. Decided by: the lead's assignment of 2026-10-29 (Foldkit 0.170.0 and `@foldkit/vite-plugin` 0.29.0 were published 2026-10-29 19:26 UTC; bump, remove the workaround, run `ready` and the real browser journey).
Process: [spec 0000](0000-development-lifecycle.md). Branch `feat/0005-foldkit-0170`, from `main` at `d4fd75e`. Not stacked on PR #6 (spec 0004, held for Alchemy). Closes [issue #4](https://github.com/reebeat/studio/issues/4).
Feature map: `shell-load` (changed: the dev console has only `[vite]` lines) and `shell-dev-reload` (new: the Model survives a saved file); both name this spec with `Spec:`.

## Problem

Spec 0000 (Revisions 2026-10-29) left `@foldkit/vite-plugin` off: release 0.28.0 pinned `effect@4.0.0` and imported `Crypto` from the `effect` root, which effect 4.1.0 does not have, so Vite could not load a config that used it. The cost of the workaround is that the editor has no Foldkit dev tooling (model preservation across hot reloads, the devtools relay), `vp dev` waits 500 ms and prints `[foldkit] No response from @foldkit/vite-plugin` at every start, and bun prints "incorrect peer dependency" for Foldkit's `effect@4.0.0` peer.

## Journey

A developer runs `devenv shell -- bun run dev` (or the verify skill starts `vp dev`) and opens the editor.

1. `vp dev` starts, loads `apps/editor/vite.config.ts` with the Foldkit plugin and prints `[foldkit:devTools] MCP relay listening at …`.
2. The page loads: title `reebeat studio`, the heading, the three regions and the Inspector, no error and no `[foldkit] No response` warning in the console.
3. Click `Hide inspector`: the aside goes away. Edit `apps/editor/src/main.ts` (a visible string): the plugin reloads the document (it is a full reload, not a hot module update), the new text shows, and the Inspector is still hidden: the Model was **kept**, which is what the warning said was missing.
4. `vp build` and `vp preview` serve the same bundle as before.

## Constraints

- Foldkit 0.170.0, `@foldkit/ui` 0.170.0 and `@foldkit/vite-plugin` 0.29.0 are exact pins in the root `catalog`, like the rest. Effect stays 4.1.0 (all of 0.170.0's peers are `~4.1.0`).
- The plugin is a dev and build tool of `apps/editor` only (`devDependencies`).
- Remove the workaround and every statement that depends on it: the deviation comment in `apps/editor/vite.config.ts`, the line in `apps/editor/AGENTS.md`, the "Versions" note in `AGENTS.md`, the follow-up line in `STATE.md`, the plugin-off lines of the verify skill. Older specs are not rewritten: spec 0000 gets a dated Revision that supersedes its plugin entries.
- No new suppression; no rule change; no new capability. `@foldkit/oxlint-plugin` stays at 0.15.3 (it has no relation to this problem; its own bump is its own change).
- Do not build editing features against the IR.

## Falsifiers

| # | Claim | Negative control | Observation |
| --- | --- | --- | --- |
| F1 | The installed versions are Foldkit 0.170.0, `@foldkit/ui` 0.170.0, plugin 0.29.0, effect 4.1.0, and `bun install` prints no peer warning for them | the same install with the plugin pinned at 0.28.0 | `bun install` output and the installed `package.json` of each |
| F2 | `vp dev` loads the config with the plugin on effect 4.1.0 and prints the relay line | plugin 0.28.0 | the server log; the control prints `does not provide an export named 'Crypto'` |
| F3 | In a real browser on `vp dev`: title, regions, no error, no `No response from @foldkit/vite-plugin` warning | plugin line removed from the config | `tab.console()` and `tab.errors()`; the control shows the warning |
| F4 | Model preservation: hide the Inspector, edit `main.ts`, the document reloads, the new text shows and the Inspector stays hidden | plugin line removed | the DOM after the edit; the control shows it shown again (Revision 2) |
| F5 | `vp build` and `vp preview` pass; the preview journey (toggle) is unchanged | none: the same shell test as before | `bun run ready` and the verify skill in `preview` mode |
| F6 | The plugin imports `SecureRandom` from `effect/crypto`, not a root `Crypto` | read `dist/index.js` of the tarball | the grep output |
| F7 | No file still says the plugin is off | grep | `grep -rn "No response from\|plugin off\|not used\|issues/4"` outside specs |
| F8 | `bun run ready` exits 0 on the head | any gate red | the transcript |

## Feature map

`shell-load` names this spec (`Spec: 0000, 0005`): in `dev` the console has only `[vite]` lines. `shell-dev-reload` is new (`Spec: 0005`): the relay line, the reload and the kept Model. `bun run test` checks that a spec is named by an entry or says `Verify skill: none` (a spec that is named has no such line, hence this heading instead).

## Revisions

1. **2026-10-29, journey step 3 and F4 corrected while building.** The plugin's README says a saved file causes a **full page reload** that restores the Model; it is not a hot module update. The journey and F4 said "hot-updates"; they now say reload. Observed: `window.__marker` set before the edit was `null` after it, the text changed and the Inspector stayed hidden.
2. **2026-10-29, controls observed.** Plugin removed from `apps/editor/vite.config.ts` while `vp dev` ran: the server restarted, the browser console showed `[foldkit] No response from @foldkit/vite-plugin` (F3 control), and after the same edit the Inspector was shown again (F4 control). The F2 control (plugin 0.28.0 fails on `Crypto`) was **not re-run**: it is recorded in issue #4 from the earlier spike.
3. **2026-10-29, the feature map section replaces "Verify skill".** The featureMap test rejects a `Verify skill:` line in a spec that an entry names; the header line and the section now say which entries name this spec.
4. **2026-10-29, the plugin also brands views.** Its README: at build time, in dev and production, it wraps every view-function return in the application modules with a view identity. The production bundle is therefore produced by the plugin as well (`vp build`: 300.24 kB js, 99.02 kB gzip; no baseline of the previous bundle was measured). The Vitest run loads the plugin through the same config and passes (45 + 8 tests).
5. **2026-10-29, no `.mcp.json`.** The generator wired the Foldkit devtools MCP (`@foldkit/devtools-mcp`, 0.26.0 now) in a `.mcp.json` that spec 0000 did not copy; the relay is now live in `vp dev`, but no MCP client config is added here. Open question 1 of spec 0000 (an agent-inspectable dev server) stays for the operator.
