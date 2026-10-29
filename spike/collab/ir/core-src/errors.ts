import { Schema } from "effect";

// Every expected failure of the Plan stage names the 1-based source line it concerns and says what is wrong: what
// was found, what was expected and, when there is a nearest valid form, `did you mean` (spec 0002, F2).
const located = { line: Schema.Int, message: Schema.String };

/** Dual dialogue, centred text, page breaks, lyrics, a character other than NARRATOR, and the like. */
export class UnsupportedElement extends Schema.TaggedError<
  UnsupportedElement,
  { readonly brand: unique symbol }
>()("UnsupportedElement", located) {}

/** Two Elements, Scenes or effects of one scope share an id. */
export class DuplicateId extends Schema.TaggedError<
  DuplicateId,
  { readonly brand: unique symbol }
>()("DuplicateId", located) {}

/** An Element line without `id=`. */
export class MissingId extends Schema.TaggedError<
  MissingId,
  { readonly brand: unique symbol }
>()("MissingId", located) {}

/** An Element property that is unknown, repeated, missing or has a value outside its closed set. */
export class BadProperty extends Schema.TaggedError<
  BadProperty,
  { readonly brand: unique symbol }
>()("BadProperty", located) {}

/** A Scene heading without a valid `#id#`. */
export class BadSceneId extends Schema.TaggedError<
  BadSceneId,
  { readonly brand: unique symbol }
>()("BadSceneId", located) {}

/** A release-1 form (`[[next]]`, `[[focus: id]]`, `[[sfx: name]]`, a note in dialogue, `{#id @cell .class hidden}`). */
export class ReleaseOneForm extends Schema.TaggedError<
  ReleaseOneForm,
  { readonly brand: unique symbol }
>()("ReleaseOneForm", located) {}

/** An `[[effects]]` block that is misplaced, repeated, unclosed or has a blank line inside. */
export class BadEffectsBlock extends Schema.TaggedError<
  BadEffectsBlock,
  { readonly brand: unique symbol }
>()("BadEffectsBlock", located) {}

/** A line of an `[[effects]]` block that does not follow the line grammar (verb, event, edge, unit, offset...). */
export class BadEffect extends Schema.TaggedError<
  BadEffect,
  { readonly brand: unique symbol }
>()("BadEffect", located) {}

/** An absolute time (`at 12.5s`) without `because "<reason>"`. */
export class AbsoluteNeedsReason extends Schema.TaggedError<
  AbsoluteNeedsReason,
  { readonly brand: unique symbol }
>()("AbsoluteNeedsReason", located) {}

/** A reference to an Element, effect, word or phrase that this Scene does not have. */
export class UnknownReference extends Schema.TaggedError<
  UnknownReference,
  { readonly brand: unique symbol }
>()("UnknownReference", located) {}

/** An Element event that does not happen in this Scene (`move` of an Element that does not change cell). */
export class NoSuchEvent extends Schema.TaggedError<
  NoSuchEvent,
  { readonly brand: unique symbol }
>()("NoSuchEvent", located) {}

/** A `word("...")` phrase that occurs more than once in the Scene, with no occurrence number. */
export class AmbiguousWord extends Schema.TaggedError<
  AmbiguousWord,
  { readonly brand: unique symbol }
>()("AmbiguousWord", located) {}

/** Effects that wait for each other. */
export class EffectCycle extends Schema.TaggedError<
  EffectCycle,
  { readonly brand: unique symbol }
>()("EffectCycle", located) {}

/** A percent point or percent offset on an anchor that has no window. */
export class BadPercent extends Schema.TaggedError<
  BadPercent,
  { readonly brand: unique symbol }
>()("BadPercent", located) {}

/** `show` of an Element that is not `visible=false`, or a second `show` of one Element. */
export class BadShow extends Schema.TaggedError<
  BadShow,
  { readonly brand: unique symbol }
>()("BadShow", located) {}

/** A `visible=false` Element that no `show` effect of its Scene reveals. */
export class HiddenNeverRevealed extends Schema.TaggedError<
  HiddenNeverRevealed,
  { readonly brand: unique symbol }
>()("HiddenNeverRevealed", located) {}

/** A Parenthetical other than `(slowly)`, `(quickly)` and `(pause N)`, or one with no dialogue after it. */
export class BadParenthetical extends Schema.TaggedError<
  BadParenthetical,
  { readonly brand: unique symbol }
>()("BadParenthetical", located) {}

/** `Speed:` or `(speed N)` with a value that is not a number from 0.5 to 2, or a second `Speed:` title key. */
export class BadSpeed extends Schema.TaggedError<
  BadSpeed,
  { readonly brand: unique symbol }
>()("BadSpeed", located) {}

/** A transition other than `> AUTO-ANIMATE` and `> CUT`, or one that does not lead into a Scene. */
export class BadTransition extends Schema.TaggedError<
  BadTransition,
  { readonly brand: unique symbol }
>()("BadTransition", located) {}

/** A `sound` effect with a name outside the built-in catalogue. */
export class UnknownSfx extends Schema.TaggedError<
  UnknownSfx,
  { readonly brand: unique symbol }
>()("UnknownSfx", located) {}

/** `*` or `_` in dialogue, so that narration, subtitle and notes text stay one string. */
export class EmphasisInDialogue extends Schema.TaggedError<
  EmphasisInDialogue,
  { readonly brand: unique symbol }
>()("EmphasisInDialogue", located) {}

/** The first Scene is not preceded by a `# Section`. */
export class SceneBeforeSection extends Schema.TaggedError<
  SceneBeforeSection,
  { readonly brand: unique symbol }
>()("SceneBeforeSection", located) {}

/** The source has no Scene. */
export class EmptyStory extends Schema.TaggedError<
  EmptyStory,
  { readonly brand: unique symbol }
>()("EmptyStory", located) {}

/** `.end` of a `sound` or a `focus`, which have no window (only a `show` has one). */
export class UnsupportedEdge extends Schema.TaggedError<
  UnsupportedEdge,
  { readonly brand: unique symbol }
>()("UnsupportedEdge", located) {}

const planErrors = {
  AbsoluteNeedsReason,
  AmbiguousWord,
  BadEffect,
  BadEffectsBlock,
  BadParenthetical,
  BadPercent,
  BadProperty,
  BadSceneId,
  BadShow,
  BadSpeed,
  BadTransition,
  DuplicateId,
  EffectCycle,
  EmphasisInDialogue,
  EmptyStory,
  HiddenNeverRevealed,
  MissingId,
  NoSuchEvent,
  ReleaseOneForm,
  SceneBeforeSection,
  UnknownReference,
  UnknownSfx,
  UnsupportedEdge,
  UnsupportedElement,
} as const;

export type PlanErrorTag = keyof typeof planErrors;

/** Everything `buildPlan` can fail with. */
export type PlanError = InstanceType<(typeof planErrors)[PlanErrorTag]>;

/** Makes the Plan error with the given tag. */
export const planError = (
  tag: PlanErrorTag,
  line: number,
  message: string
): PlanError => new planErrors[tag]({ line, message });

/** A Line's aligned words do not match the Line. */
export class AlignmentMismatch extends Schema.TaggedError<
  AlignmentMismatch,
  { readonly brand: unique symbol }
>()("AlignmentMismatch", { lineId: Schema.String, message: Schema.String }) {}

/** `settings.sceneLead` is shorter than `settings.transition`: the first Line would start inside the transition. */
export class SceneLeadTooShort extends Schema.TaggedError<
  SceneLeadTooShort,
  { readonly brand: unique symbol }
>()("SceneLeadTooShort", {
  message: Schema.String,
  sceneLead: Schema.Finite,
  transition: Schema.Finite,
}) {}

/** An effect resolves to a frame outside its Scene (or its command would fall before the slide change). */
export class EffectOutsideScene extends Schema.TaggedError<
  EffectOutsideScene,
  { readonly brand: unique symbol }
>()("EffectOutsideScene", {
  effectId: Schema.String,
  message: Schema.String,
  sceneId: Schema.String,
}) {}

/** An effect anchors to a window the renderer's declared lifecycle makes empty (a percent on an instant). */
export class EmptyWindow extends Schema.TaggedError<
  EmptyWindow,
  { readonly brand: unique symbol }
>()("EmptyWindow", {
  effectId: Schema.String,
  message: Schema.String,
  sceneId: Schema.String,
}) {}

/** The renderer's declared lifecycle disagrees with the Plan (`transitionMs["auto-animate"]` vs `settings.transition`). */
export class LifecycleMismatch extends Schema.TaggedError<
  LifecycleMismatch,
  { readonly brand: unique symbol }
>()("LifecycleMismatch", { message: Schema.String }) {}

/** An anchor of a hand-made or stale Plan that does not resolve (a word the narration lacks, a missing effect, a cycle). */
export class UnresolvedAnchor extends Schema.TaggedError<
  UnresolvedAnchor,
  { readonly brand: unique symbol }
>()("UnresolvedAnchor", {
  effectId: Schema.String,
  message: Schema.String,
  sceneId: Schema.String,
}) {}

/** Everything `schedule` can fail with. */
export type ScheduleError =
  | AlignmentMismatch
  | SceneLeadTooShort
  | EffectOutsideScene
  | EmptyWindow
  | LifecycleMismatch
  | UnresolvedAnchor;

/** The Plan has no Timeline, or its Timeline names a Scene, Line or effect the Plan does not have. */
export class PlanNotScheduled extends Schema.TaggedError<
  PlanNotScheduled,
  { readonly brand: unique symbol }
>()("PlanNotScheduled", { message: Schema.String }) {}
