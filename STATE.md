# State

Lifecycle: build

Now:

tsukuri studio is the collaborative editor for tsukuri stories. Specs 0000 (development lifecycle, copied from tsukuri's, and the Foldkit app `apps/editor` as a placeholder shell), 0002 (collaboration spike) and 0003 (review, PR creation and verification skills, with the `verify-studio` skill) are merged. Spec 0005 (Foldkit 0.170.0 and the Vite plugin back on; PR #9) is in review. Spec 0001 (the editor's first felt journey: open a story, see its States and Beats as a graph and a timeline, scrub a preview, edit one Element property, see the preview update) is written as a design only and **planned, blocked on tsukuri 0004 and 0006**.

Next:

- Review spec 0005 (PR #9), then merge it with `merge.sh` once a round passes. Spec 0004 (PR #6, distribution) is held for an Alchemy release; it merges after #9 and needs a rebase (both change `AGENTS.md`, `STATE.md`, `PROVENANCE.md`, `package.json`, `bun.lock` and the Revisions of spec 0000).
- Spec 0001 starts when tsukuri's story IR is stable (0004 merged, 0005 done, 0006 makes the committed story source the IR JSON). Until then no editing feature is built against the IR.
- Keep `verify-studio`'s feature map true: the PR that builds spec 0001 (or any user-visible feature) adds its entries in the same PR (`AGENTS.md`, maintenance rule).

Blocked:

- Spec 0001 on tsukuri 0004 and 0006. Operator-owned forks are listed in each spec's "Open questions".
