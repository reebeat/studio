# 0002 Collaboration spike: which CRDT, which edit model, what to do with an invalid merge, where the sync server runs

Status: **spike report** (a measured recommendation; it builds nothing in `apps/`). Frozen when its PR opens; later changes are dated entries under Revisions. Date: 2026-10-29. Decided by: the lead's assignment of 2026-10-29 (questions 1 to 5 below); the recommendation is the spike's; the operator decided the library and the edit model on 2026-10-29 (see Decisions), and one choice remains open (see Open questions).
Process: [spec 0000](0000-development-lifecycle.md). Builds on [spec 0001](0001-first-felt-journey.md), which fixes "the replicated unit is the patch" and leaves the sync design to its own spec; this is the evidence for that spec. The IR shape is read from reebeat's branch `feat/0004-state-machines` at commit `a01bb39` (committed state only; the worktree had uncommitted changes that were not used), read-only.

## Problem

Studio is a collaborative editor, and its first paid feature is a multiplayer sync server (spec 0001, "Where the free and the paid line falls"). Two people, or a person and an agent, will edit one story at once. Three things decide whether that works: the library that merges concurrent edits, the shape of the document the library holds, and what happens when a merge is well-formed for the library but breaks a rule of the story IR (a dangling reference, a cycle, a duplicate id). reebeat's render is a pure function of the document, so the merged document must also be the same bytes on every peer.

## Questions (from the assignment)

1. Candidates: Yjs, Automerge 2.x/3.x, Loro: licence, size, maturity, JSON document support, self-hostable sync server, and whether it can run as a Cloudflare Durable Object (Alchemy v2 is the infrastructure default).
2. Fit with the story IR: five concurrent-edit cases on a document shaped like the IR, each judged by decoding the merged document with the real IR Schema.
3. Invalid merges: validate and repair after the merge, reject the edit, or model ids as stable keys and references by id.
4. Determinism: the same operations in different orders give byte-identical JSON.
5. Agents as peers: can an agent apply effect 4.1 `JsonPatch` operations as a CRDT peer, with attribution?

## Result in one screen

| Decision | Recommendation | Why (the numbers are below) |
| --- | --- | --- |
| **Library** | **Loro** (`loro-crdt` 1.17.1, MIT), behind a ten-method document port (`Doc`, written for this spike), so Yjs or Automerge can replace it. **Decided by the operator, 2026-10-29** (see Decisions) | All three merged every case to the same valid-or-invalid result except two cases (a4, b3), and the keyed model removes the first of those. So the choice rests on what the editor needs around the merge: Loro has the cheapest per-field author (`getLastEditor`), change messages, `forkAt` for agent proposals, a movable list, the fastest document load (1.4 to 2.1 ms for 370 to 410 KiB on the scaled story, against 138 ms for Automerge and 13 to 20 ms for Yjs) and a 6.8 KiB (brotli) JS glue. Its costs: the youngest of the three (2022), a 0.84 MB (brotli) wasm, a saved document 1.4 times the JSON, and no turnkey Durable Object server |
| **Edit model** | **Keyed document, IR as a pure projection.** Every array of objects that has an id becomes a map keyed by an immutable uid with a `pos` for order; one story-wide registry holds the name of each Element (the IR `id`); references hold the uid; data the IR repeats (`chapter.sceneIds`, line ids) is derived, not stored. Edits are made by id, as spec 0001 already says for tools | 31 of 57 library-by-case runs on the naive IR-shaped document were invalid IRs; 17 of 57 on the keyed one. Rename, reorder and curve-order failures vanish; the 17 left are conflicts of intent |
| **Invalid merges** | **Three layers.** (1) Keyed ids and derived data (above). (2) An authoritative validation gate in the Durable Object that refuses a change set whose merge is not a valid IR, with the reason, so the author rebases. (3) A pure, deterministic repair function that is shown as a proposal (a compensating patch with the system as author), never applied silently | The gate refused an edit in 17 of the 17 invalid keyed outcomes and in none of the valid ones; the repair made 15 of the 17 valid and cannot make the other two valid (a semantic conflict: an Element left hidden and never revealed) |
| **Determinism** | Holds for all three. Compare **the IR text** (written by 0004's `jsonCodec`), never the library's saved bytes | 200 random replays per library and model, 0 differing JSON texts, equal across processes and across Bun and Node. The saved bytes differ for Automerge in every replay and for Yjs in about 5 percent |
| **Agents** | The agent is a peer with its own replica, identified by a peer id registered to a name. Its tool calls are by id and become document operations; the **JSON Patch is the description of the edit** (review, proposal, undo), not the replicated unit | Effect 4.1 `JsonPatch.get` diffs arrays by position: one inserted effect becomes 26 operations that rewrite the next effects field by field. Applied by index to a document that moved on, a patch edits the wrong effect and the result is still valid. On the keyed document the same kind of edit is 4 operations, all addressed by uid |
| **Server** | **One Durable Object per story**, WebSocket Hibernation, an update log in the object's SQLite storage compacted to a snapshot, and the validation gate inside it (a Durable Object is single-threaded, so the gate has no race). Alchemy v2 declares the namespace. The free tier needs no server: the same document lives in a file | A 60-line, library-agnostic room ran on workerd (Miniflare) for all three libraries: two clients converged on a valid IR, and a third read the same document after the object was restarted from its SQLite file |

## Method

Everything below was built and run from the code in [`spike/collab/`](https://github.com/reebeat/studio/tree/spike/collaboration-code/spike/collab) on branch `spike/collaboration-code` (commit `b43f82b57b1c57ce993e89c2d32e090558aad91a`). It is throwaway measurement code, not part of the product's gates; its [README](https://github.com/reebeat/studio/blob/spike/collaboration-code/spike/collab/README.md) maps each number below to the command that makes it and to the raw output committed in `spike/collab/output/`. Pins: `yjs` 13.6.33, `@automerge/automerge` 3.5.0, `loro-crdt` 1.17.1, `effect` 4.1.0, `miniflare` 4.20260730.0, Bun 1.3.13, Node 24.21.

- **The IR is the real one.** `GraphSchema`, `validateScene` and `jsonCodec` are the code of reebeat `a01bb39` (a copy of `packages/core/src`, unchanged). The story is `stories/same-id` (seven scenes), imported with the real Fountain importer (the fixture's SHA-256 is `6a71b9fa2f96837034b0cffd6c90023c4d374f2ad75e55a7151308f3f50b8e9e`), so the document has real Elements, effects, derived events (`let`) and chapters. A merged document is **valid** when `GraphSchema` decodes it, `validateScene` finds nothing in any scene (with the identity diff against the previous scene, as `planScenes` computes it), and a small stand-in for invariants 0004 does not state finds nothing.
- **Stand-ins, named.** 0004 has no attribute curves and no numeric position yet (the decided IR will: "attributes are data curves over time"). Element `one` of scene `sc4` carries two stand-in fields for the spike: `at: {x, y}` and `curves.opacity`, four control points `(t, v)`, with the invariants that `t` starts at 0, ends at 1 and strictly increases. Two derived events `p` and `q` were added to `sc4` for the cycle case. `GraphSchema` is closed, so these fields are removed before it decodes the document and are checked on their own.
- **Cases run on 3 libraries times 2 models.** The libraries sit behind one path-addressed interface (`put`, `insert`, `remove`, `move`, `merge`, `json`, `save`, `updateSince`, ...), so each case is written once. Peer ids 2 and 3 edit a fork of one seeded replica without seeing each other, then merge both ways. Every case was also run with the two peer ids swapped. 19 cases, 114 runs.
- **IR-invariant gaps found on the way** are in "Feedback for reebeat".

## 1. Candidates

| | Yjs | Automerge | Loro |
| --- | --- | --- | --- |
| Licence | MIT (`yjs` 13.6.33, LICENSE file) | MIT (Ink & Switch) | MIT |
| Created, stars (GitHub, 2026-10-29) | 2014-07-29, 22,994 | 2019-12-26, 6,696 | 2022-07-12, 6,258 |
| Version measured, latest release | 13.6.33 (2026-09-23); `v14.0.0-rc.29` is a release candidate (2026-10-15) | 3.5.0 (2026-09-16); 3.0 (2025-07-14) cut memory use more than 10 times | 1.17.1 (2026-10-22) |
| npm unpacked | 2.3 MB (+ `lib0` 5.8 MB) | 47.5 MB (five copies of the wasm) | 21.9 MB |
| Client bundle, minified JS (raw / gzip / brotli) | 64.2 / 19.6 / 17.7 KB | 28.4 / 7.1 / 6.3 KB (`slim`); 45.6 KB full | 70.4 / 7.9 / 6.8 KB (`web`) |
| Wasm (raw / gzip / brotli) | none | 3.64 MB / 1.14 / 0.79 MB | 3.60 MB / 1.19 / 0.84 MB |
| JSON documents | `Y.Map`, `Y.Array`; a plain value is one register | JSON-like; **a JS string is collaborative text by default** (one operation per character); use `ImmutableString` for an id or an enum | `LoroMap`, `LoroList`, `LoroMovableList`, `LoroTree`; "compatible with the JSON schema", no numeric map keys, avoid cyclic links |
| List move | none (delete and insert) | none (delete and insert) | `MovableList.move` and `.set` |
| Self-hostable sync server | `y-websocket` (MIT), `y-partyserver` (ISC, Cloudflare), `y-durableobjects` (MIT) | `automerge-repo-sync-server` (MIT, Node); `automerge-repo` is at `2.6.0-alpha` and `3.0.0-experimental` | `loro-websocket` `SimpleServer` (Node) and a Rust server with SQLite; the protocol repo has 41 stars |
| Durable Object | **Turnkey: `y-partyserver`** (`YServer extends DurableObject`, `onLoad` and `onSave` persistence). Read, not run | No DO adapter found. The package has a first-class `workerd` entry point. **Ran on workerd with a 60-line room (below)** | No DO adapter found. **Ran on workerd with the same room** |

Sources: <https://docs.yjs.dev/api/shared-types/y.map.md>, <https://github.com/cloudflare/partykit/tree/main/packages/y-partyserver>, <https://automerge.org/blog/automerge-3/>, <https://automerge.org/docs/reference/documents/conflicts/>, <https://www.loro.dev/docs>, <https://www.loro.dev/docs/tutorial/list>, <https://github.com/loro-dev/protocol>, GitHub and npm metadata read on 2026-10-29. Loro's own page says its wasm is about 970 KB gzipped; the 1.17.1 file measured 1.19 MB at gzip level 9.

**On a Durable Object.** A CRDT update is opaque bytes, so a room needs no knowledge of the library beyond "apply this update" and "give me the whole document". The spike's room (`worker/room.ts`, 60 lines, one backend of about 5 lines per library) accepts WebSockets with Hibernation (`ctx.acceptWebSocket`), appends every update to a SQLite table, broadcasts it, sends the snapshot to a joiner, and replaces the log by one snapshot after 50 updates. It ran on workerd through Miniflare for each library: client A seeded the story, client B joined from the snapshot, A and B made case d1 concurrently through the room, both converged on a valid IR, the object was disposed, a new one started from the SQLite file, and client C read a document equal to A's.

| | Yjs | Automerge | Loro |
| --- | --- | --- | --- |
| Worker bundle, JS (raw / gzip) | 81.3 KB / 25.2 KB | 49.1 KB / 10.1 KB | 86.7 KB / 13.1 KB |
| Wasm module in the worker | none | 3.64 MB | 3.60 MB |
| Concurrent case d1 through the room: converged, valid | yes, yes | yes, yes | yes, yes |
| Log in SQLite after the case (rows, bytes) | 3, 11.5 KB | 3, 3.8 KB | 3, 15.8 KB |
| After restart from SQLite: joiner's snapshot (bytes), same document | 11.5 KB, yes | 3.7 KB, yes | 16.0 KB, yes |

What this does not show: the real Cloudflare edge (only workerd locally), load, hibernation under many sockets, or `y-partyserver` itself. Platform limits that bind this design (<https://developers.cloudflare.com/durable-objects/platform/limits/index.md>): a SQLite value or row is at most 2 MB, so a snapshot over 2 MB must be chunked (the scaled story, 210 scenes, saved at 0.41 MB in Loro, the largest of the three); a received WebSocket message is at most 32 MiB; a Durable Object is single-threaded with a soft limit of 1,000 requests per second; storage per object is 10 GB. Alchemy v2 declares the namespace with Hibernation support (<https://www.v2.alchemy.run/providers/cloudflare/durableobjectnamespace>).

## 2. Fit with the story IR: the cases

Two documents hold the same story. **Naive**: the IR's own shape (arrays of Elements, effects and derived events; ids are strings other objects name). **Keyed**: described under the recommendation. The edits are those an editor would make, each reading the replica's current view (a delete cascades to the effects and events that mention the Element; a rename rewrites every reference the replica can see). In the table, `✓` is a valid IR after the merge and `✗` an invalid one, listed for Yjs, Automerge, Loro in that order. Every one of the 114 runs converged to the same document on both peers.

| Case | The two concurrent edits | Naive | Keyed | Merged result |
| --- | --- | --- | --- | --- |
| a1 | Two users move `one` to different cells (`cell` is an enum) | ✓✓✓ | ✓✓✓ | one wins, the other is lost |
| a2 | One moves it along x, the other along y (`at` as two fields) | ✓✓✓ | ✓✓✓ | `(0.1, 0.9)`: a position neither user chose |
| a3 | Both set `at` as one atomic value | ✓✓✓ | ✓✓✓ | one whole position wins |
| a4 | Both move scene `sc7` to different places in the story | ✗✗✓ | ✓✓✓ | naive Yjs and Automerge: `sc7` twice (`DuplicateSceneId`); Loro's movable list and the keyed `pos`: once |
| b1 | One deletes `tag` and its dependants, the other changes its colour (`class`) | ✓✓✓ | ✓✓✓ | deleted, the colour edit is silently lost |
| b2 | One deletes `tag`, the other adds an effect that targets `tag` | ✗✗✗ | ✗✗✗ | `UnknownReference`: a dangling target |
| b3 | One deletes `note`, the other replaces the whole `note` record | ✗✗✓ | ✗✗✓ | Yjs and Automerge keep the replacement (hidden, never revealed: `HiddenNeverRevealed`); Loro deletes |
| c1 | Both insert an effect at index 1 (different ids) | ✓✓✓ | ✓✓✓ | both kept; their order differs between libraries |
| c2 | Both insert an effect and both chose the next free id `s9` | ✗✗✗ | ✗✗✗ | two effects named `s9` |
| c3 | `p` anchored to `q` by one user, `q` to `p` by the other | ✗✗✗ | ✗✗✗ | `EffectCycle: p -> q -> p` |
| c4 | Both insert a run of three effects at index 1 | ✓✓✓ | ✓✓✓ | naive: runs stay together; keyed: interleaved `a1,b1,a2,b2,a3,b3` |
| d1 | One renames `one` to `cube` everywhere, the other adds an effect that targets `one` | ✗✗✗ | ✓✓✓ | naive: `UnknownReference "one"`; keyed: the effect targets `cube` |
| d2 | One renames `one`, the other adds an event anchored to `one.move.end` in `sc5` | ✗✗✗ | ✓✓✓ | as d1 |
| d3 | One renames `one` everywhere, the other adds an Element `one` in `sc7` | ✓✓✓ | ✓✓✓ | naive: `sc7` keeps the old name, so identity splits and nothing detects it; keyed: `sc7` shows `cube` |
| d4 | Two renames to the same name, `box2`, of `one` and `tag` | ✗✗✗ | ✗✗✗ | two Elements with one id |
| e1 | Curve: one moves point p1 (t .3 to .6), the other p2 (t .7 to .4): they cross | ✗✗✗ | ✓✓✓ | naive `t=[0,.6,.4,1]`; keyed `t=[0,.4,.6,1]` (sorted by `t`) |
| e2 | Curve: one moves p1 to .6, the other inserts a point at .5 | ✗✗✗ | ✓✓✓ | naive `[0,.6,.5,.7,1]`; keyed `[0,.5,.6,.7,1]` |
| e3 | Curve: one sets p1.v, the other p1.t | ✓✓✓ | ✓✓✓ | `(t .5, v .9)`: a point neither saw |
| e4 | Curve: both move different points to t=.5 | ✗✗✗ | ✗✗✗ | a tie, `t` not strictly increasing |

Totals: **naive 26 valid of 57, keyed 40 of 57**; the two libraries that fail on a4 are the two without a move operation.

Reading:

- **The library mostly does not decide validity.** Where outcomes differ between libraries, only a4 and b3 do. The rest is decided by the document shape and by the invariant, which is why the edit model carries the recommendation.
- **Which write wins** is not wall-clock time. Measured (same field set by both, peer ids 2 and 3, with and without three prior edits by one side): Yjs picks the higher client id every time; Automerge and Loro pick the side with more prior operations (the higher counter, as Automerge's documentation says), and the higher peer id only on a tie. In Automerge the losing value is still readable (`getConflicts`).
- **Delete wins over an edit of the same record in every library and model** (b1); only a whole-record replace can survive a delete (b3), and then it depends on the library. No library resurrects the deleted record. If losing a concurrent colour edit is not acceptable, the IR needs a soft delete (a `deleted` flag that projection hides), which was not tested [INFERENCE].
- **Property-wise merge** (a2, e3) produces values nobody chose, still valid. Whether that is wanted is a product choice; `a3` shows the atomic alternative (store the position as one register).
- **Effect order matters.** 0004's timeline keeps source order for ties, and c1 and c4 show the merged order depends on the library and on the peer ids, deterministically.

## 3. Invalid merges: strategies compared

On the same 114 runs, applied to the 48 that were invalid as merged:

| Strategy | Naive (31 invalid) | Keyed (17 invalid) | What it costs |
| --- | --- | --- | --- |
| **Ids as stable keys, references by id** (the keyed model) | fixes 14 of 31 by construction | n/a | a projection (view) from the document to the IR; ids cannot be edited as text; new Elements need a uid minted per peer (`<peer>.<counter>` in the spike) |
| **Validate and repair after the merge** (a pure function of the merged IR: rename a duplicate with a suffix, drop what depends on a missing thing, break a cycle at its last event, sort curve points, drop duplicate scenes, derive `chapter.sceneIds`) | valid after repair: 26 of 31 | valid after repair: 15 of 17 | silently drops or renames user data; cannot repair b3 (needs a human) or, on the naive document, d4 (without the identity, a duplicate name cannot be renamed the same way in every scene) |
| **Reject at the server** (a replica applies each change set on a copy, refuses it if the result is invalid) | refused an edit in 31 of 31 | refused an edit in 17 of 17 | the refused user's change must be rebased; it never refused a merge that was valid (0 false refusals); with offline editing the unit refused is a whole change set |

The three compose, in this order of cost: keyed ids remove what can be removed; the rest is conflicts of intent, which only a person can settle. The recommendation: the gate in the Durable Object is the authority; the repair is computed and offered as a compensating patch (a suggestion, as in [`docs/design/lenses.md`](../design/lenses.md), "suggestion mode"), never applied without a person.

`validateScene` does not detect everything the merged documents broke (see Feedback for reebeat).

## 4. Determinism

Three peers make random editor operations (class, cell, text, add effect, rename, move scene, curve edits, delete) in 8 rounds with random one-way gossip, so changes are concurrent and nested. Every change is recorded as the library's own incremental update. The updates are replayed into fresh replicas in random orders (the libraries hold back a change whose causes have not arrived). 10 seeds, 20 orders each, per library and model.

| Library, model | Replays | Random ops | Equal to the gossiped state | Distinct JSON (raw key order) | Distinct IR text (`jsonCodec`) | Distinct saved bytes (extra, summed over seeds) |
| --- | --- | --- | --- | --- | --- | --- |
| Yjs naive / keyed | 200 / 200 | 1,357 / 1,337 | 200 / 200 | 0 / 0 | 0 / 0 | 10 / 11 |
| Automerge naive / keyed | 200 / 200 | 1,358 / 1,330 | 200 / 200 | 0 / 0 | 0 / 0 | 190 / 190 |
| Loro naive / keyed | 200 / 200 | 1,327 / 1,330 | 200 / 200 | 0 / 0 | 0 / 0 | 0 / 0 |

- The raw JSON key order of the libraries' own output was also identical in every replay, and the SHA-256 of the converged raw JSON was equal across two Bun processes and one Node process (JavaScriptCore against V8) for all 18 library, model and seed combinations. This is observed, not guaranteed by any of the libraries' documentation read here; the IR text written by `jsonCodec` (schema key order) does not depend on it, so the render should hash that text.
- The saved bytes are **not** a content hash: Automerge's `save()` differed in every order (190 of 190 possible), Yjs's in about 5 percent, Loro's never. Do not use a library's saved bytes as the document revision. Spec 0001's `baseRevision` is the SHA-256 of the canonical IR JSON; keep it so.
- Negative control: replaying with the last update withheld gave a different document in all three libraries (the comparison can fail).

## 5. Agents as peers with attribution

**What effect 4.1 `JsonPatch` is** (source, `node_modules/effect/src/JsonPatch.ts`): `add`, `remove`, `replace` only (no `move`, no `copy`, no `test`); `get(old, new)` and `apply`. `get` compares arrays **by index**, not by identity.

| Test | Result |
| --- | --- |
| **T1** The agent diffs the keyed document with `JsonPatch.get` and applies the patch on its own replica (peer id 777, registered as `agent:claude-1`), while a human renames an Element, adds an effect and sets the same cell | Patch: 4 operations, each addressed by uid (`add effects/<uid>`, `replace elements/<uid>/class`, `replace elements/<uid>/cell`, `replace .../curves/opacity/<uid>/v`). Merged with the human's edits on all three libraries: converged, valid, both sides' edits kept. The shared field `one.cell` went to the agent in all three (higher peer id or counter) |
| **T2** The same on the IR-shaped (naive) document: one field of one effect | 1 operation. Fine on the agent's own replica |
| **T2** One effect inserted at index 1 of 4 | **26 operations**: `replace` of `id`, `line`, `name`, `when`, `written` of effects 1 to 3 and an `add` at the end. Positional diff makes an insert into a rewrite of every later item |
| **T2** The 1-operation patch applied by index to the live document after a human inserted at index 0 | Applied to the wrong effect (`s1` renamed instead of `s2`), **and the IR is still valid**. Nothing detects it |
| **T2** The 26-operation patch applied to the moved-on live document | An invalid IR (effect ids `h1, ag1, s2, f1, r1, r1`) |
| **T2** Either patch applied on the agent's **own replica** and then merged | Valid on all three libraries, both edits correct |
| **T3** Edit at an older version on the live document | Works on all three: Automerge `A.view(heads)` then `clone`, or `A.changeAt(heads)`; Loro `forkAt(frontiers)`; Yjs only with garbage collection off (`gc: false`: 5,000 edits of one field saved at 45.3 KB against 11.4 KB with it on), a snapshot and `createDocFromSnapshot` |

**Attribution**, by what each library offers (tested on T1; `human:ana` and `agent:claude-1` registered by peer id):

| | Yjs | Automerge | Loro |
| --- | --- | --- | --- |
| Author of the current value of one field | The client id of the item (`map._map.get(key).id.client`, an **internal** field); `Y.PermanentUserData` maps a client id to a user name and travelled with the document (read back as `agent:claude-1`) | Scan the decoded changes for the last operation on the object and key (operation ids are `counter@actor`); O(history) | `LoroMap.getLastEditor(key)`, one public call |
| Change message and time | None: a Yjs update carries no message (a transaction `origin` exists only while the transaction is live) | `change(doc, {message, time})`; read with `getAllChanges` and `decodeChange` (verified: the message of the agent's run on each of its changes) | `commit({message, origin, timestamp})`; read with `getAllChanges` (verified) |
| A proposal that is not yet applied | A second document, but time travel needs `gc: false` | `clone`, `view`, `changeAt` | `fork`, `forkAt`, `checkout` |

**Reading.** An agent can be a CRDT peer with attribution in all three, but the **patch is the wrong replicated unit** for a CRDT: the unit is the library's update (opaque bytes, applied idempotently and in any order), and the patch is how an edit is described. Spec 0001 already edits by id and makes `apply_patch` a raw tool for tools that compute pointers; this spike says why the id-addressed tools are the real interface and the raw patch is for documents whose arrays carry no identity. If a patch is addressed to the IR and not to the keyed document, the id must be in the pointer (`/scenes/sc4/effects/s2/name`), which `JsonPatch.get` over arrays will not produce.

## Measurements: sizes and timings

All single runs on a shared workstation (memory pressure low); the order of magnitude is the finding, not the last digit. Automerge is measured in its two string modes: the default (every string collaborative text) and `ImmutableString` (every string a scalar, which is what ids and enums should be). Spike numbers below use the latter unless marked "text". Source: `spike/collab/output/sizes.txt` and `sizes-am-text.txt`.

The real story (7 scenes) as JSON: 8.7 KiB (gzip 2.2, brotli 1.8 KiB). The scaled story (the real story repeated 30 times, 210 scenes, ids suffixed): 262.6 KiB (gzip 9.7, brotli 4.1 KiB).

**Saved document** (KiB; brotli in parentheses; naive / keyed):

| | Real story | Scaled story |
| --- | --- | --- |
| Yjs | 10.1 (3.2) / 11.1 (3.3) | 309 (33) / 345 (37) |
| Automerge | 3.3 (3.2) / 3.4 (3.4); text: 6.6 / 6.8 | 27.2 (25.7) / 28.6 (27.2); text: 126 / 119 |
| Loro | 13.9 (9.7) / 15.2 (10.5) | 371 (173) / 408 (186) |

**Time (ms), scaled story, keyed model:**

| | Build from JSON | Load from saved bytes | Materialise JSON | Project to IR |
| --- | --- | --- | --- | --- |
| Yjs | 12 | 13 | 3.2 | 2.8 |
| Automerge | 186 (text: 278) | 138 (text: 285) | 6.6 | 2.8 |
| Loro | 75 | 2.1 | 27.8 | 2.4 |

Merge of 300 random operations of one replica into another (scaled, keyed): Yjs 4.0 to 4.6 ms (update 9.4 KiB), Automerge 31.6 ms (text: 55.6; update 45.5 KiB, text: 56.6), Loro 8.2 to 12.1 ms (update 7.4 KiB).

**History growth**, 5,000 single-field edits on the real story, keyed: Yjs 11.1 to 34.9 KiB (garbage collection on); Automerge 3.4 to 23.2 KiB (text: 68.4); Loro 15.2 to 38.3 KiB, and 10.3 KiB for the same state with its history dropped (`shallow-snapshot`). Time per edit, including the read of the replica's JSON: Yjs 0.11 ms, Automerge 0.43 ms (text: 0.46), Loro 0.77 ms.

Reading: Yjs is smallest in JS and fastest overall; Automerge's file is the smallest and its load is the slowest (a Durable Object that wakes pays that on every cold start); Loro loads fastest and merges quickly but materialises the whole JSON slowly (an editor must read through events or a subtree, not the whole document on every change).

## Recommendation

**Library: Loro, behind the `Doc` port** (decided by the operator, see Decisions). The deciding reasons are the ones the editor needs and Yjs lacks: a public per-field author and change messages (attribution as spec 0001 and the lenses note need it), cheap forks and `forkAt` for suggestions and agent proposals without turning garbage collection off (a fourfold growth in Yjs), a movable list, and the fastest cold load for a Durable Object. The trade is maturity and ecosystem: Yjs is older by eight years and has a Cloudflare-maintained Durable Object server; Loro's sync servers are young. The port and the keyed model make the choice reversible: the same 19 cases and the same model ran unchanged on all three. **Fallback and trigger:** choose Yjs instead if maturity and a turnkey `y-partyserver` come to weigh more than attribution and branching; choose Automerge if document size and offline history matter more than load time and its collaborative-string default can be worked around (it needs `ImmutableString` for every scalar).

**Edit model: keyed document, IR as projection**, as in the table at the top. Concretely: scenes, Elements, effects, derived events, lines, chapters and curve points are maps keyed by uid; an Element's story-wide identity is one registry entry (rename is one write; a new instance of the Element in a scene is a new key under the same uid); order is a `pos` field, ties broken by uid; the IR is `project(document)`, a pure function, written by `jsonCodec`; derived repeats are not stored. Position as one atomic value if a position must never be torn. Edits are by id. New ids carry the minting peer, so two peers never mint the same one (this does not stop two peers choosing the same *name*: c2, d4).

**Invalid-merge strategy: the three layers** above. In the Durable Object, the gate decodes the merged document (`GraphSchema`, then the scene checks) before accepting a change set; local edits are validated before they are committed (spec 0001's F4); a refusal carries the reason; the repair function is offered as a proposal.

**Server: a Durable Object per story, Hibernation, SQLite log with compaction, gate inside.** Chunk snapshots over 2 MB. The free tier is the same document in a file with no server. Cloud-hosted agents are peers of the same room. This is the paid feature of spec 0001; everything else in this report runs locally.

**Consequence for spec 0001.** Its line "the unit that is replicated is the patch" changes to "the unit that is replicated is the library's update; the patch describes the edit" (review, proposal, tool protocol, undo as a computed inverse). Its single writer and `baseRevision` check remain the right design for the free local tools; with a merge-based document the revision is the hash of the projected IR (as now) and a stale base is not an error but a merge. The operator chose the merge-based document (Decisions).

## Decisions

- **2026-10-29, the operator** (relayed by the lead): the **edit model** is a merge-based keyed document with a validation gate in the sync server, the Durable Object; a repair is offered as a proposal and never applied without a person. The **library** is Loro, behind the ten-method document port. These close the former open questions 1 (library) and 2 (one writer or a merge). The consequence for spec 0001 stands as written under Recommendation: the replicated unit is the library's update and the patch describes the edit. The sync spec is written against this document.

## Falsifiers (each with its control)

| Claim | The check | Negative control, observed |
| --- | --- | --- |
| A merged document is judged by the real IR, not a stand-in | `GraphSchema` decode plus `validateScene` per scene (with the identity diff) on the merged view | Deleting `tag` from `sc4` without its dependants gives `NoSuchEvent`; making `p` and `q` wait for each other gives `EffectCycle`; the unchanged story is valid |
| The validator is not blind | The stand-in checks | A duplicate Element id in a scene is accepted by `validateScene` (the control run) and rejected by the stand-in `DuplicateElementId`; a curve with a crossing point is rejected by the stand-in |
| All replicas converge | Canonical JSON of both peers after a two-way merge | Before the merge the two peers' documents differ in all three libraries (each had made one edit); after it, 114 of 114 runs were equal |
| Determinism holds over orders | 200 random replays per library and model, canonical JSON, IR text, raw JSON | Withholding the last update changes the document in all three libraries |
| The gate has no false refusals | Over the 66 valid outcomes | 0 of the 66 valid outcomes were refused, 48 of 48 invalid ones were |
| An index-addressed patch is unsafe on a moved-on document | T2 | The same patch on the agent's own replica merges correctly |
| The Durable Object room works | Miniflare, three libraries: concurrent case, restart, a third client reads the document | Starting the object on an empty storage directory instead of the SQLite file gave a different (empty) document in all three libraries |

## Not measured

- The real Cloudflare edge, load, many sockets, `y-partyserver`, hibernation cost.
- Text collaboration inside a line of narration (character-level merge). The IR's text fields were treated as scalars.
- Undo and redo (Loro and Yjs have an `UndoManager`; Automerge has none), selective undo of an agent's change.
- Presence (cursors, playhead): Yjs awareness, Loro's `EphemeralStore`; spec 0001's lenses note leaves it to the sync spec.
- Soft delete, and the write-back of a repair as an attributed operation (only the view-level repair was run).
- Documents above 210 scenes, or long offline divergence, or a malicious peer (Automerge advertises byzantine-fault tolerance; Loro's documentation says it has none).
- `Y.Doc` v14 (a release candidate).

## Feedback for reebeat (0004, 0005, 0006)

When the IR becomes the committed source, some invariants are held by the Fountain importer or by nothing, and a merged or hand-edited JSON breaks them without an error from `GraphSchema` or `validateScene` (control runs against `a01bb39`): two Elements with one id in a scene (accepted, control run and case d4); two effects or an effect and a derived event with one name (accepted, case c2; the importer's `nameTaken` checks it while parsing); two scenes with one id (case a4; `validateScene` is per scene and cannot see it); `chapterId` and `chapter.sceneIds` out of step with the scenes (the IR keeps both, so two copies of one fact exist; the line ids `<scene>.l<n>` are likewise derivable and stored). In the spike these were caught only by the stand-in checks.

## Open questions for the operator

1. **Property-wise or atomic merge** for position and curve points (a2, e3 against a3). Questions about the library and about one writer against a merge are closed (Decisions).

## Revisions

- **2026-10-29, written** after the measurements; no earlier plan.
- **2026-10-29, evidence code committed** (commit `b43f82b57b1c57ce993e89c2d32e090558aad91a` on branch `spike/collaboration-code`, `spike/collab/`). Every number now cites a command and its committed raw output (`spike/collab/README.md`). Timings were re-measured from those committed outputs and replace the first run's: Loro loads in 1.4 to 2.1 ms (not 2 to 6), Automerge 138 ms (not 160), Yjs 13 to 20 ms; Loro materialises JSON in 28 ms (not 74); merges and times per edit changed by under a factor of 1.5. Sizes in bytes and every count are unchanged. One falsifier row is corrected: the pinned story has no `f2` and `settled`, so deleting `tag` without its dependants gives `NoSuchEvent` only, not `UnknownReference` as well.
- **2026-10-29, operator decisions recorded** (see Decisions). Open questions 1 and 2 are closed.
