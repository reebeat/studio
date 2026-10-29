// How a Rendering carries the effects of a Scene (spec 0002, Revisions, "plan contract for effects"; spec 0004): `show`
// and `focus` are fragment steps in resolved-time order, and a `focus` that ends by its own `until` before the Scene
// does has a second step, its END, that takes the ring off; a `sound` is not a step: it rides along with the step or the
// slide it is anchored to, and plays with it, once for each instance. This file is the one place that says which. A
// renderer and the verifier both read it, so the Deck and the check cannot disagree. Plain functions.
import { Array as Arr, Option, Order } from "effect";

import { anchorsOf, refsOf } from "./evaluate.ts";
import { isStep } from "./events.ts";
import type {
  Effect,
  EventExpr,
  PlanJson,
  Scene,
  TimedEffect,
} from "./plan.ts";

/** One fragment step of a Scene: the start of a `show` or `focus`, or the end of a `focus` ring. */
export interface Step {
  readonly edge: "end" | "start";
  readonly effect: Effect;
  /** Absent until the Plan has a Timeline; the steps are then in source order. */
  readonly timed: TimedEffect | undefined;
}

/**
 * Where a sound plays:
 * - `slide`: with the slide change (its event names the slide change, the Scene or an Element, and no step has fired);
 * - `step`: with the fragment step of this effect (the step that fired last at or before the sound);
 * - `alone`: a plain audio event of the Scene: it follows no step and no slide change.
 */
export type Carrier =
  | { readonly kind: "slide" }
  | { readonly effectId: string; readonly kind: "step" }
  | { readonly kind: "alone" };

/** A sound instance and where it plays. */
export interface CarriedSound {
  readonly carrier: Carrier;
  readonly effect: Effect;
  readonly timed: TimedEffect | undefined;
}

/** The Timeline entries of an effect, one for each instance. */
const timedOf = (
  plan: PlanJson,
  scene: Scene,
  effect: Effect
): readonly TimedEffect[] =>
  Arr.filter(
    Option.match(
      Arr.findFirst(
        plan.timeline?.scenes ?? [],
        (candidate) => candidate.sceneId === scene.id
      ),
      { onNone: () => [], onSome: (found) => found.effects }
    ),
    (candidate) => candidate.effectId === effect.id
  );

/** The frame a step happens at: a start at its fire frame, an end at the end of its ring. */
const frameOfStep = (step: Step): number =>
  step.edge === "start"
    ? (step.timed?.fireFrame ?? 0)
    : (step.timed?.endFrame ?? 0);

/**
 * The fragment steps of a Scene in resolved-time order (source order without a Timeline; ties keep source order, a
 * start before an end): a start for each `show` and `focus`, and an end for each `focus` that ends by its own `until`.
 */
export const stepsOf = (plan: PlanJson, scene: Scene): readonly Step[] => {
  const starts = Arr.map(Arr.filter(scene.effects, isStep), (effect): Step => ({
    edge: "start",
    effect,
    timed: Arr.head(timedOf(plan, scene, effect)).pipe(Option.getOrUndefined),
  }));

  const ends = Arr.filter(
    Arr.map(starts, (step): Step => ({ ...step, edge: "end" })),
    ({ timed }) => timed !== undefined && timed.endCommandFrame !== null
  );

  return Arr.sort(
    [...starts, ...ends],
    Order.mapInput(Order.Number, frameOfStep)
  );
};

/** The step that fired last at or before `frame`, if any; ends carry nothing. */
const stepBefore = (
  steps: readonly Step[],
  frame: number
): Option.Option<Step> =>
  Arr.findLast(
    steps,
    (step) =>
      step.edge === "start" &&
      step.timed !== undefined &&
      step.timed.fireFrame <= frame
  );

/** Whether the event of a sound names the slide change, the Scene or an Element: it rides with the slide when no step precedes. */
const namesSlide = (effect: Effect, anchors: readonly string[]): boolean =>
  "absoluteFlicks" in effect.when
    ? false
    : Arr.some(anchors, (kind) => kind === "scene" || kind === "element");

/** The carrier of one instance of a sound, from its own frame. */
const carrierOf = (
  steps: readonly Step[],
  anchorKinds: readonly string[],
  sound: Effect,
  timed?: TimedEffect
): Carrier =>
  Option.match(
    stepBefore(steps, timed?.fireFrame ?? Number.POSITIVE_INFINITY),
    {
      onNone: (): Carrier =>
        namesSlide(sound, anchorKinds) ? { kind: "slide" } : { kind: "alone" },
      onSome: (step): Carrier => ({ effectId: step.effect.id, kind: "step" }),
    }
  );

/** The kinds of subject the sources of an event name (a derived event is followed): `scene`, `element`, `effect`, `state`, `beat` or `word`. */
const kindsOf = (
  scene: Scene,
  expr: EventExpr,
  depth: number
): readonly string[] => [
  ...Arr.map(anchorsOf(expr), (anchor) =>
    anchor.kind === "word" ? "word" : anchor.subject.kind
  ),
  ...(depth > 10
    ? []
    : Arr.flatMap(refsOf(expr), (name) =>
        Option.match(
          Arr.findFirst(scene.events, (derived) => derived.name === name),
          {
            onNone: () => [],
            onSome: (derived) => kindsOf(scene, derived.event, depth + 1),
          }
        )
      )),
];

const sourceKinds = (scene: Scene, effect: Effect): readonly string[] =>
  "absoluteFlicks" in effect.when ? [] : kindsOf(scene, effect.when.event, 0);

/** Every sound instance of a Scene with the step or slide it plays with, in source order (then instance order). */
export const soundsOf = (
  plan: PlanJson,
  scene: Scene
): readonly CarriedSound[] => {
  const steps = stepsOf(plan, scene);

  return Arr.flatMap(
    Arr.filter(scene.effects, (effect: Effect) => !isStep(effect)),
    (effect: Effect): readonly CarriedSound[] => {
      const kinds = sourceKinds(scene, effect);
      const instances = timedOf(plan, scene, effect);

      return Arr.isReadonlyArrayNonEmpty(instances)
        ? Arr.map(instances, (timed): CarriedSound => ({
            carrier: carrierOf(steps, kinds, effect, timed),
            effect,
            timed,
          }))
        : [
            {
              carrier: carrierOf(steps, kinds, effect),
              effect,
              timed: undefined,
            },
          ];
    }
  );
};
