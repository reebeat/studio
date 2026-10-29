# 0004 Distribution: the web deploy and a single binary

Status: **spec** (frozen when its PR opens). **The binary is built; the web deploy is written and inert: it is blocked on an Alchemy release newer than 2.0.0-beta.84 that contains alchemy-run/alchemy#2754.** Date: 2026-10-29. Decided by: the operator, 2026-10-29 ("ship studio web first, plus a single binary built with Bun"), relayed by the lead; the lead dropped the isolated `infra/` project the same day.
Verify skill: none, a distribution spec: its own smoke script (`apps/launcher/scripts/smokeBinary.sh`) and the CI jobs `Binaries` and `Previews` are its verification.
Process: [spec 0000](0000-development-lifecycle.md). Number: 0004 (0003 is taken by the review and verify skills).

## Goal

Two ways to reach the editor, both with nothing for the user to install or build:

1. **Web.** A static deploy of `apps/editor` to Cloudflare: one stage per pull request (a preview) and one for `main`, the way vektorprogrammet-reimagined does it.
2. **A single binary.** One executable per platform that contains the built editor, serves it on `127.0.0.1` on a free port, and opens the default browser. Local folders are opened by the browser's File System Access API, not by the server, and the server has no endpoint that writes.

## Journey

```text
web      open a pull request  → CI deploys stage pr-<n>  → the page prints a workers.dev URL, a screenshot of the shell is kept
binary   download reebeat-studio-<platform> from a release  → verify SHA256SUMS.txt  → run it
         reebeat studio listening on http://127.0.0.1:41234/   → the default browser opens the editor
         Ctrl-C (or SIGTERM) → exit code 0
```

Flags: `--no-open` (do not open a browser), `--check` (start, verify the served app over HTTP, exit 0, or 1 with the failed step), `--version`, `--help`.

## Decisions

### The binary

| Question | Decision | Why |
| --- | --- | --- |
| How is it built? | `bun build --compile --target=bun-<os>-<arch>` on one Linux runner, for `linux-x64` (as `bun-linux-x64-baseline`, see below), `linux-arm64`, `darwin-arm64`, `darwin-x64`, `windows-x64` | Bun cross-compiles every target from one machine (all five built here, 63 to 87 MB each). **The `linux-x64` target must not be the host target when Bun is the one devenv provides:** that Bun is patched for Nix, and a binary compiled for the host target embeds it with the ELF interpreter `/nix/store/...-glibc/lib/ld-linux-x86-64.so.2` (seen with `file`): it runs on no other machine. `baseline` is a different target, so Bun fetches its own official runtime (interpreter `/lib64/ld-linux-x86-64.so.2`), and that also runs on CPUs without AVX2. `scripts/checkFileTypes.sh` asserts it. **Which Bun runs the build:** `bun run build` goes through `vp run`, which runs the Bun that `devEngines.packageManager` names (exactly `1.4.2` here, the version devenv provides: `vp exec -- bun --revision` and `bun --revision` both print `1.4.2+744846f84`), downloaded as the official release, so the host binary of `bun run build` is **not** Nix-linked (interpreter `/lib64/ld-linux-x86-64.so.2`, observed); only a direct `bun build --compile` in devenv is. The host binary is for local use |
| How does the editor get inside? | `scripts/embed.ts` reads `apps/editor/dist` and writes `apps/launcher/embedded/assets.embedded.json`: file name to Base64 bytes, written and read with one Effect Schema (`EmbeddedAssets`). `compiled.ts` imports the JSON; Bun inlines it | `bun build --compile ./index.html` treats HTML as an app to bundle and fails on the absolute `/assets/...` URLs; `with { type: "file" }` imports need a typed module per extension. One JSON file needs one ambient declaration (`embedded.d.ts`), keeps the type check green on a clean clone, and the same schema covers both ends |
| Which server? | `@effect/platform-bun` `BunHttpServer` with `hostname: "127.0.0.1"`, `port: 0` (the operating system picks a free port) | Loopback only, so another machine cannot connect; no collision between two copies |
| What does it serve? | GET and HEAD of the files in the table. Every other method is 405 with `Allow: GET, HEAD`. A path that could leave the table (`..`, encoded `..`, `%2f`, backslash, NUL, empty or `.` segments) is 404 before any lookup (`assetKeyOf`, one pure function) | "No write endpoints" is a property of the handler, not of a route list: it has no branch that writes |
| How is the browser opened? | `open` (macOS), `cmd /c start` (Windows), `xdg-open` (anything else), chosen from the host platform; a failure prints the URL and carries on | The one place that reads the ambient `process.platform` is `HostPlatform`, registered as EX-0001 (see below) |
| Exit code | 0 when the program ends or is interrupted (Ctrl-C, SIGTERM); 1 for a failure. Effect's default is 130 for an interruption, so the launcher passes its own teardown (`exitCode.ts`, tested) | A server that is stopped on purpose has not failed |
| Local folders | Opened in the page with the File System Access API (`showDirectoryPicker`). The server never touches the user's files | The no-write rule |
| Platforms | Builds for five targets. The macOS and Windows binaries are **unsigned**: the operating system warns on first run. Signing and notarisation are a later operator decision (cost: an Apple developer account, and a Windows code-signing certificate) | Recorded, not hidden |
| ffmpeg | **Not bundled.** Export uses WebCodecs in the browser. reebeat issue #7 (ffmpeg with libx264 is GPL: decide before distributing a binary) therefore does not apply to this binary | Nothing GPL ships |

**Consequences to know.**
- *The origin changes on every run.* A random port is a new origin, so what the page keeps for its origin (IndexedDB, a persisted directory handle) does not survive a restart: the user is asked again to pick the folder. If that proves annoying, a fixed preferred port with a random fallback fixes it; that is the operator's call (Open questions).
- *The File System Access API exists in Chromium-family browsers only.* Firefox and Safari can run the editor but cannot open a folder this way. The default browser may be one of them.
- *Loopback is a secure context*, so the API is available on `http://127.0.0.1`.
- *No DNS-rebinding defence beyond the loopback bind and read-only static files.* There is nothing in the served files that is secret.

### The web deploy

| Question | Decision | Why |
| --- | --- | --- |
| What is deployed? | `Cloudflare.Website.StaticSite` from `@alchemy.run/cloudflare`: it runs `bun run build` in `apps/editor` and uploads `dist/` as a Worker with static assets (single-page fallback) | One resource; no Worker code of ours |
| Stages | `alchemy deploy --stage pr-<n>` for a pull request, `--stage main` for `main`; `alchemy destroy` when the pull request closes. Each stage is its own Worker | Not Cloudflare *Worker Previews* (vektorprogrammet's choice): those hang off a parent Worker's script and the first stage would need a different path; separate Workers per stage need none of that, and the stage name is in the Worker's name. Worker Previews can be adopted later |
| Where does the code live? | `apps/editor/alchemy.run.ts`, in the normal workspace, on effect 4.1.0. **No isolated project and no effect-family exception** (the lead's decision of 2026-10-29) | The upstream fix makes it unnecessary |
| Why is it inert? | alchemy 2.0.0-beta.84 imports `effect/Crypto` (in `Stack.ts`, `Auth/OAuthFlow.ts`, `Util/PlatformServices.ts`), which effect 4.1.0 does not have. Fixed by alchemy-run/alchemy#2754 (merged 2026-10-29, commit 9d0709d), **not released**: `latest` is still beta.84, and `pkg.pr.new` has no build of the commit | So the program is excluded from lint and the workflow is switched off by `vars.WEB_DEPLOY` |
| Credentials | The operator's. `scripts/wizards/cloudflareWebDeploy.sh` walks through them; no secret was created or is stored by any agent | Rule |
| Secrets in a pull request from a fork | None: GitHub withholds them, and the deploy job is skipped for forks | Public repository |

**What was checked of the program.** `alchemy.run.ts` type-checks (tsc 7.0.2, no errors) against `alchemy` and `@alchemy.run/cloudflare` 2.0.0-beta.84 with effect 4.0.6, in a scratch project outside the repository. It has not run: that needs the credentials. A scratch `alchemy plan` stopped earlier, because bun resolved `@effect/platform-node-shared` without its `effect` peer in that project; the workspace already pins `@effect/platform-node` and `-node-shared` by `overrides`.

## Unblocking the web deploy

When an Alchemy release that contains 9d0709d exists (check `npm view alchemy dist-tags` and that its `Stack.ts` no longer imports `effect/Crypto`):

1. Add `alchemy` and `@alchemy.run/cloudflare` at that version to the root `catalog` and to `apps/editor` `devDependencies`; `bun install`. If the release moves the Cloudflare provider again, change the import in `alchemy.run.ts`.
2. Remove `apps/editor/alchemy.run.ts` from `ignorePatterns` in `vite.config.ts`; run `bun run ready`.
3. The operator runs `scripts/wizards/cloudflareWebDeploy.sh` (account id, API token, `WEB_DEPLOY=true`).
4. Open a pull request: the `Previews` job deploys `pr-<n>`, opens the URL in headless Chrome and keeps `shell.png`. That is falsifier F1.
5. Take this spec's pull request out of draft. It stays a draft until then (Revisions 2026-10-29, "the plan path"): this spec has one web journey and one binary journey, and F1 must have its control shown before it can pass.

## Falsifiers

| # | Falsifier (must hold) | Gate | Negative control (must fail) | Status |
| --- | --- | --- | --- | --- |
| F1 | The deployed preview URL renders the shell: heading "reebeat studio" and all four named regions (Story graph, Preview, Timeline, Inspector), and a screenshot is kept | `Previews` job, step "Render the deployed page in a browser", which runs `scripts/checkShellDom.sh` on the page's DOM | Remove any one region, or change the title: the script fails and names it (observed on the real page served by the binary, five mutants, below) | **Not run: blocked** (Alchemy release, credentials) |
| F2 | Each binary starts, serves the app and exits cleanly. Linux x64 and arm64, macOS arm64 and x64: full smoke (start, GET 200, POST 405, SIGTERM exits 0). Windows: `--check` (start, verify over HTTP, exit 0) | `Binaries` jobs `build` (linux-x64) and `smoke` (one runner per target, checksum verified first) | Run the smoke on a binary built with the method guard removed: it fails | Linux x64: run, passes (below). The other four: run by CI on this PR, results in the PR body |
| F3 | A non-loopback address of the machine refuses the connection | `smokeBinary.sh full`: connects to the machine's own non-loopback IPv4 address on the server's port and must fail; `REQUIRE_NON_LOOPBACK=1` on Linux | Bind `0.0.0.0`: the script prints "a connection to 192.168.1.181:43543 was ACCEPTED" and exits 1 (observed) | Linux x64: run, passes |
| F4 | The server has no write endpoint: POST, PUT, PATCH, DELETE (and OPTIONS) are 405 | `test/server.test.ts`, and `--check` over HTTP | Replace the method guard: 5 of 10 server tests fail and `--check` exits 1 (observed) | Passes |
| F5 | A path that leaves the app finds nothing | `test/routing.test.ts` (17 spellings), `--check` (3 requests) | Remove the `..` rule from `assetKeyOf`: 7 of 29 routing and server tests fail (observed) | Passes |
| F6 | The embedded form is what the binary reads: encode, decode, same bytes and types; corrupt data fails the start instead of serving garbage | `test/assetStore.test.ts` | Feed `%%% not base64 %%%`: the layer fails with `SchemaError` (that is the test) | Passes |
| F7 | The checksums verify: each downloaded binary is checked against `SHA256SUMS.txt` before it runs | `smoke` job, step "Verify the checksum" | Change one byte of a binary: `sha256sum -c` prints `FAILED`, exit 1 (observed) | Passes |
| F8 | The file of each target is of the right kind (ELF x86-64 with the standard interpreter, ELF aarch64 with the standard interpreter, neither naming `/nix/store`; Mach-O arm64, Mach-O x86_64, PE32+) | `Binaries` job `build`, step "Check the file types" (`scripts/checkFileTypes.sh`; every check is an `if`, because a negated pipeline cannot fail a `set -e` script) | A Nix-linked `linux-x64` binary, and a Nix-linked binary under the `linux-arm64` name: the script prints `names a path in /nix/store`, exit 1 (observed, below) | The script passes on the five targets as CI builds them (local run: `file types ok`); CI runs it |
| F9 | The one registered suppression is live, and the effect family still holds | `bun run check:exceptions`, `effectFamily.test.ts` | Remove the directive in `hostPlatform.ts`: `check:exceptions` fails (control: below) | Passes |
| F10 | Round 3 of spec 0000: the boot test's controls, and `entry.ts`'s root selector held to `index.html` | `boot.test.ts`, `rootElement.test.ts` | Change the id in `index.html`: the selector test fails; skip `dispose()` in the embed test: the embed test fails (both observed) | Passes |

Observed controls (this branch, `bun run ready` green on the head):

- F3: `serverLayer` with `hostname: "0.0.0.0"`, rebuilt, `smokeBinary.sh dist/reebeat-studio full` printed `a connection to 192.168.1.181:43543 was ACCEPTED: the server is not loopback-only`, exit 1. With `127.0.0.1`: `non-loopback 192.168.1.181:42845 refused`, `exited 0 on SIGTERM`, exit 0.
- F4: the guard changed so that it never fires: `server.test.ts` 5 failed, 5 passed; `reebeat-studio --check` exited 1.
- F9: the directive in `hostPlatform.ts` removed: `EX-0001 has no live suppression site`, exit 1.
- F10: `index.html` root id changed: `AssertionError: expected +0 to equal 1`. `dispose` replaced by a no-op in the embed test: `expected <h1 class="text-2xl font-bold"></h1> to equal null`, 1 failed of 2. (Both are controls for spec 0000's round 3.)
- F8: `checkFileTypes.sh` on the five targets: `file types ok`, exit 0. With `linux-x64` compiled for the host target in devenv: `file type check failed: reebeat-studio-linux-x64 names a path in /nix/store: ... interpreter /nix/store/...-glibc-2.44-25/lib/ld-linux-x86-64.so.2`, exit 1. With that binary under the `linux-arm64` name (and a good `linux-x64`): `... reebeat-studio-linux-arm64 names a path in /nix/store`, exit 1. (Round 1 had found that the first version of this check, `! file ... | grep -q`, never failed.)
- F1: `checkShellDom.sh` on the DOM that headless Chromium dumps from the binary serving the built editor: `the editor shell: heading and four regions present`, exit 0; with one `aria-label` renamed, one at a time: `no region 'Story graph'`, `'Preview'`, `'Timeline'`, `'Inspector'`, exit 1 each; with the heading changed: `no heading 'reebeat studio'`, exit 1.
- `fromDirectory` and a directory key: with the file-type check removed, the new test fails (`read of /app/assets`); with it, it passes.

## What is added

| Part | Content |
| --- | --- |
| `apps/launcher` | `src/`: `assetStore.ts` (the service and its three layers), `routing.ts`, `server.ts`, `browser.ts`, `check.ts`, `cli.ts` (the program), `bunServer.ts` and `hostPlatform.ts` (the two adapters), `exitCode.ts`; roots `dev.ts` and `compiled.ts`; `scripts/embed.ts`, `scripts/smokeBinary.sh`; 37 tests. The root `bun run build` builds the editor, then embeds it and compiles the binary for the host (the launcher depends on the editor in the workspace only to be ordered after it) |
| CI | `.github/workflows/binaries.yml` (five binaries, checksums, file types, smoke on five runners, a draft release on a `v*` tag), `.github/workflows/preview.yml` (inert) |
| Web | `apps/editor/alchemy.run.ts`, `scripts/wizards/cloudflareWebDeploy.sh` (from the machine skill `wizard`, template unchanged) |
| Round 3 of spec 0000 | `apps/editor/src/rootElement.test.ts`, `rootSelector` in `application.ts`; spec 0000 Revisions |
| Exception | EX-0001: `hostPlatform.ts` reads the ambient `process.platform`. Retired when an Effect release exposes the host platform as a service |
| Config | `tsconfig.json` `allowedUnstableApis` lists the `effect/http` and `@effect/platform-bun` modules the launcher uses; `vite.config.ts` has the launcher's Effect groups |

## Constraints on the implementation

- Free on mechanism, specific on behaviour: the flags, the loopback bind, the 405 rule and the exit codes above.
- No secret anywhere; the Cloudflare values are the operator's and arrive only through GitHub secrets.
- Nothing is published: a release is created only as a draft, only for a `v*` tag the operator pushes.

## Risks

| Risk | Mitigation |
| --- | --- |
| The macOS and Windows jobs fail for a reason that cannot be seen on this machine (runner images, `curl`, `kill` in Git Bash) | They run on the pull request; Windows runs `--check` only; failures are fixed on the branch before the PR leaves draft |
| `bun build --compile` output depends on the Bun version | `devEngines.packageManager` pins Bun exactly (`1.4.2`), the version devenv provides, so `vp run` does not pick a newer one (round 1 found 1.4.3 downloaded under `^1.4.2`); the CI cross-compile step runs devenv's Bun directly; the binary embeds the runtime of its target |
| The embedded JSON doubles the editor's size in memory | The editor is 0.3 MB; revisit with a larger app |
| The first Alchemy release may move the Cloudflare API again | Unblocking step 1 says to adapt the import; the program is one resource |
| Random port: lost folder permission on every start | Open question 2 |

## Open questions for the operator

1. **Signing.** Apple notarisation and a Windows certificate cost money and a procedure; until then both warn. Decide when a first public release is wanted.
2. **Fixed or random port.** A random port makes persisted folder handles unusable across runs. Prefer a fixed port (for example 47310) with a random fallback?
3. **Publishing.** The release job makes a draft on a `v*` tag. Tag and publish are yours.
4. **Worker Previews versus one Worker per stage** (see Decisions), once the deploy runs.
5. **The Cloudflare token's scope.** The wizard lists Workers Scripts Edit, Account Settings Read, Workers Tail Read and Secrets Store Edit (the set that worked for vektorprogrammet's Alchemy stack, plus nothing for R2 or Hyperdrive). Alchemy's state store is created by the first deploy; if it needs another group, the job says which.

## Revisions

- **2026-10-29, plan written** with the build. The lead moved the number from 0003 to 0004 (a spec on the review and verify skills took 0003), and dropped the isolated `infra/` project and the effect-family exception the first version of the assignment asked for, because alchemy-run/alchemy#2754 fixes effect 4.1 upstream: the web deploy is written against the normal workspace and waits for the release.
- **2026-10-29, build deviations.**
  1. The binary embeds one JSON file, not one file per asset (see "How does the editor get inside?").
  2. `tsconfig.json`, copied unchanged from reebeat before, now lists more unstable modules in `allowedUnstableApis` (the launcher uses `effect/http`, `@effect/platform-bun` and, in a test, `effect/ByteSize`); `PROVENANCE.md` says so.
  3. The launcher's Effect groups in `vite.config.ts` name files one by one: a file that two groups match gets both roles' rules (observed: `dev.ts` was then both a library and a composition root and failed `no-premature-execution`).
  4. `apps/editor/alchemy.run.ts` is excluded from lint only; knip and the type check do not see it (the app's `tsconfig` includes `src` only).
  5. **The Nix-linked binary** (found with `file` while checking the file types): see "How is it built?". The `linux-x64` artifact is built as `bun-linux-x64-baseline`.
  6. `bun run build` at the root also compiles the host binary into `apps/launcher/dist/`; it is git-ignored and not an artifact. (The first version of this entry, AGENTS.md and the PR body said the host binary is Nix-linked. Round 1 showed it is not: `vp run` ran its own downloaded Bun 1.4.3, not devenv's 1.4.2. See round 1, item 4.)
- **2026-10-29, round 1 changes.**
  1. **The plan path (high; lead decision).** Revisions no longer plan a merge without the web part. The pull request stays a draft until an Alchemy release contains alchemy-run/alchemy#2754, then F1 is run and the pull request leaves draft. The operator's rule: a PR blocked on a dependency stays a draft until the dependency catches up. No split into two specs. (Unblocking step 5 is changed accordingly.)
  2. **`/nix/store` assertion (medium).** The assertion was a negated pipeline, which `set -e` ignores; it now lives in `scripts/checkFileTypes.sh` as an `if`, covers `linux-arm64` too, and was shown failing (F8 above).
  3. **F1 checks all four regions (medium).** The render step runs `scripts/checkShellDom.sh`, which was run against the real page and five mutants (F1 above).
  4. **Toolchain (medium).** `devEngines.packageManager` in `package.json` is now exactly `1.4.2` (was `^1.4.2`): Vite+ downloads the declared manager and does not yet differentiate `onFail` (its docs: "the other `onFail` values are accepted but not yet differentiated"), so a range let `vp run` take 1.4.3. With the pin, `vp exec -- bun --revision` and devenv's `bun --revision` print the same `1.4.2+744846f84`. It is the same release, downloaded, and not devenv's Nix binary, so the host build is not Nix-linked. reebeat's `package.json` has the same `^1.4.2` and `onFail: download`.
  5. **`unicorn/throw-new-error` is off for `apps/launcher/src/browser.ts` and `check.ts` (medium).** The rule treats a `Schema.TaggedError` class definition as a throw site; the classes contain no `throw`. The reason is in a comment in `vite.config.ts`, as for `tools/quality/effectExceptions.ts` (spec 0000). It is a configuration switch, not a suppression directive, so it has no registry entry.
  6. **`fromDirectory` and a directory key (low).** `GET /assets` named the directory `assets`: `exists` was true, `readFile` failed and the handler died (HTTP 500 in development). The store now `stat`s the file and serves only a regular file; `apps/launcher/test/assetStore.test.ts` covers `assets`.
