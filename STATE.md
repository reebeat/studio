# State

Lifecycle: build

Now:

reebeat studio is the collaborative editor for reebeat stories. Spec 0000 (development lifecycle, copied from reebeat's, and the Foldkit app `apps/editor` as a placeholder shell) is in review. Spec 0001 (the editor's first felt journey: open a story, see its States and Beats as a graph and a timeline, scrub a preview, edit one Element property, see the preview update) is written as a design only and **planned, blocked on reebeat 0004 and 0006**.

Next:

- Merge spec 0000 after its review round.
- Spec 0001 starts when reebeat's story IR is stable (0004 merged, 0005 done, 0006 makes the committed story source the IR JSON). Until then no editing feature is built against the IR.
- Follow-up to 0000: re-enable `@foldkit/vite-plugin` when a release imports `effect/crypto` (issue #4), and drop the Effect 4.0.0 peer note then (see `AGENTS.md`, "Effect and Foldkit").

Blocked:

- Spec 0001 on reebeat 0004 and 0006. Operator-owned forks are listed in each spec's "Open questions".
