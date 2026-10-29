# reebeat studio

The collaborative editor for [reebeat](https://github.com/reebeat/reebeat) stories. reebeat is the open compiler: a story goes in, a reveal.js Deck and a Video come out. Studio is where people (and their agents) edit a story and watch it play.

Status: **a placeholder shell only**. The editor renders its four regions (story graph, preview, timeline, inspector) and edits nothing: the story IR it will edit is still changing in reebeat ([spec 0001](docs/specs/0001-first-felt-journey.md) describes the first journey and is blocked on reebeat specs 0004 and 0006).

## Try it

Needs [devenv](https://devenv.sh) (it provides Bun, Node and gitleaks). From the repository root:

```sh
devenv shell -- bun install
devenv shell -- bun run ready          # every gate: check, exceptions, tests, build, knip, cpd, secrets
cd apps/editor && devenv shell -- bunx vp dev      # the shell at http://localhost:5173/
```

The single binary (spec 0004; needs Bun, so inside devenv):

```sh
devenv shell -- bun run build                    # builds the editor, embeds it, compiles apps/launcher/dist/reebeat-studio
apps/launcher/dist/reebeat-studio                # serves on 127.0.0.1 (a free port) and opens your browser; Ctrl-C exits 0
apps/launcher/dist/reebeat-studio --check        # start, verify over HTTP, exit 0
```

Release binaries for linux x64 and arm64, macOS arm64 and x64, and Windows x64 come from CI (`.github/workflows/binaries.yml`) with `SHA256SUMS.txt`; the macOS and Windows ones are unsigned.

## Where to read

- [`AGENTS.md`](AGENTS.md): the process, the gate table, the Effect and Foldkit rules.
- [`docs/design/lenses.md`](docs/design/lenses.md): how the studio is organised (lenses, free or paid), design only.
- [`docs/specs/`](docs/specs/): one spec per felt journey; [`STATE.md`](STATE.md) says which is active.
- [`PROVENANCE.md`](PROVENANCE.md): what was copied from reebeat, at which commit, with which deviations.
- `apps/editor`: the Foldkit app. `apps/launcher`: the single binary that serves it on `127.0.0.1` ([spec 0004](docs/specs/0004-distribution.md)). `tools/quality`: the exception registry check, the Effect family check and the Foldkit lint adapter.

## Licence

Copyright 2026 Philip Bjørknes Krogh. All rights reserved; licence not decided. The source is visible, and no licence file is present on purpose, so nothing here is licensed for reuse yet. Third-party code keeps its own licences (see `PROVENANCE.md` and the licence files next to copied code).

## Contributing

Every change travels spec → code → PR and passes the same gates locally, in CI and in a recorded review round. Read [`AGENTS.md`](AGENTS.md), then run `devenv shell -- bun install` and `devenv shell -- bun run ready`. The process is specified in [`docs/specs/0000-development-lifecycle.md`](docs/specs/0000-development-lifecycle.md).
