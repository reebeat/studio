// A Plan whose Timeline exists and agrees with its Scenes, and the frame arithmetic that reads it. Every renderer,
// capturer and encoder starts from `requireTimeline`. Plain functions, integer milliseconds.
import { Array as Arr, Option, Result } from "effect";

import { PlanNotScheduled } from "./errors.ts";
import type { Line, PlanJson, Timeline } from "./plan.ts";

/** The millisecond at which `frame` starts: `round(1000 * frame / fps)`. */
export const frameToMs = (frame: number, fps: number): number =>
  Math.round((1000 * frame) / fps);

export type TimedPlan = PlanJson & { readonly timeline: Timeline };

const planLines = (plan: PlanJson): readonly Line[] =>
  Arr.flatMap(plan.scenes, (scene) => scene.lines);

/** Every Line of the Plan by id. */
export const linesById = (plan: PlanJson): ReadonlyMap<string, Line> =>
  new Map(Arr.map(planLines(plan), (line): [string, Line] => [line.id, line]));

const notScheduled = (
  message: string
): Result.Result<never, PlanNotScheduled> =>
  Result.fail(new PlanNotScheduled({ message }));

/** The first disagreement between the Timeline and the Scenes, or undefined. */
const firstDisagreement = (
  plan: PlanJson,
  timeline: Timeline
): string | undefined => {
  const lines = linesById(plan);
  const chapterIds = new Set(Arr.map(plan.chapters, (chapter) => chapter.id));

  for (const scene of timeline.scenes) {
    const planned = Option.getOrUndefined(
      Arr.findFirst(plan.scenes, (candidate) => candidate.id === scene.sceneId)
    );

    if (planned === undefined) {
      return `the Timeline has Scene ${scene.sceneId}, the Plan does not`;
    }

    for (const line of scene.lines) {
      if (!lines.has(line.lineId)) {
        return `the Timeline has Line ${line.lineId}, the Plan does not`;
      }
    }

    const unknownEffect = Arr.findFirst(
      scene.effects,
      (timed) =>
        !Arr.some(planned.effects, (effect) => effect.id === timed.effectId)
    );

    if (Option.isSome(unknownEffect)) {
      return `the Timeline has effect ${unknownEffect.value.effectId} in Scene ${scene.sceneId}, the Plan does not`;
    }
  }

  const unknownChapter = Arr.findFirst(
    timeline.chapters,
    (chapter) => !chapterIds.has(chapter.chapterId)
  );

  return Option.isSome(unknownChapter)
    ? `the Timeline has chapter ${unknownChapter.value.chapterId}, the Plan does not`
    : undefined;
};

/** The Plan with its Timeline, or why it cannot be rendered. Every renderer starts here. */
export const requireTimeline = (
  plan: PlanJson
): Result.Result<TimedPlan, PlanNotScheduled> => {
  const { timeline } = plan;

  if (timeline === undefined) {
    return notScheduled("the Plan has no timeline: run the schedule first");
  }

  const disagreement = firstDisagreement(plan, timeline);

  return disagreement === undefined
    ? Result.succeed({ ...plan, timeline })
    : notScheduled(disagreement);
};
