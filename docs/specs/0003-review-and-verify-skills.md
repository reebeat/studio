# 0003 Review, PR creation and verification skills

Status: **spec** (frozen when its PR opens). Date: 2026-10-29. Decided by: the operator's assignment of 2026-10-29 (adopt vektorprogrammet-reimagined's PR-creation and PR-review procedures in reebeat and reebeat studio, personalised, and keep a verification skill for each repository).
Process: [spec 0000](0000-development-lifecycle.md). Stacked on PR #1 (spec 0000), because the skills this spec changes arrive with it.
Verify skill: none, process and skills only; its own proof is the verification run recorded in the PR body (see "Falsifiers", F6).

## Problem

Spec 0000 copied reebeat's `pr-create` and `review-pr` at `f7c3488`, which adapted them from vektorprogrammet-reimagined (the donor) at `797e9e4`. Since then the donor kept learning, and today's reviews (reebeat spikes #11, studio #3) found failures that no skill states. Studio has no verification skill: a reviewer cannot tell how to run the editor and look at it, and nothing makes a PR that changes what a person sees keep that description true.

## Goal

1. `review-pr` and `pr-create` match the donor's current procedure (donor `1104c30`), personalised to a Foldkit app, and carry the lessons below.
2. `verify-studio` launches the editor on a disposable instance, drives it in a real browser, keeps evidence outside the worktree and cleans up. It has a **feature map**: every user-visible feature with how to observe it and what counts as broken. Today the map lists only the shell.
3. A PR that adds or changes user-visible behaviour updates the map in the same PR; the reviewer uses the skill; a test fails when a spec has no entry and does not say it is invisible.

## Journey

```text
author   spec → code → bun run ready → pr-create (body is the report)        [unchanged]
review   verification reviewer: runs verify-studio for the changed paths; keeps the skill true
         conformance reviewer:  plan, implementation, agreement; Foldkit rules; public-repository rules
lead     record-round.sh <n> <round> <pass|changes> <body>   body: Author, Reviewers, Checked; refuses an author's pass
         merge.sh <n> "<type>: <summary>"                    only a head with a passing record
```

## What is ported from the donor, and what changes

| Donor (vektorprogrammet-reimagined `1104c30`) | Here |
| --- | --- |
| Reviewers judge the plan, the code and their agreement; undeclared scope, an untested falsifier or a silent plan change is medium or above | already in `review-pr` (spec 0000); kept, and the reviewer brief now names each check |
| The verification reviewer runs the repository's verify skill for every feature the changed paths map to, and **keeps the skill true** (a stale map is a `maintenance` finding) | new: `verify-studio`, a path table in its `SKILL.md`, the same finding |
| After a rebase without overlap, `git rev-parse HEAD^{tree}` equals the tree `merge.sh` printed | added to the "Decide" step |
| Worktree per reviewer or fixer role, removed when the role ends | kept; the command is `/run/current-system/sw/bin/git worktree add` (below) |
| Soft maximum of 3 rounds, then only critical or high continues; a fix that failed twice is reported at once | kept |
| Every round recorded on the PR with a marker; `merge.sh` gates on CI, conflicts, overlap and a passing record (exits 1 to 4) | kept; `record-round.sh` also demands `Author`, `Reviewers` and `Checked` lines (below) |
| `verify-vektorprogrammet`: disposable real stack, doctor, drive from a feature map as a user does, evidence outside the worktree, cleanup | `verify-studio`, much smaller: one Vite app, no database, no services |
| `verify-membership-writes`: a model plus runs that pin the facts it takes from code, with drift detection in CI | not ported: studio has no concurrent writers yet. The pattern it uses (a fact the skill relies on is pinned by a check that fails on drift) is applied by the feature-map test |
| `Formal verification` CI job, database worktree notes, `pr-$N` launch recipe | not applicable; dropped |

Personalised to this repository: the conformance reviewer checks the Foldkit rules (`update`, `view` and the Model are total and pure; work leaves `update` as a Command, Subscription or ManagedResource; skills `foldkit`, `audit-program`, `effect-ui-lifetimes`; the lint adapter's rules), the public-repository rules (no secret, personal or course data; no `LICENSE` file; `PROVENANCE.md` accurate when a file is copied from reebeat), and a **browser smoke run is mandatory** for a change under `apps/editor/src` that touches the view, the Model or a Command. `pr-create` points its Journey at clicks or `vp` commands and its Evidence at the verify run's directory.

## Lessons encoded

1. **Every number in a report has its script, its raw output and its command.** A figure without the three is a finding of medium or above (spikes #11 and studio #3 both failed review on it). Evidence lives in the run directory or the PR body, never only in the author's summary.
2. **A review that the author records about its own PR is not independent.** `record-round.sh` refuses a `pass` whose `Author:` is among its `Reviewers:`. Names are self-declared, so the check stops the honest mistake, not forgery.
3. **Create worktrees with `/run/current-system/sw/bin/git worktree add`.** The agent harness rewrites `git worktree` into `omp worktree`, which once copied `.worktrees/` into itself (189 to 215 GB).
4. **Read memory pressure (PSI) before a heavy job** (`/proc/pressure/memory`): `verify-studio`'s `headroom.sh` does it before a build or a browser run.

## The verify skill

`.agents/skills/verify-studio/`:

- `SKILL.md`: launch, doctor, drive, evidence, cleanup, and the path table for a review.
- `features/README.md` (index, conventions, what is planned and not built) and `features/shell.md` (the feature map).
- `scripts/`: `launch.sh` (headroom, build, serve, print `VERIFY READY`), `doctor.sh` (alive, ours, at this commit, answers), `page.sh` (DOM and screenshot through headless Chromium), `cleanup.sh` (manifest with SHA-256, teardown; evidence stays), `headroom.sh`, `lib.sh`.
- Evidence: `~/.local/state/reebeat-studio-verify/<UTC date>-<pr or sha>/`, outside every worktree.
- Interaction (clicks, keys) is driven with the OMP `browser` tool, or the `agent-browser` CLI. Recipes in the map name the selectors by accessible role and name.

## The maintenance rule and its test

`AGENTS.md` states it. `review-pr` checks it. `tools/quality/featureMap.ts` and its test check what a machine can:

- Every feature entry (`### \`id\`` heading in `features/*.md`) has a `Spec:` line naming an existing spec; ids are unique.
- Every `docs/specs/NNNN-*.md` is named by at least one entry, or has the line `Verify skill: none, <reason>` (not user-visible) or `Verify skill: pending, <reason>` (allowed only while its Status says planned).
- An entry never names a spec that says `none`.

Granularity: one spec, one answer. Finer (every journey heading, every falsifier ID) is not checked, because specs write their journeys in different shapes (spec 0000's is a lifecycle, 0001's a user story); an entry lists the falsifiers it observes in its `Observes:` line for a human reviewer.

## Falsifiers

| # | Falsifier (must hold) | Gate | Negative control (must fail) |
| --- | --- | --- | --- |
| F1 | `bun run ready` exits 0 on the head | `ready` | F2 to F5 each make the test suite fail |
| F2 | A spec with no entry and no `Verify skill:` line is a finding naming the file | `featureMap.test.ts` | A fixture spec with neither: the finding appears; with one entry: it disappears |
| F3 | An entry naming a spec that does not exist, a missing `Spec:` line or a repeated id is a finding | `featureMap.test.ts` | Fixtures for each |
| F4 | `pending` is accepted only for a spec whose Status says planned; `none` with an entry contradicts | `featureMap.test.ts` | Fixtures for each |
| F5 | `record-round.sh` refuses a `pass` recorded by the author, and a body without `Author`, `Reviewers` or `Checked` | `recordRound.test.ts` (the script with a stub `gh` first on `PATH`) | The same body with `Reviewers` changed passes the checks and reaches the stub; the refusals exit 65 and call nothing |
| F6 | The skill works: `verify-studio` launched against the head of PR #1 reaches `DOCTOR OK`, drives every shell entry of its map, and cleans up with the evidence kept | a recorded run (not a CI gate: CI has no Chromium) | A shell with `update` that ignores the toggle makes the `shell-inspector-toggle` entry fail by its own "broken" criterion; the doctor fails when the page has no `h1` |
| F7 | The real map matches the real specs on this head | `featureMap.test.ts` on the repository's files | F2 to F4 on fixtures |

## Constraints

- Skill style follows `writing-for-agents`: each `SKILL.md` under about 200 lines, detail in reference files, one source per fact (`package.json` scripts and `vp` own the commands; the skill names them).
- Edit with the edit and write tools. Provenance of ported text is in the skill headers and in `PROVENANCE.md`.
- Public repository: no secret and no personal data in the skill, the scripts or the evidence paths (evidence paths name a user directory only as `~`).

## Risks

| Risk | Mitigation |
| --- | --- |
| The feature map rots once features land | The maintenance rule, the test, and the `maintenance` finding |
| Another PR adds a spec without the line (PR #3 adds spec 0002) | The test fails on that PR's rebase; the PR body names it |
| A browser run is heavy beside other jobs | `headroom.sh` gates it; `VERIFY_FORCE=1` is recorded in the report |
| `record-round.sh` identities are self-declared | Said above; the real independence is that the reviewers are separate agents, which the lead arranges |

## Open questions for the operator

1. Should `merge.sh` also require the recording identity to differ from the PR author on GitHub? Today every agent shares the operator's `gh` account, so it cannot.
2. Add a CI browser job (Chromium in devenv) so `shell-*` entries gate merges instead of reviewers running them? Not built: it is its own spec.

## Revisions

Dated entries. A spec is revised only here; its text above is never edited silently after the PR opens.

- **2026-10-29, plan written** with the build.
