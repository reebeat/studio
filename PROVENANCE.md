# Provenance

The development lifecycle (spec 0000) is copied from [`reebeat/reebeat`](https://github.com/reebeat/reebeat) at commit `f7c348877585f54b6bf00651608726dd7e5044d3` (`main`, 2026-10-29; the source repository). Most of reebeat's own files were adapted from [`phibkro/vektorprogrammet-reimagined`](https://github.com/phibkro/vektorprogrammet-reimagined) at `797e9e41d96194b9479ff224ac1c40bbc0545888` (the donor); the headers that name the donor were kept. Third-party licences stay with their code.

**Identical** means the file's git blob hash equals the source's, checked with `git hash-object <file>` against `git rev-parse f7c3488:<file>` in a reebeat checkout.

| File | Source (reebeat `f7c3488`) | Deviation |
| --- | --- | --- |
| `.vite-hooks/pre-commit`, `commit-msg`, `pre-push` | same paths | identical |
| `commitlint.config.ts`, `.jscpd.json`, `devenv.yaml`, `devenv.lock`, `tsconfig.json` | same paths | identical (the `tsconfig.json` `include` already lists only root and `tools/` files; `apps/editor` has its own) |
| `.agents/skills/review-pr/merge.sh` | same path | identical to reebeat's and to the donor's (`1104c3019a76c619c4c8e9ee04c71ce191467ed4`) apart from the provenance line in its header (spec 0003 re-checked the donor: the script is unchanged since `797e9e4`) |
| `.agents/skills/review-pr/record-round.sh` | same path | **changed since spec 0003**: the body file must carry `Author:`, `Reviewers:` and `Checked:` lines, and a `pass` is refused when the author is among the reviewers (exit 65); the rest is the donor's. Its header says so |
| `.agents/skills/review-pr/SKILL.md` | same path | **rewritten by spec 0003** from the donor's current text (`1104c3019a76c619c4c8e9ee04c71ce191467ed4`): verification reviewer and `maintenance` findings, tree check after a rebase, the evidence rule, the independent-author rule, Foldkit and public-repository checks, the full `git worktree` path. `reviewers.md` is new (the briefs moved out of `SKILL.md`) |
| `.agents/skills/pr-create/SKILL.md` | same path in reebeat `f7c348877585f54b6bf00651608726dd7e5044d3` | **not from the donor: the donor has no `pr-create` skill and no PR-body rule of its own** (checked with `git ls-tree -r --name-only` at `1104c30` and `797e9e4`). The file is reebeat's, built on the machine skill `pr` and on the operator's projects-tier `/srv/share/projects/AGENTS.md` ("Design-spec-driven workflow": the PR is the report, one PR per spec); its empty `## Review rounds` section is reebeat's convention. The only donor input is `review-pr/SKILL.md` line 76 ("the PR body lists the rounds (number, head, verdict) once the PR passes"). Spec 0003 changed only its Journey, Evidence and Command wording to name `verify-studio`, the evidence rule and a stacked `--base` |
| `tools/quality/checkEffectExceptions.ts`, `effectExceptions.ts`, `effectFamily.ts`, `diagnosticRules.ts`, `tsconfig.json`, `vite.config.ts`, `test/diagnosticCoverage.test.ts`, `test/effectExceptions.test.ts` | same paths | identical |
| `tools/quality/test/effectFamily.test.ts` | same path | one control (`deleting effect or @effect/tsgo from a record`) falls back to a fixture record when the registry is empty (spec 0000, Revisions 9); the rest identical |
| `tools/quality/effect-exceptions.json` | same path | the three reebeat entries removed (they suppress reebeat's own files); `exceptions` is empty |
| `tools/quality/package.json` | same path | name `@reebeat-studio/quality`; the `@reebeat/core` dependency removed |
| `tools/oxlint/anti-slop/**` | same path | identical; `UPSTREAM.txt` keeps the chain (dmmulroy/anti-slop `c44ef22`, mono-web `2aa6ce9`, the donor) |
| `vite.config.ts` | same path | the Effect groups and the per-file overrides of reebeat's packages replaced by this repository's; the Foldkit plugin rules added for `apps/editor`; `eslint/no-redeclare` off for `apps/editor/src`; `@reebeat/` import patterns renamed `@reebeat-studio/` |
| `package.json` | same path | name, workspaces (`apps/*`, `tools/*`), scripts (`build` added; `check:tiers` and `journey` dropped; `ready` adjusted), `catalog` cut to what this repository uses plus `foldkit`, `@foldkit/ui`, `@foldkit/oxlint-plugin`, `happy-dom`, `tailwindcss`, `@tailwindcss/vite`; `overrides` for `@effect/platform-node` and `-node-shared` |
| `.gitleaks.toml` | same path | the speech-cache allowlist removed |
| `knip.json` | same path | rewritten for `apps/editor` and `tools/quality` |
| `devenv.nix` | same path | no Chromium, ffmpeg or whisper-cpp, no `REEBEAT_CHROMIUM` |
| `.github/workflows/checks.yml` | same path | no Chromium sandbox variable, tier step or journey step; a build step |
| `AGENTS.md` | same path | gates, Effect and Foldkit section, emergency command and project description rewritten for this repository |
| `docs/specs/0000-development-lifecycle.md` | same path | rewritten: it records what is the same, what differs and why |

Not copied: `tools/quality/checkTiers.ts`, `tiers.ts`, `genGrammar.ts`, `grammarCopies.ts` and their tests, `GLOSSARY.md`, `docs/design`, `docs/grammar`, `packages/`, `stories/`, `STATE.md` (rewritten).

## Added by spec 0003

| File | Source | Deviation |
| --- | --- | --- |
| `.agents/skills/verify-studio/scripts/headroom.sh`, `lib.sh` | `phibkro/vektorprogrammet-reimagined` @ `1104c3019a76c619c4c8e9ee04c71ce191467ed4`, `.agents/skills/verify-vektorprogrammet/scripts/` | adapted: no database, CMS or overlay; smaller demand figures; the donor's CPU, swap and device gates replaced by the operator's four limits of 2026-10-29 (memory, swap-in, memory PSI `full` avg60, load); `PROC_ROOT` and `HEADROOM_NPROC` let the test inject samples; studio's names |
| `.agents/skills/verify-studio/scripts/launch.sh`, `doctor.sh`, `cleanup.sh`, `page.sh` | same directory (the same shape: launch, doctor, drive, cleanup) | written for this repository: one Vite app served by `vp preview` or `vp dev`; headless Chromium for the doctor and `page.sh` |
| `.agents/skills/verify-studio/SKILL.md`, `features/` | `.agents/skills/verify-vektorprogrammet/SKILL.md` and `features/README.md` | the layout (Launch, Doctor, Drive, Evidence, Cleanup, path table, feature map with a "how to observe" and "broken when" per entry); the content is this repository's |
| `tools/quality/featureMap.ts`, `test/featureMap.test.ts`, `test/recordRound.test.ts`, `test/headroom.test.ts`, `test/scriptHarness.ts` | none | original; the idea that a fact the skill relies on is pinned by a check that fails on drift is the donor's `verify-membership-writes` |

## Generated, not copied

`apps/editor` was generated by `create-foldkit-app` 0.40.0 (`--name editor --rendering spa --example counter --package-manager bun`, run in a scratch directory; `foldkit` 0.169.0). Kept: `src/` (rewritten for the shell), `index.html` (title changed), `FOLDKIT.md` (Foldkit owns it, replaced whole on upgrade), `AGENTS.md` (its project notes written). Dropped: `.oxlintrc*.json`, `.oxfmtrc.json`, `vitest.config.ts`, `tsconfig.json`, `vite.config.ts`, `.mcp.json`, `README.md`, `package.json` (the root configuration and the files written for Vite+ replace them). Foldkit is MIT licensed; `foldkit` and `@foldkit/*` are installed from npm, not vendored.
