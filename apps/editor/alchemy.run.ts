/**
 * The web deploy of the editor: a static site on Cloudflare, one Alchemy stage per pull request (`pr-<n>`, a preview)
 * and one for `main`. Spec 0004 (docs/specs/0004-distribution.md).
 *
 * BLOCKED, and therefore excluded from lint (`ignorePatterns` in `vite.config.ts`; the app's `tsconfig` includes only
 * `src`): `alchemy` 2.0.0-beta.84, the latest release, imports `effect/Crypto`, which effect 4.1.0 does not have. The
 * fix is merged upstream (alchemy-run/alchemy#2754, commit 9d0709d) and not released. When a release that contains
 * it exists, follow "Unblocking the web deploy" in the spec: add `alchemy` and `@alchemy.run/cloudflare` at that
 * version to the root `catalog` and to this package, remove the exclusion, and set the repository variable
 * `WEB_DEPLOY` to `true`.
 *
 * This program was type-checked (tsc 7.0.2, no errors) against alchemy and @alchemy.run/cloudflare 2.0.0-beta.84
 * with effect 4.0.6, in a scratch project. It has not run: that needs the operator's Cloudflare credentials.
 *
 * The stack builds nothing of its own: `StaticSite` runs `bun run build` in this directory and uploads `dist/`.
 * Stages are told apart by `alchemy deploy --stage <name>`; Alchemy puts the stage in the Worker's name.
 */
import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Alchemy from "alchemy";
import { Effect } from "effect";

export default Alchemy.Stack(
  "reebeat-studio",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* deployEditor() {
    const editor = yield* Cloudflare.Website.StaticSite("Editor", {
      // The editor is a single page; any path that is not a file gets index.html.
      assets: { notFoundHandling: "single-page-application" },
      command: "bun run build",
      outdir: "dist",
    });

    return { url: editor.url };
  })
);
