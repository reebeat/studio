// The Plan contract (`plan.json`) of spec 0001, section "The Plan contract", as changed by spec 0002 (Revisions,
// "plan contract for effects"). This file is the authority; the spec sections are its summary. A change here is a
// dated Revision in the spec. The closed vocabularies (cells, classes, sounds, verbs, edges, events, units) live
// here; `grammar.ts` derives the syntax of the source from them.
// The schemas are named `...Schema`; the types derived from them carry the contract's names.
import { Schema } from "effect";

import {
  elementEvents,
  stateEventNames,
  stateNames,
  transitionNames,
} from "./machines.ts";
import { maxSpeed, minSpeed } from "./speed.ts";

/** The nine cells of the Element grid, in reading order. */
export const cells = [
  "tl",
  "tc",
  "tr",
  "ml",
  "mc",
  "mr",
  "bl",
  "bc",
  "br",
] as const;

/** The classes of the fixed theme (`packages/render-reveal`). */
export const elementClasses = [
  "box",
  "title",
  "label",
  "accent",
  "muted",
] as const;

/** The built-in sound catalogue (synthesised in TypeScript by `@reebeat/sounds-synth`); the one list of sound names. */
export const sfxNames = ["pop", "whoosh", "ding"] as const;

export type SfxName = (typeof sfxNames)[number];

/** What an effect does (spec 0002, "Non-goals": more kinds are a later spec against the same grammar). */
export const verbs = ["sound", "show", "focus"] as const;

/** The two ends of a window. */
export const edges = ["start", "end"] as const;

/**
 * The lifecycle events of an Element of a Scene: the transitions of its machines (`machines.ts`), which are the one
 * place that names them.
 */
export { elementEvents } from "./machines.ts";

/** The units of an offset; `s` and `ms` are accepted in the source and stored as `flicks`; `%` is stored as `percent`. */
export const offsetUnits = ["flicks", "f", "percent"] as const;

/** The identifiers Scenes, Elements and effects share: a letter, then letters, digits, `_` and `-`. */
export const idPattern = /^[A-Za-z][A-Za-z0-9_-]*$/u;

const Id = Schema.NonEmptyString;

/** A 1-based line of the `.fountain` source. */
const SourceLine = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1));
const Frame = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const Milliseconds = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

/** An exact time: a whole number of flicks (1/705,600,000 s), never a float and never a frame. */
const Flicks = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const Seconds = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0));

/** A speech rate: a multiple of the voice's natural speed (`packages/core/src/speed.ts`). */
export const SpeedSchema = Schema.Finite.check(
  Schema.isBetween({ maximum: maxSpeed, minimum: minSpeed })
);

export const CellSchema = Schema.Literals(cells);
export const ElementClassSchema = Schema.Literals(elementClasses);
export const SfxNameSchema = Schema.Literals(sfxNames);

/**
 * The name of a cached narration file: a SHA-256 cache key and `.flac`, as the speech cache writes it. A plain
 * file name, never a path: no separator, no `..`, nothing absolute, so a Plan cannot point a reader elsewhere.
 */
export const AudioFileSchema = Schema.String.check(
  Schema.isPattern(/^[0-9a-f]{64}\.flac$/u)
);

/** The properties an identity diff compares. */
export const ElementChangeSchema = Schema.Literals(["cell", "class", "text"]);

/** The frame rates a render can be set to: the nominal rate, and whether it is the NTSC rate (nominal x 1000/1001). */
export const fpsPresets = [24, 25, 30, 50, 60] as const;

export const SettingsSchema = Schema.Struct({
  /** The nominal output frame rate; the exact rate is `fps` x 1000/1001 when `ntsc` is true (24000/1001, 30000/1001). */
  fps: Schema.Literals(fpsPresets),
  height: Schema.Literal(720),
  lineGap: Seconds,
  /** True: the rate is the NTSC fraction of `fps`. */
  ntsc: Schema.Boolean,
  sceneLead: Seconds,
  sceneTail: Seconds,
  /** The story's default speech rate (`Speed:` of the title page, 1.1 when absent). */
  speed: SpeedSchema,
  transition: Seconds,
  voice: Schema.Literal("af_heart"),
  width: Schema.Literal(1280),
});

export const ChapterSchema = Schema.Struct({
  id: Id,
  line: SourceLine,
  sceneIds: Schema.Array(Id),
  /** The text of the `= synopsis` lines under the Section, joined by a space; only `plan` shows it. */
  synopsis: Schema.optionalKey(Schema.String),
  title: Schema.String,
});

export const ElementSchema = Schema.Struct({
  cell: CellSchema,
  class: ElementClassSchema,
  id: Id,
  line: SourceLine,
  text: Schema.String,
  /** False: the Element starts hidden and a `show` effect reveals it. */
  visible: Schema.Boolean,
});

export const EdgeSchema = Schema.Literals(edges);
export const VerbSchema = Schema.Literals(verbs);
export const ElementEventSchema = Schema.Literals(elementEvents);

const Percent = Schema.Finite.check(
  Schema.isBetween({ maximum: 100, minimum: 0 })
);

/** An edge of a window, or N percent of the way through it. */
export const PointSchema = Schema.Union([
  EdgeSchema,
  Schema.Struct({ percent: Percent }),
]);

/** Who an anchor is about: an Element or an effect by id, the Scene, or a Beat of the Scene by number. */
export const SubjectSchema = Schema.Union([
  Schema.Struct({ id: Id, kind: Schema.Literal("element") }),
  Schema.Struct({ id: Id, kind: Schema.Literal("effect") }),
  Schema.Struct({ kind: Schema.Literal("scene") }),
  Schema.Struct({
    kind: Schema.Literal("state"),
    n: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  }),
  Schema.Struct({
    kind: Schema.Literal("beat"),
    n: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  }),
]);

/**
 * The moment an anchor names. Three kinds, generated from the machines of `machines.ts` (spec 0004): a word of the
 * narration (the one source that is not a machine), an `edge` (a point of a transition of a machine: its start, its
 * end or N percent of the way, which is the threshold event of its progress behaviour) and a `state` event (the first
 * frame a machine enters or leaves a state). Every kind resolves to a frame, and the kinds with a window also resolve
 * to an end frame, which percent points and percent offsets use.
 */
export const AnchorSchema = Schema.Union([
  /**
   * A word or phrase of this Scene's narration; `occurrence` is 1-based; `explicit` is present when the author wrote
   * the occurrence (only then may a phrase that occurs more than once be named). `start` and `end` are word times.
   */
  Schema.Struct({
    edge: EdgeSchema,
    explicit: Schema.Boolean,
    kind: Schema.Literal("word"),
    occurrence: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
    phrase: Schema.NonEmptyString,
  }),
  /** A point of a transition of a machine of the subject (`one.move.start`, `transition.50%`, `r1.end`). */
  Schema.Struct({
    at: PointSchema,
    kind: Schema.Literal("edge"),
    subject: SubjectSchema,
    transition: Schema.Literals(transitionNames),
  }),
  /** The first frame a machine of the subject enters or leaves a state (`one.moving.leave`, `state(2).enter`). */
  Schema.Struct({
    event: Schema.Literals(stateEventNames),
    kind: Schema.Literal("occupancy"),
    state: Schema.Literals(stateNames),
    subject: SubjectSchema,
  }),
]);

/**
 * A signed offset from the anchor: a time in `flicks` (exact; 1/705,600,000 s), `f` output frames at the Plan's rate,
 * or `percent` of the anchored window (only with an anchor that has a window). `schedule` turns flicks into frames
 * with one rule (`time.ts`) and rounds a percent of a window to a frame.
 */
export const OffsetSchema = Schema.Union([
  Schema.Struct({
    unit: Schema.Literals(["flicks", "f"]),
    value: Schema.Finite,
  }),
  Schema.Struct({ unit: Schema.Literal("percent"), value: Schema.Finite }),
]);

/** A length of time that is never a share of a window: `throttle=` and `stagger=`. */
export const DurationSchema = Schema.Struct({
  unit: Schema.Literals(["flicks", "f"]),
  value: Schema.Finite.check(Schema.isGreaterThan(0)),
});

export type Duration = typeof DurationSchema.Type;

/**
 * An event of the Scene: a list of frames, built from sources and combinators (spec 0004). `ref` is a name a `let` line
 * declared. `all` happens when every operand has (SMIL `endsync=all`), `first` at the earliest of them, `each` at every
 * occurrence of every operand (a begin-value list) and may thin them with `throttle` or space them with `stagger`;
 * `within` keeps the occurrences inside a Beat; `shift` moves every occurrence by an offset.
 */
export type EventExpr =
  | { readonly anchor: typeof AnchorSchema.Type; readonly kind: "anchor" }
  | { readonly kind: "ref"; readonly name: string }
  | { readonly kind: "all"; readonly of: readonly EventExpr[] }
  | { readonly kind: "first"; readonly of: readonly EventExpr[] }
  | {
      readonly kind: "each";
      readonly of: readonly EventExpr[];
      readonly stagger: Duration | null;
      readonly throttle: Duration | null;
    }
  | { readonly kind: "within"; readonly of: EventExpr; readonly state: number }
  | {
      readonly kind: "shift";
      readonly of: EventExpr;
      readonly offset: typeof OffsetSchema.Type;
    };

export const EventExprSchema: Schema.Codec<EventExpr> = Schema.Union([
  Schema.Struct({ anchor: AnchorSchema, kind: Schema.Literal("anchor") }),
  Schema.Struct({ kind: Schema.Literal("ref"), name: Id }),
  Schema.Struct({
    kind: Schema.Literal("all"),
    of: Schema.Array(
      Schema.suspend((): Schema.Codec<EventExpr> => EventExprSchema)
    ),
  }),
  Schema.Struct({
    kind: Schema.Literal("first"),
    of: Schema.Array(
      Schema.suspend((): Schema.Codec<EventExpr> => EventExprSchema)
    ),
  }),
  Schema.Struct({
    kind: Schema.Literal("each"),
    of: Schema.Array(
      Schema.suspend((): Schema.Codec<EventExpr> => EventExprSchema)
    ),
    stagger: Schema.NullOr(DurationSchema),
    throttle: Schema.NullOr(DurationSchema),
  }),
  Schema.Struct({
    kind: Schema.Literal("within"),
    of: Schema.suspend((): Schema.Codec<EventExpr> => EventExprSchema),
    state: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  }),
  Schema.Struct({
    kind: Schema.Literal("shift"),
    of: Schema.suspend((): Schema.Codec<EventExpr> => EventExprSchema),
    offset: OffsetSchema,
  }),
]);

/** What the author wrote for the timing of an effect (intent); the Timeline holds the resolved frames. */
export const WhenSchema = Schema.Union([
  Schema.Struct({ event: EventExprSchema }),
  /** Absolute and Scene-relative: flicks after the slide change; the reason is mandatory and listed by lint. */
  Schema.Struct({
    absoluteFlicks: Flicks,
    reason: Schema.NonEmptyString,
  }),
]);

/** `until <event>`: the SMIL end value of an effect with a duration, and the text the author wrote for it. */
export const UntilSchema = Schema.Struct({
  event: EventExprSchema,
  written: Schema.NonEmptyString,
});

export const EffectSchema = Schema.Struct({
  id: Id,
  line: SourceLine,
  /** `sound`: the catalogue name; absent for `show` and `focus`. */
  name: Schema.optionalKey(SfxNameSchema),
  /** `show` and `focus`: an Element id of this Scene; absent for `sound`. */
  target: Schema.optionalKey(Id),
  /** `focus` only: the event that ends the ring. Without it the ring lasts to the end of the Scene. */
  until: Schema.optionalKey(UntilSchema),
  verb: VerbSchema,
  when: WhenSchema,
  /**
   * The `when` exactly as the author wrote it after `at` (whitespace collapsed): `word("box", 1).end +0.1s`. The
   * review text and the Timeline `intent` print it back; `when` is its parsed meaning.
   */
  written: Schema.NonEmptyString,
});

/** A derived event: `let <name> = <event>`, local to its Scene and evaluated once. */
export const DerivedEventSchema = Schema.Struct({
  event: EventExprSchema,
  line: SourceLine,
  name: Id,
  /** The event as the author wrote it after `=` (whitespace collapsed). */
  written: Schema.NonEmptyString,
});

/**
 * What a renderer declares about its slide change, in milliseconds and frames (plain data: the renderer's adapter
 * publishes it as `info.lifecycle`, `schedule` reads it, `verify` observes it). Windows, all from the Scene's
 * `slideFrame` s (`window end` = `s + round(fps * transitionMs[transition] / 1000)`; 0 ms is an instant):
 *
 * | Event | start | end |
 * | --- | --- | --- |
 * | `transition.*` | `s` | window end |
 * | matched Element `move` and `update` (Auto-Animate) | `s + matched.startLagFrames` | window end |
 * | unmatched `enter` (Auto-Animate) | `s + unmatched.enter.startLagFrames` | `s + unmatched.enter.endLagFrames` (equal: an instant) |
 * | `exit` (Auto-Animate) | `s` | = start (instant) |
 * | `enter` of every visible Element of a `default` or `cut` Scene | `s` | window end (instant for `cut`) |
 * | `enter` of an Element revealed by a `show` effect | the effect's fire frame | + `round(fps * showMs / 1000)` |
 *
 * Percent points of a matched Element's `move` and `update` are in PROGRESS: `N%` is the frame at which the eased
 * progress of the window reaches N percent, where `matched.easing` is the CSS cubic-bezier `[x1, y1, x2, y2]` of
 * the animation (reveal.js: `ease` = 0.25, 0.1, 0.25, 1). Every other percent point (`transition.N%`, a `show`
 * enter) and every percent OFFSET is linear in TIME between start and end. An event whose start equals its end has
 * no window, so a percent point or percent offset on it is an error. `transitionMs["auto-animate"]` must equal
 * `settings.transition * 1000` (the Plan's transition is the renderer's instruction; `schedule` rejects a
 * disagreement).
 */
export const RendererLifecycleSchema = Schema.Struct({
  matched: Schema.Struct({
    easing: Schema.Tuple([
      Schema.Finite.check(Schema.isBetween({ maximum: 1, minimum: 0 })),
      Schema.Finite,
      Schema.Finite.check(Schema.isBetween({ maximum: 1, minimum: 0 })),
      Schema.Finite,
    ]),
    /** The frames, at `measuredFps`, from the slide change to the first frame the matched Element differs. */
    startLagFrames: Frame,
  }),
  /**
   * The frame rate the lags below were measured at. A lag is a TIME (lag frames over this rate) that `schedule` turns
   * into frames at the Plan's own rate, so one declaration serves every frame rate.
   */
  measuredFps: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  showMs: Milliseconds,
  transitionMs: Schema.Struct({
    "auto-animate": Milliseconds,
    cut: Milliseconds,
    default: Milliseconds,
  }),
  unmatched: Schema.Struct({
    enter: Schema.Struct({ endLagFrames: Frame, startLagFrames: Frame }),
  }),
});

export const LineSchema = Schema.Struct({
  hints: Schema.Struct({ pauseBefore: Seconds, speed: SpeedSchema }),
  id: Id,
  line: SourceLine,
  /** The narration text: the dialogue, whitespace collapsed (dialogue has no notes). */
  text: Schema.String,
  /** `text` split on single spaces. */
  words: Schema.Array(Schema.String),
});

export const IdentitySchema = Schema.Struct({
  enter: Schema.Array(Id),
  exit: Schema.Array(Id),
  same: Schema.Array(Id),
  update: Schema.Array(
    Schema.Struct({ changes: Schema.Array(ElementChangeSchema), id: Id })
  ),
});

export const SceneSchema = Schema.Struct({
  chapterId: Id,
  /** The Scene's `[[effects]]` block in source order (empty without a block). */
  effects: Schema.Array(EffectSchema),
  elements: Schema.Array(ElementSchema),
  /** The Scene's `let` lines in source order: the derived events its effects and its other lets may name. */
  events: Schema.Array(DerivedEventSchema),
  heading: Schema.String,
  /** The author's `#id#` of the scene heading, unique in the story. */
  id: Id,
  /** Versus the previous Scene; only when `transition` is `auto-animate`. */
  identity: Schema.NullOr(IdentitySchema),
  line: SourceLine,
  lines: Schema.Array(LineSchema),
  /** The transition INTO this Scene. */
  transition: Schema.Literals(["auto-animate", "cut", "default"]),
});

export const TimedWordSchema = Schema.Struct({
  endFrame: Frame,
  endMs: Milliseconds,
  startFrame: Frame,
  startMs: Milliseconds,
  w: Schema.String,
});

export const TimedEffectSchema = Schema.Struct({
  /**
   * The frame at which the capture (the `FrameCapturer` service) issues the effect's command: `fireFrame - 1` for
   * `show` and `focus`, `fireFrame` for `sound` (an anchor at the transition start has command = fire = the Scene's
   * `slideFrame`). Scene changes are not effects: the capture commands them itself from the Scene's `slideFrame`, an
   * Auto-Animate or cut at `slideFrame` (lag 0) and a default fade one frame earlier.
   */
  commandFrame: Frame,
  effectId: Id,
  /**
   * Only a `focus` that ends by its own `until` before the Scene does: the frame at which the capture commands the ring
   * off (an end step of the Deck, `stepsOf`).
   */
  endCommandFrame: Schema.NullOr(Frame),
  /** The last frame of the effect's window: a `show`'s fade, a `focus`'s ring. Absent for a `sound`. */
  endFrame: Schema.NullOr(Frame),
  /**
   * How the effect's window ended: `until` (its own end event), `slide-change` (the Scene ended while it ran: the slide
   * change interrupts every running effect) or `window` (a `show` runs its declared fade). Absent for a `sound`, which
   * has no window.
   */
  endedBy: Schema.NullOr(Schema.Literals(["until", "slide-change", "window"])),
  /** The resolved frame of the effect: anchor frame plus offset, always inside the Scene. It is not when the capture commands it: see `commandFrame`. */
  fireFrame: Frame,
  /** 1-based: an effect whose `at` event has several occurrences (`each`) runs once per occurrence, in time order. */
  instance: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  /** What the author wrote for the timing, as the review text prints it, e.g. `word("matches").end +100ms`. */
  intent: Schema.String,
});

/** A derived event with the frames it resolved to. */
export const TimedEventSchema = Schema.Struct({
  frames: Schema.Array(Frame),
  name: Id,
  written: Schema.String,
});

export const TimedLineSchema = Schema.Struct({
  audio: Schema.Struct({ file: AudioFileSchema, sha256: Schema.String }),
  endFrame: Frame,
  lineId: Id,
  startFrame: Frame,
  words: Schema.Array(TimedWordSchema),
});

export const TimedSceneSchema = Schema.Struct({
  /** The Scene's effects, one entry per instance, in resolved time order (ties keep source order). */
  effects: Schema.Array(TimedEffectSchema),
  endFrame: Frame,
  /** The Scene's derived events (`let`) in source order, with their frames. */
  events: Schema.Array(TimedEventSchema),
  lines: Schema.Array(TimedLineSchema),
  sceneId: Id,
  /** The frame at which the slide change is shown. */
  slideFrame: Frame,
});

export const TimelineSchema = Schema.Struct({
  chapters: Schema.Array(Schema.Struct({ chapterId: Id, startFrame: Frame })),
  scenes: Schema.Array(TimedSceneSchema),
  totalFrames: Frame,
});

export const PlanJsonSchema = Schema.Struct({
  author: Schema.optionalKey(Schema.String),
  chapters: Schema.Array(ChapterSchema),
  scenes: Schema.Array(SceneSchema),
  schema: Schema.Literal(1),
  settings: SettingsSchema,
  /** SHA-256 of the UTF-8 bytes of the `.fountain` source; every output embeds it. */
  sourceSha256: Schema.String,
  /** Added by `schedule` once speech exists; absent in `plan` output. */
  timeline: Schema.optionalKey(TimelineSchema),
  title: Schema.String,
});

export type Settings = typeof SettingsSchema.Type;

export type Chapter = typeof ChapterSchema.Type;

export type Element = typeof ElementSchema.Type;

export type Effect = typeof EffectSchema.Type;

export type Verb = typeof VerbSchema.Type;

export type Edge = typeof EdgeSchema.Type;

export type ElementEvent = typeof ElementEventSchema.Type;

export type Point = typeof PointSchema.Type;

export type Anchor = typeof AnchorSchema.Type;

export type Offset = typeof OffsetSchema.Type;

export type When = typeof WhenSchema.Type;

export type RendererLifecycle = typeof RendererLifecycleSchema.Type;

/**
 * A sane declaration for tests and examples, not any adapter's measurement: Auto-Animate 800 ms (24 frames at 30 fps),
 * a default fade 400 ms, a cut instant, matched Elements start 2 frames in and ease like CSS `ease`, an unmatched
 * Element fades in over frames 8 to 22, and a `show` lasts 133 ms (4 frames).
 */
export const referenceLifecycle: RendererLifecycle = {
  matched: { easing: [0.25, 0.1, 0.25, 1], startLagFrames: 2 },
  measuredFps: 30,
  showMs: 133,
  transitionMs: { "auto-animate": 800, cut: 0, default: 400 },
  unmatched: { enter: { endLagFrames: 22, startLagFrames: 8 } },
};

export type Line = typeof LineSchema.Type;

export type Identity = typeof IdentitySchema.Type;

export type Scene = typeof SceneSchema.Type;

export type TimedWord = typeof TimedWordSchema.Type;

export type TimedEffect = typeof TimedEffectSchema.Type;

export type TimedLine = typeof TimedLineSchema.Type;

export type TimedScene = typeof TimedSceneSchema.Type;

export type Timeline = typeof TimelineSchema.Type;

export type PlanJson = typeof PlanJsonSchema.Type;

const planJson = Schema.fromJsonString(PlanJsonSchema, { space: 2 });
const decodeJson = Schema.decodeUnknownEffect(planJson);
const encodeJson = Schema.encodeEffect(planJson);

/** Decodes the text of a `plan.json`. Every deck, video and check reads the Plan through this function. */
export const decodePlan = (json: string) => decodeJson(json);

/**
 * Encodes a Plan as JSON text (two-space indent, keys in alphabetical order, no trailing newline), so equal
 * Plans serialise to equal bytes.
 */
export const encodePlan = (plan: PlanJson) => encodeJson(plan);

export type Subject = typeof SubjectSchema.Type;

export type Until = typeof UntilSchema.Type;

export type DerivedEvent = typeof DerivedEventSchema.Type;

export type TimedEvent = typeof TimedEventSchema.Type;
