# State

Lifecycle: build

Now:

reebeat studio is the collaborative editor for reebeat stories. Specs 0000 (development lifecycle, copied from reebeat's, and the Foldkit app `apps/editor` as a placeholder shell), 0002 (collaboration spike), 0003 (review, PR creation and verification skills, with the `verify-studio` skill) and 0005 (Foldkit 0.170.0 and the Vite plugin back on) are merged. Spec 0004 (distribution: the single binary `apps/launcher`, built and smoke-tested on five targets, and the web deploy to Cloudflare, written and inert) is in review as a draft. Spec 0001 (the editor's first felt journey: open a story, see its States and Beats as a graph and a timeline, scrub a preview, edit one Element property, see the preview update) is written as a design only and **planned, blocked on reebeat 0004 and 0006**.

Next:

- Spec 0004: the web deploy waits for an Alchemy release newer than 2.0.0-beta.84 that contains alchemy-run/alchemy#2754 (spec 0004, "Unblocking the web deploy"); then the operator runs `scripts/wizards/cloudflareWebDeploy.sh`.
- Spec 0001 starts when reebeat's story IR is stable (0004 merged, 0005 done, 0006 makes the committed story source the IR JSON). Until then no editing feature is built against the IR.
- Keep `verify-studio`'s feature map true: the PR that builds spec 0001 (or any user-visible feature) adds its entries in the same PR (`AGENTS.md`, maintenance rule).

Blocked:

- Spec 0001 on reebeat 0004 and 0006. Operator-owned forks are listed in each spec's "Open questions".
