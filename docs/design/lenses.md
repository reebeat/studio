# Lenses: how the studio is organised

Status: **design only, nothing is built**. Date: 2026-10-29. Direction: the operator, 2026-10-29. This file is a design note, not a spec: it has no falsifiers and no PR of its own. Each lens becomes a spec (or part of one) when it is built, and [spec 0001](../specs/0001-first-felt-journey.md) builds a small subset.

## The idea

A story goes through phases: you write it, you lay out its scenes, you record the voice, you fine-tune the timing, you check it, you ship it. DaVinci Resolve organises its editor in "pages" (Media, Cut, Edit, Fusion, Color, Fairlight, Deliver), so that each page shows only what fits the phase of the work. Studio does the same with **lenses**. A lens is a way of looking at the same story. It is not a separate document, and switching lens never changes the story. All lenses read and write one story (the story IR from reebeat), and every change any lens makes is the same kind of edit: a JSON Patch (spec 0001).

Three things are always present, whatever the lens: the **preview** (the story playing at the playhead), the **playhead**, and the **agent panel** (lens 10).

Words used here are reebeat's (its `GLOSSARY.md`): a **State** is a set of Elements that holds for a while; a **Beat** is the change the engine generates from one State to the next; a **Scene** groups States; an **effect** (a sound, a `show`, a `focus`) subscribes to an event the engine generates, such as "the narrator says this word" or "this Element finishes moving".

## Free or paid

The rule is the open-core rule: a feature is **free** when it costs us nothing to run (it runs in the user's browser or on their machine), and **paid** when it costs us money to run (an always-on server, model inference, render minutes). The cost driver is named in each row. A lens can be free and still have a paid part: the table says which.

## The lenses

| # | Lens | Phase | Tier | Depends on (reebeat) |
| --- | --- | --- | --- | --- |
| 1 | Manuscript | reading and review of the text | free | 0006 (the IR is the source; Fountain becomes an output); a Fountain writer is new reebeat work, not yet numbered |
| 2 | Deck / Record | recording the narration | free to record and align on the user's machine; **paid** for hosted alignment or speech | 0005 (exact time, story-wide identity); narration pieces as effect targets are new reebeat work, not yet numbered |
| 3 | Story graph | laying out scenes, States and Beats | free | 0004 (machines, the IR), 0005 (story-wide identity), 0006 |
| 4 | Timeline | timing the story | free | 0004 (anchors and offsets), 0005 (exact time) |
| 5 | Wiring | understanding why something happens when it does | free | 0004 (event resolution, `plan --timing`, cycle lint), 0005 (the three clocks) |
| 6 | Review | comparing versions and accepting suggestions | free for one person and local agents; **paid** when the suggestions come from other people through the sync server or from hosted agents | 0006 (diffable JSON), 0005 (story-wide identity, so a diff can follow an Element); attribution is a studio spec |
| 7 | Coach | teaching lint | the lint is free (open); **guided fixes may be paid** (the operator's note on issue #8: a possible product tier) | reebeat issue #8 (a spec follows 0004 to 0006), 0005 (open semantic tags on Elements) |
| 8 | Languages | one story, several narration languages | free for the drift report; **paid** for hosted translation or speech | reebeat issue #10 (a spec follows 0004 to 0006) |
| 9 | Deliver | rendering and presenting | free for the Deck, present mode, local renders and receipts; **paid** for cloud rendering | release 1 (built: Deck, Video, `build.json`); aspect variants are new reebeat work, not yet numbered |
| 10 | Agent panel | across all lenses | free to bring your own agent; **paid** for hosted agents | the tool protocol of spec 0001 (JSON Patch over the IR); permission scopes are a studio spec |

### 1. Manuscript

A reading view of the screenplay, drawn from the IR as a Fountain document (reebeat's "artifact renderer": a one-way output, never read back). It answers "how does this read?" without the clutter of timing. It is read-only at first: the story is edited in the other lenses, and the manuscript shows the result. Free: it is text computed in the browser.

### 2. Deck / Record

Record the narration against the Deck, with a **teleprompter** that scrolls the Line to read. A Line can have several **takes**; the author picks the best one. A recording reaches the story in one of two ways:

- **Attached absolutely:** the whole take is one piece that starts where the Line starts.
- **Cut by word alignment:** the take is aligned to its words, cut into pieces, and each piece is tied to a beat lifecycle event through the same effects API every other effect uses ("start this piece when the Element arrives").

**The rule.** A narration piece does one of two things, never both in a loop:

- it **drives** timing: the Beats that follow wait for it to finish (the piece is long, so the State after it starts later); or
- it **follows** an event: it starts when some event happens, and nothing waits for it.

A cycle appears when a piece follows an event that itself waits for the same piece (for example a piece that starts when an Element arrives, while the Element arrives when that piece ends). A cycle has no answer, so the lint reebeat already runs on effect cycles (0004, falsifier F8) must cover narration pieces too, and the Wiring lens (5) shows the loop. Recording and aligning on the user's machine costs us nothing, so the lens is free; a hosted alignment or speech service is paid.

### 3. Story graph

States, Beats and Scenes drawn as a statechart map. This is where a person adds, removes or reorders scenes, States and Elements. The engine generates Beats from effects, so a Beat is shown but not drawn by hand: to change a Beat you change the effect that causes it. Spec 0001 builds a read-only version of this lens plus one property edit.

### 4. Timeline

The story in time: lanes for Elements and Lines, and the effects at their **resolved** times. The playhead scrubs the preview. **Dragging an effect to retime it writes back an offset from its anchor, not an absolute time.** An effect that was written "0.2 s after the word 'slides'" and is dragged 0.1 s later becomes "0.3 s after the word 'slides'"; the anchor stays. That keeps the story correct when the narration changes length, which an absolute time would not. If the author really wants an absolute time, reebeat already requires a written reason for it. Spec 0001 builds the read-only timeline and the scrub; the drag comes later.

### 5. Wiring

For each effect: which generated event it subscribes to, and a **trace of why it lands at frame N**: the anchor chain (this effect is 0.2 s after that event, which is the end of that Element's move, which is ...), then the media time in exact seconds, then the frame. An anchor that cannot be resolved, or that forms a cycle, appears here with the line it comes from. It is the lens for "why is this sound late?", and the place where the narration rule of lens 2 is checked visibly. It reads what reebeat's `plan --timing` already prints and adds the chain; the trace needs the three clocks of reebeat 0004 and 0005 to be real, not just printed.

### 6. Review

Two parts:

- **A semantic diff between two versions of a story**: not lines of JSON, but which States, Beats and timings changed, with the two renders side by side. Follows an Element across versions because identity is story-wide (0005).
- **Suggestion mode**: an edit proposed by an agent or a collaborator is not applied. It appears as a proposal with the name of who made it; a person accepts or rejects it. An accepted suggestion is applied as the same patch it was. The record of who proposed and who accepted is kept (attribution).

With one person and agents on their own machine, review is free. Suggestions from other people need the sync server, and suggestions from hosted agents cost inference, so those are paid.

### 7. Coach

Teaching lint: checks of an explainer against the multimedia-learning principles in reebeat issue #8 (temporal contiguity: an element appears close to the word that names it; signalling; redundancy; coherence). The checks run in reebeat's open compiler; the lens shows each finding on the timeline. Each threshold must come from its primary source before it is built (the issue says so). A guided fix (the editor proposes the edit) is a possible paid tier; the lint itself is free.

### 8. Languages

One story, several narration languages. A second language changes how long the narration is, and that moves everything anchored after it. The lens shows, per language, the narration and **timing drift**: which effects moved, and which cannot move by themselves because they use an absolute time (reebeat issue #10: lint lists those per language). Free to look at; hosted translation or speech is paid.

### 9. Deliver

Two outputs and a record:

- **Video**, with aspect variants (for example wide and vertical).
- **Deck and present mode**: the reveal.js page, shown full screen with the narration as speaker notes.
- **Build receipts**: the hashes of the story, the inputs, the adapters and the output, so that a render can be reproduced later and shown to be the same (reebeat already writes `build.json` and checks that two builds are byte for byte equal).

A render on the user's machine with the local reebeat CLI is free. Rendering in our cloud costs CPU minutes, so it is paid. The Deck and present mode run in the browser and are free.

### 10. Agent panel

Present in every lens. A person brings their own agent (through the tool protocol of spec 0001) or uses a hosted one. Each agent has a **permission scope**:

| Scope | What the agent may do |
| --- | --- |
| read | read the story, the schema and the timing |
| suggest | propose edits that wait for a person (lens 6) |
| apply | make edits directly |

The scope is set per agent and can differ per lens (for example "suggest" in the Timeline, "read" in Deliver). The tool protocol and its tools are open; hosted agents are paid because they cost inference.

## What spec 0001 uses

Spec 0001 builds a subset: **Story graph** (read-only graph, plus one Element property edited in the inspector), **Timeline** (read-only, with the scrub), the always-present **preview** and playhead, and the edit path and tool protocol that the **Agent panel** will sit on. It builds no other lens, no lens switcher and no permission scopes. The placeholder shell of spec 0000 shows four regions, not lenses; a lens switcher is added by the first spec that has two lenses to switch between.

## What this note does not decide

- The order in which lenses are built after 0001.
- Whether lens state (for example the playhead) is shared between collaborators; that belongs to the sync spec.
- The look of a lens. Foldkit Submodels are the likely shape (one per lens, each with its own Model and Messages) and are not settled here.
