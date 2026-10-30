# tsukuri studio

The collaborative editor for [tsukuri](https://github.com/tsukuri-labs/tsukuri) stories. tsukuri is the open compiler: a story goes in, a reveal.js Deck and a Video come out. Studio is where people (and their agents) edit a story and watch it play.

Status: **a placeholder shell only**. The editor renders its four regions (story graph, preview, timeline, inspector) and edits nothing: the story IR it will edit is still changing in tsukuri ([spec 0001](docs/specs/0001-first-felt-journey.md) describes the first journey and is blocked on tsukuri specs 0004 and 0006).

## Try it

Needs [devenv](https://devenv.sh) (it provides Bun, Node and gitleaks). From the repository root:

```sh
devenv shell -- bun install
devenv shell -- bun run ready          # every gate: check, exceptions, tests, build, knip, cpd, secrets
cd apps/editor && devenv shell -- bunx vp dev      # the shell at http://localhost:5173/
```

## Where to read

- [`AGENTS.md`](AGENTS.md): the process, the gate table, the Effect and Foldkit rules.
- [`docs/design/lenses.md`](docs/design/lenses.md): how the studio is organised (lenses, free or paid), design only.
- [`docs/specs/`](docs/specs/): one spec per felt journey; [`STATE.md`](STATE.md) says which is active.
- [`PROVENANCE.md`](PROVENANCE.md): what was copied from tsukuri, at which commit, with which deviations.
- `apps/editor`: the Foldkit app. `tools/quality`: the exception registry check, the Effect family check and the Foldkit lint adapter.

## Licence

Copyright 2026 Philip Bjørknes Krogh. All rights reserved; licence not decided. The source is visible, and no licence file is present on purpose, so nothing here is licensed for reuse yet. Third-party code keeps its own licences (see `PROVENANCE.md` and the licence files next to copied code).

## Contributing

Every change travels spec → code → PR and passes the same gates locally, in CI and in a recorded review round. Read [`AGENTS.md`](AGENTS.md), then run `devenv shell -- bun install` and `devenv shell -- bun run ready`. The process is specified in [`docs/specs/0000-development-lifecycle.md`](docs/specs/0000-development-lifecycle.md).
