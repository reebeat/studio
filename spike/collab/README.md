# Collaboration spike: measurement code and raw output

The code and output behind [spec 0002](../../docs/specs/0002-collaboration-spike.md). Throwaway: it is not a workspace, not linted, not part of `bun run ready` (see PROVENANCE.md, "Spike code"). Every number in the spec comes from one command below, and the raw output of that command is committed in `output/`.

Run, from this directory: `bun install` (Bun 1.3.13), then the commands. `worker:e2e` needs Node 24 (Miniflare). `facts` needs `npm` and an authenticated `gh`. Pins: `yjs` 13.6.33, `@automerge/automerge` 3.5.0, `loro-crdt` 1.17.1, `effect` 4.1.0, `miniflare` 4.20260730.0 (`bun.lock`).

## Number to command to output

| Spec section and numbers | Command | Output file |
| --- | --- | --- |
| 1. Licence, versions, creation dates, stars, npm unpacked size | `bun run facts` | `output/facts.txt` |
| 1. Client bundle sizes (JS and wasm: raw, gzip, brotli) | `bun run bundles` | `output/bundles.txt` |
| 1. Worker bundle sizes | `bun run worker:build` | `output/worker-build.txt` |
| 1. Durable Object table: concurrent case through the room, log rows and bytes, restart from SQLite, and the empty-storage control | `bun run worker:e2e` | `output/worker-e2e.txt` |
| 2. The case table (19 cases, three libraries, two models; valid or invalid; merged result) | `bun run cases` (every run, with the swapped-peer-id check) and `bun run summary` (one row per case, then `runs 114, converged 114, valid 66 (naive 26 of 57, keyed 40 of 57)`) | `output/cases.txt`, `output/summary.txt` |
| 2. Which concurrent write wins | `bun run winner` | `output/winner.txt` |
| 3. Strategy counts (31 and 17 invalid; repair 26 and 15; gate 31 of 31 and 17 of 17, 0 false refusals) | `bun run summary` (last two lines); per run: `bun run strategies` | `output/summary.txt`, `output/strategies.txt` |
| 4. Determinism table (200 replays per library and model, distinct raw JSON, IR text and saved bytes) | `bun run determinism` (10 seeds, 20 orders) | `output/determinism.txt` |
| 4. Equal across processes and runtimes | `bun run digest` twice, and the same file under Node: `node --experimental-transform-types src/determinism.ts digest`; compare with `cmp` | `output/digest-bun-1.txt`, `output/digest-bun-2.txt`, `output/digest-node.txt` |
| 4. Negative control: replay missing the last update | `bun run controls` (section 3) | `output/controls.txt` |
| 5. T1, T2, T3 and attribution (4 and 26 patch operations, the wrong-effect case, last writer, change log, edit at an older version) | `bun run agent` | `output/agent.txt` |
| Measurements: saved size, build, load, JSON and projection time, history growth, merge | `bun run sizes` (Automerge strings as scalars) and `AM_STRINGS=text bun run sizes` | `output/sizes.txt`, `output/sizes-am-text.txt` |
| Measurements: the IR as JSON, gzip and brotli; Yjs with garbage collection on and off | `bun run controls` (section 4) | `output/controls.txt` |
| Falsifiers: the validator is not blind; peers differ before a merge and are equal after | `bun run controls` (sections 1 and 2) | `output/controls.txt` |

Timings (`ms` columns, `ms/edit`, merge time) vary from run to run on a shared machine; sizes in bytes and every count are deterministic. The numbers in the spec are those of the committed `output/` files.

## Layout

| Path | What it is |
| --- | --- |
| `src/doc.ts` | The document port: one path-addressed interface (`put`, `insert`, `remove`, `move`, `merge`, `json`, `save`, `updateSince`, ...) over Yjs, Automerge and Loro. Automerge strings are written as `ImmutableString` (scalars) unless `AM_STRINGS=text` |
| `src/model.ts` | The two documents: `naive` (the IR's own shape) and `keyed` (maps keyed by uid, an identity registry, the IR as `keyedView`), and the editor operations on each |
| `src/ir.ts` | The IR under test: reebeat's `GraphSchema`, `validateScene` and `jsonCodec`, the story `stories/same-id`, the stand-ins (curves, a numeric position, two derived events), and the stand-in invariant checks |
| `src/cases.ts`, `src/summary.ts`, `src/strategies.ts` | The cases, the case matrix and strategy counts, repair and the server gate |
| `src/determinism.ts` | Random operations, gossip, replays in random orders, digests |
| `src/agent.ts` | JSON Patch (`effect` 4.1) applied as a peer; attribution; edit at an older version |
| `src/sizes.ts`, `src/bundles.ts`, `src/facts.ts`, `src/controls.ts`, `src/winner.ts` | Sizes and timings, bundle sizes, registry facts, controls and baselines, the write-wins test |
| `worker/` | The Durable Object room (`room.ts`), one worker per library, the bundler (`build.ts`) and the end-to-end test on workerd (`e2e.ts`) |
| `bundle/` | The four entry files `bundles.ts` bundles |
| `ir/` | The copy of reebeat `packages/core/src` and the story fixture, with provenance in PROVENANCE.md |
| `output/` | The raw output of each command above |
