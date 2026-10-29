// The schedule: aligned word times in, a Timeline of integer frames out (spec 0001, "Time" and "The Plan
// contract"; spec 0002 for the effects). All arithmetic is integer frames at `settings.fps`; a duration in seconds or
// milliseconds becomes frames with `Math.round` (halves round up), and every later frame is an integer sum of those,
// so no rounding error accumulates:
//
//   first Line start  = slideFrame + round(fps * (sceneLead + pauseBefore))
//   later Line start  = previous Line end + round(fps * (lineGap + pauseBefore))
//   Line end          = Line start + round(fps * durationMs / 1000)
//   word frame        = Line start + round(fps * wordMs / 1000)
//   Scene end         = last Line end + round(fps * sceneTail)
//   next slideFrame   = this Scene end; totalFrames = last Scene end
//   effect frames     = `resolveEffects` (`resolve.ts`): anchor frame plus offset, from the words, the slideFrame and
//                       the renderer's `RendererLifecycle`
import { Array as Arr, Effect, Option, Result, Schema } from "effect";

import {
  AlignmentMismatch,
  LifecycleMismatch,
  SceneLeadTooShort,
} from "./errors.ts";
import type { ScheduleError } from "./errors.ts";
import { AudioFileSchema } from "./plan.ts";
import type {
  Line,
  PlanJson,
  RendererLifecycle,
  Scene,
  Settings,
  TimedLine,
  TimedScene,
  Timeline,
} from "./plan.ts";
import { resolveEffects } from "./resolve.ts";
import {
  flicksOfMilliseconds,
  flicksOfSeconds,
  framesOfFlicks,
  rateOf,
} from "./time.ts";

const Milliseconds = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

/** What speech provides for one Line: its audio and its words with aligned times; words align 1:1 to `Line.words`. */
export const AlignedLineSchema = Schema.Struct({
  audio: Schema.Struct({ file: AudioFileSchema, sha256: Schema.String }),
  durationMs: Milliseconds,
  lineId: Schema.NonEmptyString,
  words: Schema.Array(
    Schema.Struct({
      endMs: Milliseconds,
      startMs: Milliseconds,
      w: Schema.String,
    })
  ),
});

export type AlignedLine = typeof AlignedLineSchema.Type;

const secondsToFrames = (settings: Settings, seconds: number): number =>
  framesOfFlicks(rateOf(settings), flicksOfSeconds(seconds));

const millisecondsToFrames = (settings: Settings, ms: number): number =>
  framesOfFlicks(rateOf(settings), flicksOfMilliseconds(ms));

const mismatch = (line: Line, message: string): AlignmentMismatch =>
  new AlignmentMismatch({ lineId: line.id, message });

/** The first problem between a Line and its aligned data, or undefined. */
const checkLine = (
  line: Line,
  aligned: AlignedLine | undefined
): ScheduleError | undefined => {
  if (aligned === undefined) {
    return mismatch(line, `no aligned data for Line ${line.id}`);
  }

  const spoken = Arr.map(aligned.words, (word) => word.w);

  if (spoken.length !== line.words.length) {
    return mismatch(
      line,
      `Line ${line.id} has ${line.words.length} words but its alignment has ${spoken.length}`
    );
  }

  const differs = Arr.findFirstIndex(
    line.words,
    (word, index) => word !== spoken[index]
  );

  return Option.isSome(differs)
    ? mismatch(
        line,
        `Line ${line.id} word ${differs.value + 1} is "${line.words[differs.value]}" but its alignment has "${spoken[differs.value]}"`
      )
    : undefined;
};

/** A Plan Line with its aligned data. */
interface Paired {
  readonly aligned: AlignedLine;
  readonly line: Line;
}

/** Pairs every Line of a Scene with its aligned data, or reports the first problem. */
const pairScene = (
  scene: Scene,
  aligned: ReadonlyMap<string, AlignedLine>
): Result.Result<readonly Paired[], ScheduleError> => {
  const paired: Paired[] = [];

  for (const line of scene.lines) {
    const found = aligned.get(line.id);
    const problem = checkLine(line, found);

    if (problem !== undefined) {
      return Result.fail(problem);
    }

    if (found !== undefined) {
      paired.push({ aligned: found, line });
    }
  }

  return Result.succeed(paired);
};

const timeLine = (
  pair: Paired,
  startFrame: number,
  settings: Settings
): TimedLine => ({
  audio: pair.aligned.audio,
  endFrame:
    startFrame + millisecondsToFrames(settings, pair.aligned.durationMs),
  lineId: pair.line.id,
  startFrame,
  words: Arr.map(pair.aligned.words, (word) => ({
    endFrame: startFrame + millisecondsToFrames(settings, word.endMs),
    endMs: word.endMs,
    startFrame: startFrame + millisecondsToFrames(settings, word.startMs),
    startMs: word.startMs,
    w: word.w,
  })),
});

const timeScene = (
  scene: Scene,
  pairs: readonly Paired[],
  slideFrame: number,
  settings: Settings,
  lifecycle: RendererLifecycle
): Result.Result<TimedScene, ScheduleError> => {
  const lines: TimedLine[] = [];
  let cursor = slideFrame;

  for (const [index, pair] of pairs.entries()) {
    const gap = index === 0 ? settings.sceneLead : settings.lineGap;

    const startFrame =
      cursor + secondsToFrames(settings, gap + pair.line.hints.pauseBefore);

    const timed = timeLine(pair, startFrame, settings);

    lines.push(timed);
    cursor = timed.endFrame;
  }

  const endFrame = cursor + secondsToFrames(settings, settings.sceneTail);

  return Result.map(
    resolveEffects(scene, { endFrame, lines, slideFrame }, settings, lifecycle),
    ({ effects, events }): TimedScene => ({
      effects,
      endFrame,
      events,
      lines,
      sceneId: scene.id,
      slideFrame,
    })
  );
};

const sceneLeadError = (settings: Settings): SceneLeadTooShort =>
  new SceneLeadTooShort({
    message: `sceneLead ${settings.sceneLead} s is shorter than the transition ${settings.transition} s: the first Line would start inside it`,
    sceneLead: settings.sceneLead,
    transition: settings.transition,
  });

/** The first reason the Plan and the renderer's declared lifecycle cannot be scheduled together, or undefined. */
const checkLifecycle = (
  settings: Settings,
  lifecycle: RendererLifecycle
): ScheduleError | undefined => {
  if (settings.sceneLead < settings.transition) {
    return sceneLeadError(settings);
  }

  const declared = lifecycle.transitionMs["auto-animate"];

  return declared === Math.round(settings.transition * 1000)
    ? undefined
    : new LifecycleMismatch({
        message: `the renderer declares an Auto-Animate of ${declared} ms but settings.transition is ${settings.transition} s: the Plan's transition is the renderer's instruction`,
      });
};

/** The Timeline of a Plan, or the first reason it cannot be scheduled. */
const timelineOf = (
  plan: PlanJson,
  alignedLines: readonly AlignedLine[],
  lifecycle: RendererLifecycle
): Result.Result<Timeline, ScheduleError> => {
  const refused = checkLifecycle(plan.settings, lifecycle);

  if (refused !== undefined) {
    return Result.fail(refused);
  }

  const aligned = new Map(Arr.map(alignedLines, (line) => [line.lineId, line]));

  const known = new Set(
    Arr.flatMap(plan.scenes, (scene) => Arr.map(scene.lines, (line) => line.id))
  );

  const extra = Arr.findFirst(alignedLines, (line) => !known.has(line.lineId));

  if (Option.isSome(extra)) {
    return Result.fail(
      new AlignmentMismatch({
        lineId: extra.value.lineId,
        message: `aligned Line ${extra.value.lineId} is not a Line of the Plan`,
      })
    );
  }

  const scenes: TimedScene[] = [];
  let slideFrame = 0;

  for (const scene of plan.scenes) {
    const pairs = pairScene(scene, aligned);

    if (Result.isFailure(pairs)) {
      return Result.fail(pairs.failure);
    }

    const timed = timeScene(
      scene,
      pairs.success,
      slideFrame,
      plan.settings,
      lifecycle
    );

    if (Result.isFailure(timed)) {
      return Result.fail(timed.failure);
    }

    scenes.push(timed.success);
    slideFrame = timed.success.endFrame;
  }

  return Result.succeed({
    chapters: Arr.flatMap(plan.chapters, (chapter) =>
      Option.match(
        Arr.findFirst(scenes, (timed) => timed.sceneId === chapter.sceneIds[0]),
        {
          onNone: () => [],
          onSome: (first) => [
            { chapterId: chapter.id, startFrame: first.slideFrame },
          ],
        }
      )
    ),
    scenes,
    totalFrames: slideFrame,
  });
};

/**
 * Adds the `timeline` to a Plan from the aligned Lines and the renderer's declared lifecycle. Fails with
 * `SceneLeadTooShort` when `sceneLead` is below `transition`, with `LifecycleMismatch` when the renderer's Auto-Animate
 * is not the Plan's transition, with `AlignmentMismatch` when a Line's aligned words differ from its words (or a Line
 * is missing, or an aligned Line is not in the Plan), and with `EffectOutsideScene`, `EmptyWindow` or
 * `UnresolvedAnchor` (naming the effect) when an effect cannot be placed.
 */
export const schedule = Effect.fn("schedule")(
  (
    plan: PlanJson,
    aligned: readonly AlignedLine[],
    lifecycle: RendererLifecycle
  ) =>
    Effect.fromResult(
      Result.map(
        timelineOf(plan, aligned, lifecycle),
        (timeline): PlanJson => ({
          ...plan,
          timeline,
        })
      )
    )
);
