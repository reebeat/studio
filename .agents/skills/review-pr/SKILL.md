---
name: review-pr
description: "The automated pull-request loop for reebeat studio: independent reviewers judge the plan, the implementation and their agreement, a fixer addresses findings, each round is recorded on the PR, and a passing PR is merged. Use when a PR is ready for review, when asked to review or merge a PR, or when a review round finishes."
---

<!-- Provenance: copied from reebeat/reebeat @ f7c348877585f54b6bf00651608726dd7e5044d3 (.agents/skills/review-pr/SKILL.md),
     which adapted it from phibkro/vektorprogrammet-reimagined @ 797e9e41d96194b9479ff224ac1c40bbc0545888. Deviation:
     the description names this repository; nothing else changed (reebeat's deviations from the donor: the donor's
     verification skills, formal-verification job and database worktree notes are dropped; the verification reviewer runs
     `bun run ready` on the head; reviewers judge plan, implementation and agreement). See PROVENANCE.md. -->

# Review and merge a pull request

The lead (the session that owns merges) runs this loop. Reviewers and fixers are separate agents, so the one who judges a change never wrote it. The binding contract is `docs/specs/0000-development-lifecycle.md`.

```text
round 1..n:
  reviewers (independent, read-only on product code) → findings with severity
  pass?  → merge
  else   → fixer addresses every finding → push → next round
stop:   after round 3, unless an open finding is critical or high (then keep going);
        a stop without a pass is reported to the operator, never merged
```

## 1. Prepare

- A PR carries its spec and its code together. The spec is frozen when the PR opens; later changes to it are dated entries in its Revisions section.
- Create a separate detached worktree per reviewer or fixer role: `git worktree add --detach .worktrees/pr-$N-<role> origin/<head branch>` (no local branch). Remove each one when its role ends (`git worktree remove`).
- Read the PR body, its spec in `docs/specs/` (falsifiers and Revisions), and `git diff --stat origin/main...HEAD`.

## 2. Review round: two independent reviewers, in parallel

Give each reviewer the PR number, the worktree, the spec, and this section. Reviewers do not edit product code and do not push or comment; they report. Every reviewer judges three things and says which it checked:

- **(a) The plan**: the spec is the right problem, journey and falsifiers.
- **(b) The implementation**: it is correct, the gates are green, every control was shown.
- **(c) Their agreement**: the code does what the spec with its Revisions says. No undeclared scope, no unbuilt falsifier, no silent drift (a change to the plan that has no dated Revisions entry). A finding in (c) is medium or higher.

**Verification reviewer** (mainly (b), and the evidence side of (c)).

1. In the detached worktree run `devenv shell -- bun install --frozen-lockfile`, then `devenv shell -- bun run ready`. It must exit 0 on the head; record the head sha and the output summary.
2. Check the PR body's falsifier table against the branch: for each falsifier, find the gate that holds it and the negative control, and re-run the control where it is cheap (a scratch change in the worktree, undone afterwards). A control that was not shown, or that does not fail as the table says, is a finding.
3. Read CI's result on the head (`gh pr checks <n>`): the `checks` job must be green.

**Conformance reviewer** (mainly (a) and (c)).

1. Is the spec the right problem? The journey is experienceable from the PR body, and each falsifier has a gate and a control that can fail.
2. Does the diff match the spec and its Revisions? List anything built that the spec does not name and anything the spec names that is not built.
3. The repository rules in `AGENTS.md`: one source per fact, every suppression has a registry entry (a new entry needs a retirement trigger), Effect rules followed, no secret, personal or course data in code, logs or fixtures.

### Severity

| Severity | Meaning | Examples |
| --- | --- | --- |
| critical | a leaked secret or personal data, or a broken `main` once merged | a key in a fixture; a gate that always passes |
| high | a spec falsifier is not met | a control that does not fail; `ready` red on the head |
| medium | a rule of `AGENTS.md` broken, evidence that does not match the branch, or any (c) finding | a suppression without an entry; undeclared scope; a Revisions entry missing |
| low | clarity or maintainability with no behavioural effect | a misleading name or comment |
| nit | taste | none |

Each finding: severity, file:line or command, what is wrong in one sentence, and the evidence (command and output).

## 3. Decide

**Pass** when all of these hold: no open finding of medium or above; CI green on the head; `bun run ready` exits 0 on the head; every falsifier has a shown control. Low and nit findings go into the merge comment, or are fixed if cheap.

- **Merge a passing PR** with `.agents/skills/review-pr/merge.sh <n> "<type>: <summary>"` from the main checkout (squash, title `<type>: <summary> (#<n>)`). It refuses (exit 4) unless a round recorded by `record-round.sh` passed the PR's current head, waits for CI green on that head (exit 1 when not green), and merges only that head (`--match-head-commit`). If `main` moved since the head was reviewed, it computes the expected tree with `git merge-tree --write-tree origin/main <reviewed head>` and refuses on conflicts (exit 2) or on files that both changed (exit 3): then rebase, require CI green on the rebased head, and record a new round on it.

**Otherwise**, start a fixer: a separate agent in the PR's worktree, with the findings verbatim. It fixes the code, and the spec only through a dated Revisions entry. It commits, pushes, and reports. Then the next round, with fresh reviewers.

## 4. Iteration limit

- Rounds 1 to 3: iterate until the PR passes.
- After round 3: continue only while an open finding is **critical or high**. If only medium or lower findings remain, stop: do not merge; report the PR, the open findings and the rounds to the operator.
- A finding that the same fix has failed twice is reported at once, whatever the round.

## 5. Record

Every round is recorded on the PR, so the review is visible where the change is (the repository is public) and outlives the agents' transcripts. The lead posts it with `.agents/skills/review-pr/record-round.sh <n> <round> <pass|changes> <body-file>`: a GitHub review (comment) headed by the marker `<!-- review-round n=<round> head=<sha> verdict=<pass|changes> -->`, with the head read from GitHub. `merge.sh` reads the marker, so a PR without a passing record on its head cannot be merged.

The body file starts with the line `Checked: plan, implementation, agreement` naming exactly the parts (a), (b), (c) that the reviewers judged, then the findings with severity, what the fixer changed (commits) and the evidence (commands and output).

A small change that needs no independent reviewers (docs, a one-line fix) still gets one round: the lead's own review, recorded with the reviewer named as `lead`, the parts checked and what was checked. The record says who reviewed, never that more happened than did.

The PR body lists the rounds (number, head, verdict) under `## Review rounds` once the PR passes.
