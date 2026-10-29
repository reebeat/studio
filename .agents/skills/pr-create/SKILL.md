---
name: pr-create
description: "Open a reebeat studio pull request: the PR body is the report, in eight fixed sections, and the PR opens only when the whole journey is built and `bun run ready` passed on the head. Use when a spec's code is finished and a PR is to be opened, or when drafting a PR body for this repository."
---

<!-- Provenance: adapted from reebeat/reebeat @ f7c348877585f54b6bf00651608726dd7e5044d3 (.agents/skills/pr-create/SKILL.md).
     Deviations: the description names this repository; "the terms of `GLOSSARY.md`" points at reebeat's glossary (see PROVENANCE.md);
     since spec 0003 the Journey and Evidence sections name the `verify-studio` run, the evidence rule and the maintenance rule.
     Credits: builds on the machine skill `pr` (`skill://pr`), whose Summary, Evidence
     and Merge Danger sections it reuses; the Summary's menu of visuals comes from Dex Horthy's `show-me` skill
     (https://github.com/humanlayer/skills/blob/main/plugins/show-me/skills/show-me/SKILL.md). New in reebeat: the eight
     sections and their order, the opening rule, and the `gh` command (spec 0000, "The PR body is the report"). -->

# Open a pull request

One spec, one branch, one PR (`docs/specs/NNNN-*.md`, `feat/NNNN-<slug>`). The PR carries the spec and its code. The PR body is the report: a reader who has only the body can experience the feature, see what holds it, and judge the risk.

## When to open

Open the PR only when the whole journey of the spec is built, `devenv shell -- bun run ready` exited 0 on the head you are about to push, and, when the diff changes what a person sees (the view, the Model, a Command), `verify-studio` was run on that head and its run directory kept. A fragment is a defect. Do not open the PR to start the review of unfinished work, and do not wait for a merge before starting the next spec (stack the next branch on this one: `--base` is the branch below it, and retarget to `main` when that PR merges).

Freeze the spec when the PR opens. A later change to the plan is a dated entry in the spec's `Revisions` section, never a silent edit.

## The body: eight sections, in this order

Skip preambles. Use the terms of reebeat's `GLOSSARY.md` (<https://github.com/reebeat/reebeat/blob/main/GLOSSARY.md>). Read the machine skill `pr` (`skill://pr`) for the Summary visuals, the Evidence tiers and the Merge Danger wording.

1. **Spec**: link to `docs/specs/NNNN-*.md` and the commit of the frozen text, and list its Revisions entries (date and one line each), or write "no revisions".
2. **Journey**: the exact steps that experience the feature (commands, or clicks by accessible name: `vp dev` or `vp preview` in `apps/editor`, then the buttons and regions as `verify-studio`'s feature map names them), and one line on what is real (what runs for real, what is a stand-in).
3. **Summary**: the smallest diagram, tree or diff that shows the change (as in skill `pr`).
4. **Falsifiers**: a table with one row per falsifier of the spec: falsifier, the check that gates it, the negative control that was run, and the observed failure (the command, its exit code and the first relevant output line).
5. **Evidence**: before and after, command output, the `bun run ready` result with the head sha, and for a change that a person sees the `verify-studio` run directory (`~/.local/state/reebeat-studio-verify/<date>-<pr>/`, with `REPORT.md`) and the feature-map entries driven. **Every number in the body has its script, its raw output and its command** (a path to the file, or the output pasted); a figure without the three is a finding of medium or above. List the feature-map entries the PR adds or changes, or write "none: not user-visible" (the maintenance rule in `AGENTS.md`).
6. **Not run**: checks that were not run and why. Never empty by omission: write "none" when true.
7. **Merge danger**: one-way or two-way door, and the blast radius (as in skill `pr`).
8. **Review rounds**: the heading `## Review rounds` and nothing under it. The lead fills it from the recorded rounds when the PR passes.

Section headings are `## Spec`, `## Journey`, `## Summary`, `## Falsifiers`, `## Evidence`, `## Not run`, `## Merge danger`, `## Review rounds`.

## Command

Write the body to a file outside the repository (a temporary path), then:

```sh
gh pr create --base <main, or the branch this one is stacked on> --title "<type>: <summary>" --body-file <body-file>
```

The title is a Conventional Commit subject. Never push to `main`: it is protected, and the required status check is `checks`. Review and merge follow skill `review-pr`.
