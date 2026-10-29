# State

Lifecycle: build

Now:

reebeat studio is the collaborative editor for reebeat stories. Spec 0000 (development lifecycle, and the Foldkit app `apps/editor` as a placeholder shell) is merged. Spec 0004 (distribution: the single binary `apps/launcher`, built and smoke-tested on five targets, and the web deploy to Cloudflare, written and inert) is in review as a draft. Spec 0001 (the editor's first felt journey) is a design only and **planned, blocked on reebeat 0004 and 0006**.

Next:

- Spec 0004: the web deploy waits for an Alchemy release newer than 2.0.0-beta.84 that contains alchemy-run/alchemy#2754 (spec 0004, "Unblocking the web deploy"); then the operator runs `scripts/wizards/cloudflareWebDeploy.sh`.
- Spec 0001 starts when reebeat's story IR is stable (0004 merged, 0005 done, 0006 makes the committed story source the IR JSON). Until then no editing feature is built against the IR.
- Follow-up to 0000: re-enable `@foldkit/vite-plugin` when a release imports `effect/crypto` (issue #4), and drop the Effect 4.0.0 peer note then (see `AGENTS.md`, "Effect and Foldkit").

Blocked:

- Spec 0001 on reebeat 0004 and 0006. Operator-owned forks are listed in each spec's "Open questions".
