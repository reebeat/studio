# Reviewer briefs

Read by each reviewer of a round (see `SKILL.md`). You report; you do not edit product code, push or comment on the PR. Say which of (a) the plan, (b) the implementation, (c) their agreement you judged.

**Every number in a report has its script, its raw output and its command.** A count, a size, a timing or a pass rate that you cannot trace to a command that you ran (or that the PR names), whose raw output is in a file or in the report, is a finding of medium or above, whoever wrote it (tsukuri spike PR #11 and studio PR #3 both failed review on it). Your own report meets the rule too: quote the command and its first relevant output line for each claim.

## Verification reviewer

1. In your detached worktree run `devenv shell -- bun install --frozen-lockfile`, then `devenv shell -- bun run ready`. It must exit 0 on the head; record the head sha and the output summary.
2. Check the PR body's falsifier table against the branch: for each falsifier, find the gate that holds it and its negative control, and re-run the control where it is cheap (a scratch change in the worktree, undone afterwards). A control that was not shown, or that does not fail as the table says, is a finding.
3. Read CI's result on the head (`gh pr checks <n>`): `checks` must be green.
4. **Run `verify-studio`** for every feature its path table (in its `SKILL.md`) maps to the changed paths, in your own worktree, and keep the run directory (`REPORT.md`, `notes.md`). A **browser smoke run is mandatory** when the diff changes the view, the Model or a Command under `apps/editor/src`, or any file the path table maps to a feature: `ready` does not run a browser. Docs-only and `.agents`-only changes drive nothing; say so.
5. **Keep the verify skill true.** For each changed behaviour check that the feature map (`.agents/skills/verify-studio/features/`) still describes it (entry point, accessible names, expected end state, what counts as broken), that the path table maps the changed paths, and that every new user-visible feature has its entry **in the same PR** (the maintenance rule in `AGENTS.md`). A gap is a finding (`maintenance`, medium); a skill that describes behaviour the code no longer has is a finding of the severity of the behaviour it hides.

## Conformance reviewer

1. **The plan** (a): the spec states the right problem; the journey can be experienced from the PR body; each falsifier has a gate and a control that can fail; Revisions explain each change made while building.
2. **The agreement** (c): list anything built that the spec does not name and anything the spec names that is not built. Undeclared scope, a falsifier with no test, or a silent change to the plan is medium or above.
3. **Foldkit** (read skills `foldkit`, `audit-program` and `effect-ui-lifetimes`; the installed `foldkit` JSDoc and `apps/editor/FOLDKIT.md` are the contract): `update`, `view` and the Model are total and pure; the Model is a tagged union where a state has variants; work leaves `update` only as a Command, Subscription or ManagedResource with an owned lifetime; no `switch` on a Message tag; accessible names on every interactive element; the Story and Scene tests prove a rule, not an implementation detail. `bun run check` carries the mechanical subset, so spend your time on what lint cannot see.
4. **Repository rules** in `AGENTS.md`: one source per fact; every suppression has a registry entry with a retirement trigger; native Effect (the lookup order was followed, or the PR says nothing was found); Effect and `@effect/*` stay one version.
5. **Public repository**: no secret, personal data or course-private material in code, fixtures, logs, screenshots or evidence paths; **no `LICENSE` file**; a file copied from tsukuri carries its provenance and **`PROVENANCE.md` is accurate** (source commit, deviations; a copied script is byte for byte when it says so, checked with `git hash-object`).
6. **Independence and evidence**: the PR body's figures meet the evidence rule above; the round you are part of will name an `Author` that is not among the reviewers.

## Severity

| Severity | Meaning | Examples |
| --- | --- | --- |
| critical | data loss, a security hole, a leaked secret or personal data, or a broken `main` once merged | an unguarded write; a key in a fixture; a gate that always passes |
| high | a spec falsifier is not met, or behaviour a user relies on is wrong | a control that does not fail; `ready` red on the head; a button that does nothing |
| medium | a rule of `AGENTS.md` broken, evidence that does not match the branch, a number without its script, raw output and command, any (c) finding, or a verify skill out of step (`maintenance`) | a suppression without an entry; undeclared scope; a Revisions entry missing; a feature with no map entry; a UI change with no browser run |
| low | clarity or maintainability with no behavioural effect | a misleading name or comment |
| nit | taste | none |

Each finding: severity, `file:line` or run path, what is wrong in one sentence, and the evidence (command and output).
