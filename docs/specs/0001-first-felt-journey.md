# 0001 The editor's first felt journey

Status: **planned, blocked on reebeat 0004 and 0006**. A design only: this spec builds nothing and `apps/editor` stays the placeholder shell of spec 0000 until the blockers clear. Date: 2026-10-29. Decided by: the journey and the open-core split are the operator's proposal of 2026-10-29; the preview, the protocol and the falsifiers below are proposals, and each choice that is the operator's to make is listed under "Open questions".
Process: [spec 0000](0000-development-lifecycle.md). Sources read for this spec: reebeat `main` at `f7c3488` and its branch `feat/0004-state-machines` at `a9afd4c` (specs 0000 to 0003 and 0004; the SCXML spike 0007 and the licence plan 0008 as open branches); the installed `effect` 4.1.0 (`src/JsonPatch.ts`). Nothing here reads reebeat's code at runtime yet.

## Problem

reebeat compiles a story into a Deck and a Video, but a story is edited today as a text file and judged by building it. The reebeat vocabulary (States, Beats, Scenes, Elements, effects) is a graph in time; a person who wants to change one Element and see the result must rebuild, wait, and open a file. Studio is the place where that loop is immediate, and where a person's agent can make the same edit the person would.

## Goal: one felt journey

Open a reebeat story, see its States and Beats as a graph and a timeline, scrub a preview, edit one Element property, and see the preview update. A person (or an agent through the tool protocol) does it with no server.

```text
1. open        a story IR JSON file (reebeat 0006's committed source) opens in the editor
2. see         graph: States as nodes, grouped by Scene; Beats as edges        timeline: lanes in time, with the effects
3. scrub       drag the playhead: the preview shows that frame (and its narration word)
4. edit        select an Element in the preview or the graph; the inspector shows its properties; change one
5. see it      the change is one JSON Patch; the story is valid or the edit is refused with the reason;
               the preview shows the new frame at the same playhead; undo restores the old story byte for byte
```

The regions of the spec 0000 shell are the regions of this journey: Story graph, Preview, Timeline, Inspector. The studio is organised by **lenses** (the operator's direction of 2026-10-29; [`docs/design/lenses.md`](../design/lenses.md)), and this journey uses a subset of them: the **Story graph** lens (read-only graph, plus one Element property edited in the inspector), the **Timeline** lens (read-only, with the scrub), the always-present preview and playhead, and the edit path and tool protocol that the **Agent panel** lens will sit on. It builds no other lens, no lens switcher and no permission scopes. Which lenses are free and which are paid is in the design note, by the same rule as the table below.

What is real in the journey when built: the IR, its validation, the compiled timeline and the preview are reebeat's own code running in the browser; nothing is mocked. What is a stand-in: narration comes from reebeat's committed speech cache or the silent stand-in narrator (a Kokoro or whisper run is not a browser job).

## Dependencies on reebeat: what must be stable first

This spec starts when every row is true. Studio does **not** build editing features against the IR before then; the rows are observable, not promises.

| # | What studio needs | reebeat owner | Observable when stable |
| --- | --- | --- | --- |
| D1 | **The story IR is a closed, versioned Effect Schema** (`GraphSchema`, `graphVersion`) and a JSON Schema is generated from it and held by a drift test | 0004 (built in `.worktrees/0004`: `packages/core/src/graph.ts`) | 0004 merged to `main`; the committed JSON Schema has an `$id` that names the version |
| D2 | **Identity is story-wide**: the same id is the same entity everywhere and persists until a State drops it, so an Element can be addressed by id, not by array index | 0005 (recorded in 0004's Revisions as deferred to 0005) | 0005 merged; a test in reebeat shows the same id across Scenes |
| D3 | **The committed story source is the IR JSON**; the Fountain reader is an importer, never the source | 0006 | 0006 merged; `stories/same-id` is committed as IR JSON and builds from it |
| D4 | **Exact time**: media time is exact flicks; frames are a render setting; the Plan is a function of the IR | 0004 (built), 0005 (media-time resolution) | every frame-rate preset resolves a story to within one frame of the others (0005's first falsifier, as 0004's Revisions record it); the editor shows media time, not frames, as the author's unit |
| D5 | **The compile is browser-safe**: `@reebeat/core`'s `planOf` and `schedule` run in a browser bundle (today `core` imports `fountain-js`, the importer's dependency; whether the compile path pulls it in is [INFERENCE] not yet checked) | reebeat, new, may be part of 0006 | a browser build of the compile path is in reebeat's tests |
| D6 | **The Deck page is seekable**: `window.reebeatDeck` offers a `seek(frame)` (today it offers `goToScene` and `stepFragment`; the seek layer that makes a frame independent of real time, `__reebeatSeek`, is injected by `capture-chromium` and is not part of the Deck) | reebeat, new | the Deck page, opened by hand, goes to any frame and shows what the Video shows at that frame |
| D7 | **The Deck generator is separable from the file system**: `renderDeck` is a pure function of the Plan, but `readAssets` reads reveal.js and Inter from the installed packages through `FileSystem` | reebeat, new | `assembleDeck` takes its assets as an argument, or a browser-side asset source exists |

Until D1 to D3 hold, the only things allowed in this repository are the shell, the toolchain and docs. D5 to D7 are new reebeat work that studio asks for; they are the first thing to ask reebeat for when this spec starts.

## The preview: compiled timeline in the browser, or a server-rendered video

The question: what does the person see when they scrub and when they edit?

| | A. In-browser Deck | B. Server-rendered Video | C. Hybrid (chosen) |
| --- | --- | --- | --- |
| What plays | the compiled timeline IR (reebeat's `plan.json` after `schedule`, a derived artifact that is never edited) rendered by the reveal.js Deck renderer into an iframe | `capture-chromium` frames, `ffmpeg`, an mp4 | A for the loop; B for the authoritative export |
| Latency of an edit | compile + render in the browser; budget set at M0 (a value to be measured, not assumed) | seconds to minutes per render, plus upload and download | A's |
| Scrub | frame-exact only if D6 holds: every animation in the Deck is CSS or Web Animations, so a seek layer can pause and set it (this is how the capture already gets frame-exact images) | only through a re-render or a downloaded video | A's |
| Fidelity | the **same page** the capture photographs, so equal to the Video frame if the browser and the seek layer match; differs where audio or a browser build differs | the reference | A is a preview; B is the truth |
| Cost to run | none for us: the user's browser | Chromium, ffmpeg and CPU minutes per render | A free, B paid |
| Works offline, with no account | yes | no | A yes |
| Narration | from the speech cache (`assetKey`) or the silent stand-in; synthesising needs Kokoro and whisper, which are not browser jobs | the same, on a server | as A and B |
| Determinism | `renderDeck` is pure; a seeked page is a function of the frame | reebeat's F6: two builds are byte for byte equal | both |

**Decision (proposed): C.** The edit loop uses A, because only A is free to run, immediate and offline, and the felt journey is a loop. The export and the review of a finished story use B, because it is the artifact reebeat guarantees. The risk of A is that "preview" diverges from "video"; the answer is a falsifier, not trust (F2): a frame of the preview equals the same frame of the Video, byte for byte, on the same Chromium build, for chosen frames of `stories/same-id`. If that holds, A is not an approximation of the Video, it is the Video's page. If it does not, the audited difference becomes part of the spec before anything is built on A.

The pipeline of A, as one Effect program with every outside call behind a service (Foldkit commands wrap it; `update` and `view` stay pure):

```text
story JSON ──decode (GraphSchema)──▶ Graph ──planOf──▶ Plan ──schedule (+ narration assets)──▶ Timeline IR
                                                                                         │
                                                 renderDeck (pure) + assets ◀────────────┘
                                                           │
                                       iframe (Mount: acquire on insert, release on removal)
                                                           │ seek(frame)   ◀── playhead (Model)
```

Lifetimes (skill `effect-ui-lifetimes`): the iframe is a Mount owned by the Preview region; playback is a Subscription that exists while the Model says "playing"; a compile is an interruptible Command keyed by the story revision, so a newer edit interrupts an older compile and a late result for an old revision is dropped by `update` (the stale-result policy is stated in the Model, not in arrival order).

## Editing: JSON Patch over the story IR

The edit is a **JSON Patch**; the same patch is what a person's UI action, an agent's tool call and (later) the sync server's replication unit all carry. One edit path, one validation, one undo.

What `effect` 4.1.0 gives, from its source (`node_modules/effect/src/JsonPatch.ts`, `@since 4.0.0`, `@stability stable`; there is **no** `ai-docs/src` example for it, so the source is the only installed guidance):

- `JsonPatch.get(old, new)`: a deterministic diff; `JsonPatch.apply(patch, doc)`: apply in order, never mutates its input.
- A **subset of RFC 6902**: only `add`, `remove` and `replace`; no `move`, `copy` or `test`. Paths are JSON Pointers. Arrays are addressed by index, and `get` detects no moves.
- `apply` **throws a plain `Error`** for an invalid pointer, a missing property or an out-of-bounds index; it validates nothing about the *meaning* of the result.

What that means for the protocol (each row is a decision):

| Gap | Decision |
| --- | --- |
| No `test`, so a patch has no precondition | Every edit carries `baseRevision` (the SHA-256 of the canonical JSON the patch was made against); the one writer applies a patch only when it equals the current revision, otherwise `Stale`. Concurrency is the writer's job, not the patch's |
| Array indices shift when another edit lands | Agents and the UI edit **by id**: tools like `set_property(elementId, property, value)` resolve the id to a pointer at the base revision (story-wide identity, D2). A raw `apply_patch` tool exists for tools that compute pointers themselves |
| `apply` throws an untyped `Error` | The editor wraps it once at the boundary (`Effect.try`) and maps it to a tagged `PatchRejected` error |
| `apply` does not validate | After `apply`, the result is **decoded with `GraphSchema`** (`Schema.decodeUnknownEffect`); a result that does not decode is `InvalidStory` with the decode issues. The Model keeps the old story |
| No `move` | A reorder is `remove` + `add`; the editor builds both as one atomic patch |
| Undo | The inverse of an applied patch is `JsonPatch.get(after, before)`, computed, not stored by hand |

### The agent tool protocol (open)

IR edits as tools, so a user can bring their own agent. **Likely MCP** (the operator's word); the tool definitions are the spec, the transport is a choice.

| Tool | Arguments | Result |
| --- | --- | --- |
| `read_story` | `storyId`, optional JSON Pointer | the JSON at that pointer and `revision` |
| `describe_schema` | none | the generated JSON Schema of the IR with its `origin` and `deviation` annotations (reebeat 0004 generates and commits it) |
| `plan_timing` | `storyId` | reebeat's `plan --timing` text: every effect with its anchor and resolved frame |
| `apply_patch` | `storyId`, `baseRevision`, `patch` (`add`, `remove`, `replace`) | `Applied { revision, patch }` or `Rejected { Stale, PatchRejected, InvalidStory }` |
| `set_property` | `storyId`, `baseRevision`, `elementId`, `property`, `value` | as `apply_patch` |
| `render_frame` | `storyId`, `frame` | a PNG of that frame (needs a browser: free where the agent runs locally, paid when hosted) |

Every tool returns the same typed errors the editor shows. The tools and their schemas are published with reebeat's open formats; a reference server over a local story file is part of the open core. **Not decided here:** the transport, authentication of a remote agent, and the tool set beyond the first edit (adding an Element, anchoring an effect).

## Where the free and the paid line falls

The rule: **free if it costs us nothing to run** (it runs in the user's browser or on the user's machine); **paid if we run something for them** (always-on infrastructure, inference, render minutes).

| Capability | Cost driver for us | Tier |
| --- | --- | --- |
| Open a story file, graph, timeline, scrub, edit one property, undo | none (the browser) | free |
| Validation, `plan_timing`, the in-browser Deck preview | none | free |
| The agent tool protocol and a reference server over a local file; **bring your own agent** | none | free (open) |
| Export a Deck or build a Video locally with reebeat's CLI | the user's machine | free (open) |
| Multiplayer sync server (presence, replicating patches between people) | always-on server, storage, egress | **paid** |
| Hosted AI agents (our agent, integrated with the editor) | model inference | **paid** |
| Cloud rendering (option B: Chromium and ffmpeg minutes) | CPU minutes | **paid** |
| Hosted speech synthesis, hosted asset storage, shared preview links, version history | per use | **ambiguous**, see Open questions |

The line is drawn by what is run, not by what is shown: the same tool protocol serves the free local agent and the paid hosted one. The sync approach itself (the choice between replicating patches through one writer and a merge-based scheme) is **its own spec**; this spec fixes only that the unit that is replicated is the patch.

## Falsifiers (each with a negative control; all gate the built journey, none exists yet)

| # | Falsifier | Negative control |
| --- | --- | --- |
| F1 | **The graph is the engine's graph.** For `stories/same-id`, the States and Beats the editor draws equal the ones reebeat's `plan --timing` lists (same ids, same count, same order) | delete a Beat from the editor's view model: the comparison fails and names it |
| F2 | **A preview frame is a Video frame.** For chosen frames of `stories/same-id` (the first, a mid-transition frame, a frame inside a `focus` ring, the last), the in-browser preview at `seek(frame)` equals the Video's frame, byte for byte after PNG decode, on the same Chromium build | change a lag in the seek layer by one frame: the mid-transition frame differs |
| F3 | **One edit, one patch, one visible change.** Setting an Element property changes the committed story JSON by exactly one `replace`, the preview shows the change at the same playhead, within the latency budget fixed at M0 | apply the patch to the wrong id: F1 or the one-patch comparison fails |
| F4 | **An invalid edit is refused and changes nothing.** A patch whose result does not decode is `InvalidStory`, a malformed pointer is `PatchRejected`, and the Model's story is byte for byte the one before | remove the decode after `apply`: the invalid story enters the Model and the test fails |
| F5 | **A stale edit is refused.** A patch whose `baseRevision` is not the current one is `Stale` | drop the revision check: two edits made against one revision both apply and the second is wrong |
| F6 | **The patch laws hold.** `apply(get(a, b), a)` equals `b`, and `apply(get(b, a), apply(get(a, b), a))` equals `a`, over stories generated from `GraphSchema` (Effect's `Arbitrary`), and for the inverse used by undo | a mutant of the inverse that drops the last operation fails the law |
| F7 | **An agent and a person make the same edit.** The same change through `set_property` and through the UI produces byte-identical story JSON and the same revision | make the tool apply a pointer of its own: the JSON differs |
| F8 | **The free journey needs no network.** With the network off (static assets served), F1 to F3 hold and the page makes no request but its own static files | add a `fetch` to a remote host in the preview path: the offline run fails |
| F9 | **Lifetimes.** Constructing and discarding every Command runs nothing; unmounting the Preview and disposing the runtime leaves no iframe, Subscription or in-flight compile; a late compile for an old revision never replaces a newer one | keep the iframe listener after unmount: the receipt does not complete |
| F10 | **The blockers are checked, not remembered.** A test (or a script gate) fails while the reebeat revision pinned by studio does not contain D1 to D3 | pin an older reebeat: the gate fails and names the missing row |

The latency budget of F3 is not given a number here: a number written before M0 would be a guess. M0 measures compile and render of `stories/same-id` on the machines studio targets and writes the budget into a Revisions entry before M1.

## Milestones (when unblocked)

| M | Work | Green means |
| --- | --- | --- |
| M0 | Measure: the compile and render time of `stories/same-id` in a browser; F2 on the four chosen frames (needs D5 to D7); the latency budget | F2; a number for F3 |
| M1 | Open and decode a story; graph and timeline views (read-only); the playhead and the seeked preview | F1, F2, F9 |
| M2 | The edit path: one property, `apply`, decode, revision, undo | F3, F4, F5, F6 |
| M3 | The tool protocol (reference server over a local file) | F7 |
| M4 | The offline gate and the blocker gate | F8, F10 |

## Non-goals

The multiplayer sync server, hosted agents and cloud rendering (named above for the line only); accounts, authorisation and teams; asset upload and a speech-synthesis service; editing the Fountain source (it is an importer in reebeat 0006, not the source); authoring attribute curves; adding, removing or re-anchoring effects in the first journey (one property of one Element only); any editing feature built before the blockers clear.

## Open questions for the operator

1. **Is Deck-as-preview enough?** The proposal is C (Deck for the loop, Video for export) with F2 as the proof that they agree. If F2 cannot hold, is a preview that differs from the Video in listed ways acceptable, or should the loop render server-side (then it is paid and not offline)?
2. **Where do a story's files live in the free tier?** The browser's File System Access API on a local folder (no server, Chromium-family browsers only) or studio-hosted storage (a server, so not free by the rule above)?
3. **Licence and visibility.** reebeat's open-core plan (its spec 0008, an open branch) puts closed-source products in separate private repositories; this repository is public with the licence undecided. Which of the two is studio, and does the first journey's code stay here?
4. **The ambiguous rows of the free/paid table** (hosted speech, hosted assets, shared preview links, version history): free allowance, paid, or out of scope.
5. **MCP.** The proposal is MCP for the tool protocol; confirm, or name the alternative.

## Revisions

Dated entries. This spec is frozen when its PR opens; later changes are entries here.

- **2026-10-29, plan written** as a design only, in the PR of spec 0000, against reebeat `main` `f7c3488` and the 0004 branch `a9afd4c` (still moving). Facts about `JsonPatch` are from the installed `effect` 4.1.0 source; facts about reebeat's IR and Deck renderer are from the 0004 worktree and are the ones most likely to change.
- **2026-10-29, lenses (operator direction).** The studio UI is organised by lenses, like DaVinci Resolve's pages. This spec's journey is stated as a subset of them (Goal section) and `docs/design/lenses.md` describes all ten, design only. No falsifier changes: F1 to F10 already cover the Story graph, the Timeline and the edit path.
- **2026-10-29, the replicated unit is not the patch (operator decisions; supersedes four statements above).** Collaboration is a merge-based keyed document with a validation gate in the sync server, using Loro behind the document port; the evidence is spec 0002, the collaboration spike ([PR #3](https://github.com/reebeat/studio/pull/3)). **The replicated unit is Loro's update. A JSON Patch only describes an edit** (for agents' tool calls, for review and proposals, for undo); it is not what peers exchange. Superseded: (1) "the same patch is what a person's UI action, an agent's tool call and (later) the sync server's replication unit all carry" (Editing, first paragraph): the UI action and the tool call still compile to one patch that describes the edit, and the sync server replicates the resulting Loro update; (2) "The sync approach itself ... this spec fixes only that the unit that is replicated is the patch" (free/paid section): the sync approach is spec 0002's, the unit is the Loro update; (3) the `baseRevision` and `Stale` rule of the protocol table applies to the single-writer free tier (a local file); in the synced case concurrent edits merge and the server's validation gate refuses a change set whose merge is not a valid IR, so `Stale` becomes a gate refusal (spec 0002 decides the wording and F5 is restated then); (4) "Multiplayer sync server (presence, replicating patches between people)" reads "replicating updates". What does not change: edits are by id, a patch is still validated by decoding the result with `GraphSchema`, `JsonPatch.get` still computes undo for the single-writer case, the free/paid line, F1 to F4 and F6 to F10. Spec 0002 also records that `JsonPatch.get` diffs arrays by position, so an inserted effect becomes many operations; that is a reason patches describe, and ids address.
