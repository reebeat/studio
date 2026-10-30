# 0003 Review, PR creation and verification skills

Status: **spec** (frozen when its PR opens). Date: 2026-10-29. Decided by: the operator's assignment of 2026-10-29 (adopt vektorprogrammet-reimagined's PR-creation and PR-review procedures in tsukuri and tsukuri studio, personalised, and keep a verification skill for each repository).
Process: [spec 0000](0000-development-lifecycle.md). Built on the branch of PR #1 (spec 0000), whose skills it changes; PR #1 was squash-merged as `b26c1cc` and this branch was rebased onto `main` (the trees of `643096e` and `b26c1cc` are identical).
Verify skill: none, process and skills only; its own proof is the verification run recorded in the PR body (see "Falsifiers", F6).

## Problem

Spec 0000 copied tsukuri's `pr-create` and `review-pr` at `f7c3488`; `review-pr` had been adapted from vektorprogrammet-reimagined (the donor) at `797e9e4`, while `pr-create` is tsukuri's own, built on the machine skill `pr` and the operator's projects-tier `AGENTS.md` (the donor has no `pr-create` skill and no PR-body rule; see Revisions 2026-10-29, review rounds 1 and 2). Since then the donor kept learning, and today's reviews (tsukuri spikes #11, studio #3) found failures that no skill states. Studio has no verification skill: a reviewer cannot tell how to run the editor and look at it, and nothing makes a PR that changes what a person sees keep that description true.

## Goal

1. `review-pr` matches the donor's current procedure (donor `1104c30`), and `pr-create` (tsukuri's, not the donor's) is brought in line with the lessons below and the donor's one input, that the PR body lists the review rounds (`review-pr/SKILL.md` line 76); both are personalised to a Foldkit app.
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

Personalised to this repository: the conformance reviewer checks the Foldkit rules (`update`, `view` and the Model are total and pure; work leaves `update` as a Command, Subscription or ManagedResource; skills `foldkit`, `audit-program`, `effect-ui-lifetimes`; the lint adapter's rules), the public-repository rules (no secret, personal or course data; no `LICENSE` file; `PROVENANCE.md` accurate when a file is copied from tsukuri), and a **browser smoke run is mandatory** for a change under `apps/editor/src` that touches the view, the Model or a Command. `pr-create` points its Journey at clicks or `vp` commands and its Evidence at the verify run's directory.

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
- Evidence: `~/.local/state/tsukuri-studio-verify/<UTC date>-<pr or sha>/`, outside every worktree.
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
| Another PR adds a spec without the line | The feature-map test fails on that PR: it needs a `Verify skill:` line or a feature entry (PR #3's spec 0002 has `Verify skill: none, spike`, see Revisions) |
| A browser run is heavy beside other jobs | `headroom.sh` gates it; `VERIFY_FORCE=1` is recorded in the report |
| `record-round.sh` identities are self-declared | Said above; the real independence is that the reviewers are separate agents, which the lead arranges |

## Open questions for the operator

1. Should `merge.sh` also require the recording identity to differ from the PR author on GitHub? Today every agent shares the operator's `gh` account, so it cannot.
2. Add a CI browser job (Chromium in devenv) so `shell-*` entries gate merges instead of reviewers running them? Not built: it is its own spec.

## Revisions

Dated entries. A spec is revised only here; its text above is never edited silently after the PR opens.

- **2026-10-29, plan written** with the build.
- **2026-10-29, build deviations (none changes the journey or a falsifier).**
  1. **Donor diff.** The donor's `review-pr` directory differs from the copy of `797e9e4` only in `SKILL.md` (the plan, code and agreement brief, which tsukuri spec 0000 had already ported); `merge.sh` and `record-round.sh` are identical. So the port adds the verification reviewer, the `maintenance` finding and the tree check after a rebase, and the lessons of the day are what is new.
  2. **`reviewers.md`.** The reviewer briefs and the severity table moved from `SKILL.md` into `.agents/skills/review-pr/reviewers.md` so that `SKILL.md` stays the loop and each reviewer reads only its brief (skill `writing-for-agents`).
  3. **Spec numbers.** `0003` is this spec; spec 0002 is the collaboration spike in PR #3, which has no `Verify skill:` line yet. The test will fail there after this PR merges until that spec says `Verify skill: none, spike` (Risks). The distribution spec moved to 0004.
  4. **F6 evidence.** The run was made on `bdb3a01` (PR #1's head when the skill was first run) and again on `643096e` (its head after round 2). The OMP `browser` tool's `tab.screenshot({ path })` writes to `/tmp`, so the skill saves screenshots with `page.screenshot` through `tab.run`; the skill says so.
  5. **Controls on a scratch worktree.** The two F6 controls (an `update` that ignores the toggle; an `h1` turned into a `p`) were applied to a detached worktree of `643096e` and reverted; nothing was committed.
- **2026-10-29, the heavy-job limits are the operator's four (supersedes lesson 4 and the "browser run is heavy" risk above; adds F8).** The operator agreed new limits for a heavy job (build, browser run, `ready`): (1) `MemAvailable` after the job's expected demand at least 20% of RAM; (2) swap-in (the `pswpin` delta over a 10 to 30 s sample) under about 1000 pages per second; (3) memory PSI `full` avg60 under 10%, **not** avg10 and not `some`; (4) the 1-minute load average under the number of CPU threads; a job backs off when `full` avg60 stays above 20% or swap-in stays above its limit for a minute. `headroom.sh` implements exactly these (plus free disk for the job's writes) and replaces the donor's CPU-idle, swap-free and device-busy gates and the first version's `some` avg10 gate. The script reads `meminfo`, `vmstat`, `loadavg` and `pressure/memory` from `PROC_ROOT` and the thread count from `HEADROOM_NPROC` so a test can inject samples. **F8:** `headroom.sh` fails the gate that is short and passes the others. Gate: `tools/quality/test/headroom.test.ts`, with a stub `sleep` that grows `pswpin`. Controls, one per gate, each with its boundary: MemAvailable 3071 MiB short and 3072 MiB passes (10 GiB RAM, 1 GiB demand); 10000 pages in 10 s short and 9990 passes; `full` avg60 10 short and 9.99 passes while `full` avg10 80 and `some` 50 still pass; load 8 on 8 threads short and 7.99 passes; two gates short at once are both named. The PR body's F1 evidence is re-recorded on the new head.
- **2026-10-29, review round 1 of PR #5 (all findings accepted; supersedes the premise in Problem and Goal 1, and statement 3 of the build deviations).**
  1. **`pr-create` provenance (medium).** The donor has no `pr-create` skill at `1104c30` or `797e9e4`. `pr-create` is tsukuri's skill (`f7c3488`, built on the machine skill `pr`). *Corrected in round 2: this entry first said the donor's `AGENTS.md` holds a "Design-spec-driven workflow" with the empty `## Review rounds` rule; it does not.* Problem, Goal 1 and `PROVENANCE.md` now say so; the table "What is ported" lists only what the donor really has.
  2. **`headroom.sh` fails closed (medium).** A sample that cannot be read (file missing, field absent, empty, not a number) is now `SHORT` for that gate with the reason, as the donor's does; before, an empty PSI or load sample compared as "below the limit" and passed, so a kernel without PSI passed the PSI limit unmeasured. `headroom.test.ts` gained a control per gate (missing file, empty, non-numeric); run against the previous script the new test fails (`…/f8-unreadable-sample-old-script.txt`).
  3. **Low.** `features/README.md` no longer advises `tab.screenshot({ path })` (it writes to `/tmp`); it gives the `page.screenshot` through `tab.run` form that `SKILL.md` uses. `reviewers.md` regained the donor's critical (data loss, security hole) and high (behaviour a user relies on is wrong) rows. `STATE.md` and the Risks row no longer say spec 0002 lacks a `Verify skill:` line or that this PR is stacked: PR #3 merged as `9301044` with `Verify skill: none, spike`, and this branch is rebased onto it and targets `main`.
- **2026-10-29, review round 2 of PR #5 (accepted; corrects item 1 of round 1).** The donor's `AGENTS.md` has no "Design-spec-driven workflow" heading and no `## Review rounds` rule. The heading is in the operator's projects-tier `/srv/share/projects/AGENTS.md`, and the empty `## Review rounds` section is tsukuri's `pr-create` convention. `pr-create` therefore comes from tsukuri `f7c3488` (built on the machine skill `pr`) plus that projects-tier workflow; the only donor input is `review-pr/SKILL.md` line 76 ("The PR body lists the rounds (number, head, verdict) once the PR passes"). Corrected in `PROVENANCE.md` (line 14) and here (Problem, Goal 1, round 1 item 1); no code changed.
