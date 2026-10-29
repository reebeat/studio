# State

Lifecycle: build

Now:

reebeat studio is the collaborative editor for reebeat stories. Specs 0000 (development lifecycle, copied from reebeat's, and the Foldkit app `apps/editor` as a placeholder shell) and 0002 (collaboration spike) are merged. Spec 0003 (review, PR creation and verification skills, with the `verify-studio` skill) is in review. Spec 0001 (the editor's first felt journey: open a story, see its States and Beats as a graph and a timeline, scrub a preview, edit one Element property, see the preview update) is written as a design only and **planned, blocked on reebeat 0004 and 0006**.

Next:

- Review spec 0003 (review, PR creation and verification skills; PR #5, targets `main`), then merge it with `merge.sh` once a round passes.
- Spec 0001 starts when reebeat's story IR is stable (0004 merged, 0005 done, 0006 makes the committed story source the IR JSON). Until then no editing feature is built against the IR.
- Keep `verify-studio`'s feature map true: the PR that builds spec 0001 (or any user-visible feature) adds its entries in the same PR (`AGENTS.md`, maintenance rule).

Blocked:

- Spec 0001 on reebeat 0004 and 0006. Operator-owned forks are listed in each spec's "Open questions".
