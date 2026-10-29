# reebeat studio

The collaborative editor for reebeat stories (a Foldkit app). reebeat (<https://github.com/reebeat/reebeat>, the open compiler) owns the story IR, the vocabulary (its `GLOSSARY.md`) and the Deck and Video renderers; this repository consumes them. Read [`README.md`](README.md); [`STATE.md`](STATE.md) says which spec is active. This repository is **public**: no secret, no personal data and no course-private material, ever. **Do not build editing features against the story IR yet**: it is changing (reebeat specs 0004 to 0006) and [spec 0001](docs/specs/0001-first-felt-journey.md) is blocked on them.

The lifecycle below is specified in [`docs/specs/0000-development-lifecycle.md`](docs/specs/0000-development-lifecycle.md). This file links facts that live in scripts or in the spec; it does not copy them. It was copied from reebeat's `AGENTS.md` and adapted (see [`PROVENANCE.md`](PROVENANCE.md)).

## How a change travels

```text
spec → code → PR   (1:1)
```

- **One spec, one branch, one PR.** The spec is `docs/specs/NNNN-*.md`; the branch is `feat/NNNN-<slug>`. If a spec needs two PRs, it was two specs.
- **Plan and build are one step.** Write the plan (journey, constraints, falsifiers) first, then build without waiting for approval. Revise the plan as the build teaches: each change is a dated entry in the spec's Revisions section, never a silent edit. Stop only at an operator-owned fork (preference, authority, external effects), and report it.
- **The PR carries spec and code**, opens only when the whole journey is built and `bun run ready` passed on the head, and **freezes the spec**. Use skill `pr-create`; the PR body is the report.
- **Never block on a merge.** After opening a PR, start the next spec on a stacked branch.
- **Review judges three things**: the plan, the implementation, and their agreement. Use skill `review-pr`; `.agents/skills/review-pr/merge.sh` merges only a head with a passing recorded round, and `record-round.sh` refuses a pass that the PR's author recorded about its own head. Every number in a report has its script, its raw output and its command.
- **The verify skill stays true (maintenance rule).** A PR that adds or changes user-visible behaviour updates the feature map of skill `verify-studio` (`.agents/skills/verify-studio/features/`) in the same PR, and a reviewer runs the skill on the head (a browser smoke run is mandatory for a change to the view, the Model or a Command). A stale map is a `maintenance` finding of medium severity. Each spec names its entries (`Spec:` in the map) or says `Verify skill: none, <reason>` (not user-visible) or `Verify skill: pending, <reason>` (only while its Status says planned); `bun run test` checks it.
- **One writer per working directory.** A second agent works in its own worktree under `.worktrees/` (`/run/current-system/sw/bin/git worktree add .worktrees/<name> -b <branch>`; it is git-ignored). Use that full path: the harness rewrites a bare `git worktree` into `omp worktree`, which once copied `.worktrees/` into itself (189 to 215 GB). Commit by pathspec on a shared tree. Before a heavy job (a build, a browser run, `ready`) check the operator's limits with `.agents/skills/verify-studio/scripts/headroom.sh`.
- `main` is protected: a pull request is required (administrators included), the status check `checks` must pass, no force push, no deletion.

## Gates

Every gate is a root script in `package.json`; `bun run ready` runs them in this order. CI (`.github/workflows/checks.yml`) runs each script as its own step. Run everything inside devenv: `devenv shell -- bun run ready` (the system Bun can hang on install). Set up once with `devenv shell -- bun install`, which also installs the git hooks and patches the TypeScript server (`prepare`).

| Gate | Command | Runs where | Catches | See it fail |
| --- | --- | --- | --- | --- |
| Commit message | commitlint (`.vite-hooks/commit-msg`) | every commit | a message that is not a Conventional Commit | `git commit -m "stuff"` |
| Secrets, staged | gitleaks on staged blobs (`.vite-hooks/pre-commit`) | every commit | a secret in a staged file | stage a file with a fake key in a well-known format |
| Format and lint, staged | `vp staged` (`vp check --fix`, `.vite-hooks/pre-commit`) | every commit | format drift, lint errors | stage a file with a `console.log` and an `any` parameter |
| Tests | `bun run test` (`.vite-hooks/pre-push`) | every push, `ready`, CI | a failing test: the editor's Story and Scene tests, the boot test (`Runtime.run` and `Runtime.embed` in happy-dom on effect 4.1.0), the exception check, the family check, the Foldkit lint adapter | break an assertion in `apps/editor/src/story.test.ts` |
| Format, lint, types | `bun run check` (`vp check`) | `ready`, CI | Oxfmt drift; Oxlint with Ultracite, the Effect plugin and diagnostics, the Foldkit plugin, anti-slop rules, cognitive complexity above 15; type errors (type-aware via tsgolint) | a function with complexity 16; a `switch` on a Message tag in `apps/editor` |
| Exception registry | `bun run check:exceptions` | `ready`, CI | a suppression directive without a registry entry; a registry entry without a live suppression | add `// oxlint-disable-next-line <rule>` with no entry |
| Effect family | `bun run test` (`tools/quality/test/effectFamily.test.ts`) | `ready`, CI | `effect` locked at two versions, or an `@effect/*` package at another version than `effect` in `bun.lock`; `@effect/tsgo` locked at two versions | change one `@effect/*` entry of `bun.lock` |
| Feature map | `bun run test` (`tools/quality/test/featureMap.test.ts`) | `ready`, CI | a spec that no feature entry names and that does not say `Verify skill: none` or `pending`; an entry that names a missing spec or repeats an id | add `docs/specs/0099-x.md` with a Status line and no `Verify skill:` line |
| Review record | `bun run test` (`tools/quality/test/recordRound.test.ts`) | `ready`, CI | `record-round.sh` accepting a pass whose `Author` is among its `Reviewers`, or a body without `Author`, `Reviewers` or `Checked` | change a reviewer name in the test's body to the author's |
| Headroom gate | `bun run test` (`tools/quality/test/headroom.test.ts`) | `ready`, CI | `headroom.sh` passing a machine that is short on memory (MemAvailable after the demand under 20% of RAM), swap-in (1000 pages per second or more), memory PSI (`full` avg60 of 10% or more) or load (1-minute load at or above the CPU threads), or passing a gate whose sample it cannot read | make the gate's comparison in `headroom.sh` never fire; delete `/proc/pressure/memory` from the injected sample |
| Build | `bun run build` (`vp build` in `apps/editor`) | `ready`, CI | the editor no longer bundles | import a module that does not exist |
| Dead code | `bun run knip` | `ready`, CI | unused files, exports and dependencies | export a symbol nothing imports |
| Duplication | `bun run cpd` | `ready`, CI | copy-paste (threshold 0) | paste a 40-token block twice |
| Secrets, history | `bun run secrets` | `ready`, CI | a secret anywhere in the git history | commit a fake key on a scratch branch |

## Exceptions

Fix the code, not the rule. When a suppression (`oxlint-disable`, `eslint-disable`, `@ts-expect-error`, `@ts-ignore`, `@ts-nocheck`) is genuinely needed, add an entry to [`tools/quality/effect-exceptions.json`](tools/quality/effect-exceptions.json) in the same change: `id` (`EX-NNNN`), `scope` (`files`, `directives`), `reason`, `nativeAlternativesExamined`, `owner`, `versions` (the versions examined) and `retirementTrigger`. `bun run check:exceptions` fails on a suppression without an entry and on an entry without a live suppression, so an entry retires with its suppression. The registry is empty today. A rule turned off in `vite.config.ts` is not a suppression directive: it carries its reason in a comment there and in the spec's Revisions.

## Effect and Foldkit

Every agent that writes TypeScript here writes native Effect (v4, pinned in the root `catalog`) in a Foldkit app.

- **Lookup order, before writing:** this file, then `node_modules/effect/AGENTS.md` and the `ai-docs/src` examples it links, then `node_modules/effect/src`, never memory or another copy. Under Bun's isolated installs the package is `apps/editor/node_modules/effect`, not the root. For Foldkit, [`apps/editor/FOLDKIT.md`](apps/editor/FOLDKIT.md) and the JSDoc of `apps/editor/node_modules/foldkit/dist/**/*.d.ts` (the `repos/foldkit` subtree is not vendored). Ready means every API used has installed guidance, or the search established that none exists (then say so in the PR).
- **Decision ladder:** native construct, composition of native constructs, a small domain abstraction built from Effect, a boundary adapter, a registered exception.
- **Pure stays pure.** `update`, `view` and every function of the Model are total functions; work leaves `update` only as a Command, a Subscription or a ManagedResource (skill `effect-ui-lifetimes`).
- **Versions.** `effect` and every `@effect/*` runtime package are one version (`tools/quality/effectFamily.ts`): 4.1.0. Foldkit 0.170.0, `@foldkit/ui` 0.170.0 and `@foldkit/vite-plugin` 0.29.0 peer `effect ~4.1.0`, so the install prints no peer warning (spec 0005). The plugin is on in `apps/editor/vite.config.ts`: in `vp dev` it opens the Foldkit devtools relay (loopback, with a token) and keeps the Model across the page reload that a saved file causes. An upgrade of Effect or Foldkit is its own spec.

## Conventions

- **Conventional Commits** (`feat(scope): …`, `fix: …`, `docs: …`, `chore: …`). Body lines at most 100 characters.
- **Never `--no-verify`.** A rejected commit can leave files staged: check `git status` after any hook failure.
- **Never set or change the git identity.**
- Python only for throwaway work; commit TypeScript. Edit files with the edit and write tools, never with a shell redirect into source.
- Copied code carries its provenance (source repository, commit, deviations) in a header or in [`PROVENANCE.md`](PROVENANCE.md); keep third-party licences in place.
- Tests prove a rule, not an implementation detail; a test fixture lives in a temporary directory the test creates, never outside the repository.
- **No LICENSE file**: the licence is not decided (see the README). Do not add one.

## Emergency

Branch protection includes administrators. To remove it (operator only, an external effect):

```sh
gh api -X DELETE repos/reebeat/studio/branches/main/protection
```

Restore it afterwards as spec 0000 describes it.
