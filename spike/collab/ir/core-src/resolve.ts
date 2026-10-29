// Effect resolution (spec 0002, "plan contract for effects"; spec 0004): every event expression becomes integer
// frames, from the aligned words (`TimedLine.words`), the Scene's `slideFrame`, the machines of `machines.ts` and the
// renderer's declared `RendererLifecycle`. Time is exact (flicks, `time.ts`) and becomes a frame only here, at the
// Plan's rate: the nearest frame, a half to the later one; a lag the renderer measured in frames at its own rate is
// the same TIME at the Plan's rate. An effect's frame is the integer sum of its event's frame and its offset's frames:
//
//   s                  = the Scene's slideFrame;  W = s + round(fps * transitionMs[transition] / 1000); L = endFrame - 1
//   word.start | end   = the word's start | end frame (a phrase: its first word's start, its last word's end)
//   transition.<point> = s .. W; the progress is linear in time
//   move | update      = s + matched.startLagFrames .. W, N% by the declared easing (progress, not time)
//   enter              = unmatched: s + enter.startLag .. s + enter.endLag; slide: s .. W; show: fire .. fire + showMs
//   exit               = s, an instant
//   effect run         = a show: fire .. fire + showMs; a focus: fire .. its `until` end, else L; a sound: fire, an instant
//   state events       = the machine's occupancies (`occupancy.ts`): `enter` the start of a state's first interval, `leave`
//                        its end; the slide change at L leaves every state
//   state n            = the dwell: from the end of Beat n-1 (s for State 1) to the start of Beat n (L for the last State)
//   beat n             = the n-th Beat the engine generates: from a distinct fire frame of the steps (show, focus) after s to
//                        the end of the slowest of them (a show fades, a focus is an instant), so a step cannot be timed by a State or a Beat
//   until              = the first occurrence after the fire frame, else L (the slide change interrupts the effect)
//   offset             = ms: round(fps * ms / 1000); f: frames; %: round(N/100 * window width) (needs a window)
//   absolute           = s + round(fps * ms / 1000)
//   fire frame         = the event's frame; command frame = fire - 1 for show and focus, fire for sound
//
// Plain functions over `Result`; no Effect, no service.
import { Array as Arr, Match, Option, Order, Result } from "effect";

import { endsAfter, once } from "./combinators.ts";
import type { Event, Window } from "./combinators.ts";
import { EffectOutsideScene, EmptyWindow, UnresolvedAnchor } from "./errors.ts";
import type { ScheduleError } from "./errors.ts";
import { evaluator } from "./evaluate.ts";
import type { Evaluate, Sources } from "./evaluate.ts";
import { eventKind, initialState, isStep, showEffectOf } from "./events.ts";
import type { EventKind } from "./events.ts";
import { verbArguments } from "./grammar.ts";
import { effectOf } from "./lookup.ts";
import { machines } from "./machines.ts";
import type { Machine } from "./machines.ts";
import { occupancies, reaches, stateEvent } from "./occupancy.ts";
import type {
  Anchor,
  Effect,
  EventExpr,
  Point,
  RendererLifecycle,
  Scene,
  Settings,
  TimedEffect,
  TimedEvent,
  TimedLine,
} from "./plan.ts";
import {
  flicksOfFrames,
  flicksOfMilliseconds,
  framesOfFlicks,
  rateOf,
} from "./time.ts";
import { findPhrase } from "./words.ts";

/** What the resolution of one Scene reads. */
export interface SceneTiming {
  readonly endFrame: number;
  readonly lines: readonly TimedLine[];
  readonly slideFrame: number;
}

/** One run of an effect: its fire frame, the end of its window, and what ended it (none for a sound). */
interface Run {
  readonly end: number;
  readonly endedBy: TimedEffect["endedBy"];
  readonly fire: number;
}

interface Context {
  readonly active: Set<string>;
  /** The effect or derived event being resolved, for the error messages. */
  current: { readonly id: string; readonly line: number };
  readonly lifecycle: RendererLifecycle;
  readonly runs: Map<string, readonly Run[]>;
  readonly scene: Scene;
  readonly settings: Settings;
  readonly timing: SceneTiming;
}

/** What the helpers need besides the Scene: to evaluate an event, and to resolve another effect of the Scene. */
interface Tools {
  readonly evaluate: Evaluate<ScheduleError>;
  readonly runs: (
    effect: Effect
  ) => Result.Result<readonly Run[], ScheduleError>;
}

/** Exact time as frames at the Plan's rate: the nearest frame, a half to the later one (`time.ts`). */
const frames = (context: Context, flicks: number): number =>
  framesOfFlicks(rateOf(context.settings), flicks);

/** A lag measured in frames at the renderer's `measuredFps` as frames at the Plan's rate: the same time. */
const lagFrames = (context: Context, lag: number): number =>
  frames(context, flicksOfFrames(context.lifecycle.measuredFps, lag));

/** The Scene's last frame: the slide change at `endFrame` ends everything that runs. */
const lastFrame = (context: Context): number => context.timing.endFrame - 1;

const unresolved = (context: Context, message: string): ScheduleError =>
  new UnresolvedAnchor({
    effectId: context.current.id,
    message,
    sceneId: context.scene.id,
  });

const emptyWindow = (context: Context, what: string): ScheduleError =>
  new EmptyWindow({
    effectId: context.current.id,
    message: `effect ${context.current.id} (line ${context.current.line}): ${what} needs a window, but the renderer's lifecycle makes it an instant`,
    sceneId: context.scene.id,
  });

/** The CSS cubic-bezier component at `t`. */
const bezier = (t: number, first: number, second: number): number =>
  3 * (1 - t) * (1 - t) * t * first + 3 * (1 - t) * t * t * second + t * t * t;

/**
 * The fraction of the time at which the eased progress reaches `progress`: bisection on the declared bezier
 * `[x1, y1, x2, y2]`, 48 halvings, so the same input gives the same frame on every machine.
 */
export const timeOfProgress = (
  easing: RendererLifecycle["matched"]["easing"],
  progress: number
): number => {
  if (progress <= 0 || progress >= 1) {
    return Math.min(1, Math.max(0, progress));
  }

  const [x1, y1, x2, y2] = easing;
  let low = 0;
  let high = 1;

  for (let step = 0; step < 48; step += 1) {
    const middle = (low + high) / 2;

    if (bezier(middle, y1, y2) < progress) {
      low = middle;
    } else {
      high = middle;
    }
  }

  return bezier((low + high) / 2, x1, x2);
};

/** The frame N percent of the way through a window: by the declared easing for an `eased` progress, else by time. */
const progressFrame = (
  context: Context,
  window: Window,
  percent: number,
  eased: boolean
): number =>
  window.start +
  Math.round(
    (eased
      ? timeOfProgress(context.lifecycle.matched.easing, percent / 100)
      : percent / 100) *
      (window.end - window.start)
  );

const pointFrame = (
  context: Context,
  window: Window,
  at: Point,
  eased: boolean
): Result.Result<number, ScheduleError> => {
  if (at === "start") {
    return Result.succeed(window.start);
  }

  if (at === "end") {
    return Result.succeed(window.end);
  }

  return window.end === window.start
    ? Result.fail(emptyWindow(context, `${at.percent}%`))
    : Result.succeed(progressFrame(context, window, at.percent, eased));
};

/** The slide change into the Scene: from `s` for the renderer's declared time of this kind of transition. */
const transitionWindow = (context: Context): Window => ({
  end:
    context.timing.slideFrame +
    frames(
      context,
      flicksOfMilliseconds(
        context.lifecycle.transitionMs[context.scene.transition]
      )
    ),
  start: context.timing.slideFrame,
});

/** The window of a run of an effect. */
const runWindow = (run: Run): Window => ({ end: run.end, start: run.fire });

/** The window of `kind` for an Element; a `show-enter` waits for the effect that shows it. */
const eventWindow = (
  context: Context,
  id: string,
  kind: EventKind,
  tools: Tools
): Result.Result<Window, ScheduleError> => {
  const slide = context.timing.slideFrame;
  const { lifecycle } = context;
  const transition = transitionWindow(context);

  switch (kind) {
    case "matched": {
      const start =
        slide + lagFrames(context, lifecycle.matched.startLagFrames);

      return Result.succeed({ end: Math.max(start, transition.end), start });
    }

    case "unmatched-enter": {
      const start = lagFrames(
        context,
        lifecycle.unmatched.enter.startLagFrames
      );

      const end = lagFrames(context, lifecycle.unmatched.enter.endLagFrames);

      return Result.succeed({
        end: slide + Math.max(start, end),
        start: slide + start,
      });
    }

    case "exit": {
      return Result.succeed({ end: slide, start: slide });
    }

    case "slide-enter": {
      return Result.succeed(transition);
    }

    case "show-enter": {
      const shown = showEffectOf(context.scene, id);

      return shown === undefined
        ? Result.fail(unresolved(context, `no show effect for ${id}`))
        : Result.flatMap(tools.runs(shown), (runs) =>
            Option.match(Arr.head(runs), {
              onNone: () =>
                Result.fail(unresolved(context, `${shown.id} never fires`)),
              onSome: (run) => Result.succeed(runWindow(run)),
            })
          );
    }

    default: {
      return Result.fail(unresolved(context, `unknown event ${String(kind)}`));
    }
  }
};

const wordEvent = (
  context: Context,
  anchor: Extract<Anchor, { kind: "word" }>
): Result.Result<Event, ScheduleError> => {
  const found = findPhrase(context.scene.lines, anchor.phrase)[
    anchor.occurrence - 1
  ];

  const line = context.timing.lines[found?.line ?? -1];
  const first = line?.words[found?.from ?? -1];
  const last = line?.words[found?.to ?? -1];

  if (first === undefined || last === undefined) {
    return Result.fail(
      unresolved(
        context,
        `word("${anchor.phrase}", ${anchor.occurrence}) is not in the narration of Scene ${context.scene.id}`
      )
    );
  }

  return Result.succeed(
    once(anchor.edge === "start" ? first.startFrame : last.endFrame, {
      end: last.endFrame,
      start: first.startFrame,
    })
  );
};

/** The machine of an Element that has the transition or the state `name`. */
const elementMachine = (
  name: string,
  by: "state" | "transition"
): Machine | undefined =>
  Option.getOrUndefined(
    Arr.findFirst(
      Arr.filter(machines, (machine) => machine.subject === "element"),
      (machine) =>
        by === "transition"
          ? Arr.some(
              machine.transitions,
              (transition) => transition.name === name
            )
          : Arr.some(machine.states, (state) => state.name === name)
    )
  );

const progressOf = (machine: Machine | undefined, name: string): boolean =>
  Option.match(Option.fromNullishOr(machine), {
    onNone: () => false,
    onSome: (found) =>
      Arr.some(
        found.transitions,
        (transition) =>
          transition.name === name && transition.progress === "eased"
      ),
  });

const elementEdge = (
  context: Context,
  anchor: Extract<Anchor, { kind: "edge" }>,
  id: string,
  tools: Tools
): Result.Result<Event, ScheduleError> => {
  const kind = eventKind(context.scene, id, anchor.transition);

  if (kind === undefined) {
    return Result.fail(
      unresolved(
        context,
        `Element ${id} has no ${anchor.transition} in Scene ${context.scene.id}`
      )
    );
  }

  return Result.flatMap(eventWindow(context, id, kind, tools), (window) =>
    Result.map(
      pointFrame(
        context,
        window,
        anchor.at,
        progressOf(
          elementMachine(anchor.transition, "transition"),
          anchor.transition
        )
      ),
      (frame) => once(frame, window)
    )
  );
};

const sceneWindow = (context: Context): Window => ({
  end: lastFrame(context),
  start: context.timing.slideFrame,
});

const elementState = (
  context: Context,
  anchor: Extract<Anchor, { kind: "occupancy" }>,
  id: string,
  tools: Tools
): Result.Result<Event, ScheduleError> => {
  const machine = elementMachine(anchor.state, "state");

  if (machine === undefined) {
    return Result.fail(
      unresolved(context, `Element ${id} has no state ${anchor.state}`)
    );
  }

  const happenings = Result.all(
    Arr.flatMap(machine.transitions, ({ name }) => {
      const kind = eventKind(context.scene, id, name);

      return kind === undefined
        ? []
        : [
            Result.map(eventWindow(context, id, kind, tools), (window) => ({
              name,
              window,
            })),
          ];
    })
  );

  return Result.flatMap(happenings, (found) => {
    const intervals = occupancies(
      machine,
      initialState(context.scene, id, machine),
      found,
      sceneWindow(context)
    );

    return reaches(intervals, anchor.state)
      ? Result.succeed(stateEvent(intervals, anchor.state, anchor.event))
      : Result.fail(
          unresolved(
            context,
            `Element ${id} is never ${anchor.state} in Scene ${context.scene.id}`
          )
        );
  });
};

const effectNamed = (
  context: Context,
  id: string
): Result.Result<Effect, ScheduleError> =>
  Option.match(Option.fromNullishOr(effectOf(context.scene, id)), {
    onNone: () =>
      Result.fail(
        unresolved(context, `no effect ${id} in Scene ${context.scene.id}`)
      ),
    onSome: Result.succeed,
  });

const effectEdge = (
  context: Context,
  anchor: Extract<Anchor, { kind: "edge" }>,
  id: string,
  tools: Tools
): Result.Result<Event, ScheduleError> =>
  Result.flatMap(effectNamed(context, id), (other) =>
    Result.flatMap(tools.runs(other), (runs) => {
      if (anchor.at !== "start" && other.verb === "sound") {
        return Result.fail(
          unresolved(
            context,
            `${id} is a sound: it has no end; use ${id}.start`
          )
        );
      }

      return Result.map(
        Result.all(
          Arr.map(runs, (run) =>
            Result.map(
              pointFrame(context, runWindow(run), anchor.at, false),
              (frame) => ({ frame, window: runWindow(run) })
            )
          )
        ),
        (occurrences) =>
          Arr.flatMap(occurrences, ({ frame, window }) => once(frame, window))
      );
    })
  );

const effectState = (
  context: Context,
  anchor: Extract<Anchor, { kind: "occupancy" }>,
  id: string,
  tools: Tools
): Result.Result<Event, ScheduleError> =>
  Result.flatMap(effectNamed(context, id), (other) =>
    Result.flatMap(tools.runs(other), (runs) => {
      const machine = Arr.findFirst(
        machines,
        ({ subject }) => subject === "effect"
      );

      return Option.match(machine, {
        onNone: () =>
          Result.fail(unresolved(context, "no machine for effects")),
        onSome: (found) =>
          Result.succeed(
            Arr.flatMap(runs, (run) =>
              stateEvent(
                occupancies(
                  found,
                  found.initial,
                  [{ name: "run", window: runWindow(run) }],
                  sceneWindow(context)
                ),
                anchor.state,
                anchor.event
              )
            )
          ),
      });
    })
  );

const sceneEdge = (
  context: Context,
  anchor: Extract<Anchor, { kind: "edge" }>
): Result.Result<Event, ScheduleError> => {
  const window = transitionWindow(context);

  return Result.map(pointFrame(context, window, anchor.at, false), (frame) =>
    once(frame, window)
  );
};

const sceneState = (
  context: Context,
  anchor: Extract<Anchor, { kind: "occupancy" }>
): Result.Result<Event, ScheduleError> =>
  Option.match(
    Arr.findFirst(machines, ({ subject }) => subject === "scene"),
    {
      onNone: () =>
        Result.fail(unresolved(context, "no machine for the Scene")),
      onSome: (machine) =>
        Result.succeed(
          stateEvent(
            occupancies(
              machine,
              machine.initial,
              [{ name: "transition", window: transitionWindow(context) }],
              sceneWindow(context)
            ),
            anchor.state,
            anchor.event
          )
        ),
    }
  );

/** One step of the Scene: where it fires and how long the change it makes lasts (a `show` fades, a `focus` is an instant). */
interface StepRun {
  readonly end: number;
  readonly fire: number;
}

/**
 * The Beats of the Scene in time order: the engine generates one from each distinct fire frame of a step after the
 * Scene's first frame. A Beat starts at that frame and lasts as long as the slowest step that fires then.
 */
const beatWindows = (
  context: Context,
  tools: Tools
): Result.Result<readonly Window[], ScheduleError> =>
  Result.map(
    Result.all(
      Arr.map(Arr.filter(context.scene.effects, isStep), (step) =>
        Result.map(tools.runs(step), (runs) =>
          Arr.map(runs, (run): StepRun => ({
            end: step.verb === "show" ? run.end : run.fire,
            fire: run.fire,
          }))
        )
      )
    ),
    (lists) => {
      const steps = Arr.filter(
        Arr.flatten(lists),
        ({ fire }) => fire > context.timing.slideFrame
      );

      return Arr.map(
        Arr.sort(Arr.dedupe(Arr.map(steps, ({ fire }) => fire)), Order.Number),
        (start): Window => ({
          end: Math.max(
            start,
            ...Arr.map(
              Arr.filter(steps, ({ fire }) => fire === start),
              ({ end }) => end
            )
          ),
          start,
        })
      );
    }
  );

/** The interval of Beat `n`. */
const beatWindow = (
  context: Context,
  n: number,
  tools: Tools
): Result.Result<Window, ScheduleError> =>
  Result.flatMap(beatWindows(context, tools), (beats) =>
    Option.match(Arr.get(beats, n - 1), {
      onNone: () =>
        Result.fail(
          unresolved(
            context,
            `beat(${n}) does not exist: Scene ${context.scene.id} has ${beats.length} Beat${beats.length === 1 ? "" : "s"}`
          )
        ),
      onSome: Result.succeed,
    })
  );

/**
 * The dwell of State `n`: from the end of the Beat before it (the Scene's first frame for State 1) to the start of the
 * Beat after it (the Scene's last frame for the last State).
 */
const stateWindow = (
  context: Context,
  n: number,
  tools: Tools
): Result.Result<Window, ScheduleError> =>
  Result.flatMap(beatWindows(context, tools), (beats) => {
    if (n > beats.length + 1) {
      return Result.fail(
        unresolved(
          context,
          `state(${n}) does not exist: Scene ${context.scene.id} has ${beats.length + 1} State${beats.length === 0 ? "" : "s"}`
        )
      );
    }

    const first = Option.match(Arr.get(beats, n - 2), {
      onNone: () => context.timing.slideFrame,
      onSome: (beat) => beat.end,
    });

    return Result.succeed({
      end: Option.match(Arr.get(beats, n - 1), {
        onNone: () => lastFrame(context),
        onSome: (beat) => Math.max(first, beat.start),
      }),
      start: first,
    });
  });

/** The state events of a State (the dwell) or a Beat (waiting, changing, done) of the Scene. */
const numberedState = (
  context: Context,
  anchor: Extract<Anchor, { kind: "occupancy" }>,
  n: number,
  tools: Tools
): Result.Result<Event, ScheduleError> => {
  if (anchor.subject.kind === "state") {
    return Result.map(stateWindow(context, n, tools), (window) =>
      once(anchor.event === "enter" ? window.start : window.end, window)
    );
  }

  return Result.flatMap(beatWindow(context, n, tools), (window) =>
    Option.match(
      Arr.findFirst(machines, ({ subject }) => subject === "beat"),
      {
        onNone: () => Result.fail(unresolved(context, "no machine for a Beat")),
        onSome: (machine) =>
          Result.succeed(
            stateEvent(
              occupancies(
                machine,
                machine.initial,
                [{ name: "change", window }],
                sceneWindow(context)
              ),
              anchor.state,
              anchor.event
            )
          ),
      }
    )
  );
};

/** A point of the Beat `n` between two States: its start, its end, N percent of the way (linear in time). */
const beatEdge = (
  context: Context,
  anchor: Extract<Anchor, { kind: "edge" }>,
  n: number,
  tools: Tools
): Result.Result<Event, ScheduleError> =>
  Result.flatMap(beatWindow(context, n, tools), (window) =>
    Result.map(pointFrame(context, window, anchor.at, false), (frame) =>
      once(frame, window)
    )
  );

const edgeEvent = (
  context: Context,
  anchor: Extract<Anchor, { kind: "edge" }>,
  tools: Tools
): Result.Result<Event, ScheduleError> => {
  const { subject } = anchor;

  return Match.value(subject).pipe(
    Match.discriminatorsExhaustive("kind")({
      beat: (found) => beatEdge(context, anchor, found.n, tools),
      effect: (found) => effectEdge(context, anchor, found.id, tools),
      element: (found) => elementEdge(context, anchor, found.id, tools),
      scene: () => sceneEdge(context, anchor),
      state: () =>
        Result.fail(
          unresolved(
            context,
            `a State holds, it has no transition ${anchor.transition}`
          )
        ),
    })
  );
};

const stateOf = (
  context: Context,
  anchor: Extract<Anchor, { kind: "occupancy" }>,
  tools: Tools
): Result.Result<Event, ScheduleError> => {
  const { subject } = anchor;

  return Match.value(subject).pipe(
    Match.discriminatorsExhaustive("kind")({
      beat: (found) => numberedState(context, anchor, found.n, tools),
      effect: (found) => effectState(context, anchor, found.id, tools),
      element: (found) => elementState(context, anchor, found.id, tools),
      scene: () => sceneState(context, anchor),
      state: (found) => numberedState(context, anchor, found.n, tools),
    })
  );
};

/** The frame at which the capture issues the effect: one before a visible change, the fire frame for a sound. */
export const commandOf = (effect: Effect, fire: number): number =>
  effect.verb === "sound" ? fire : fire - 1;

const outsideScene = (
  context: Context,
  effect: Effect,
  fire: number
): ScheduleError | undefined => {
  const { slideFrame, endFrame } = context.timing;
  const command = commandOf(effect, fire);

  if (fire >= slideFrame && command >= slideFrame && fire < endFrame) {
    return undefined;
  }

  return new EffectOutsideScene({
    effectId: effect.id,
    message: `effect ${effect.id} (line ${effect.line}) resolves to frame ${fire} (command at ${command}), outside Scene ${context.scene.id} (frames ${slideFrame} to ${endFrame - 1}): its event and offset must keep it, and its command, inside the Scene`,
    sceneId: context.scene.id,
  });
};

/** The end of a run that starts at `fire`: a `show` fades, a `focus` is held to its `until` or the slide change. */
const endOf = (
  context: Context,
  effect: Effect,
  fire: number,
  tools: Tools
): Result.Result<Run, ScheduleError> => {
  if (effect.verb === "sound") {
    return Result.succeed({ end: fire, endedBy: null, fire });
  }

  if (effect.verb === "show") {
    return Result.succeed({
      end:
        fire + frames(context, flicksOfMilliseconds(context.lifecycle.showMs)),
      endedBy: "window",
      fire,
    });
  }

  if (effect.until === undefined) {
    return Result.succeed({
      end: lastFrame(context),
      endedBy: "slide-change",
      fire,
    });
  }

  return Result.map(tools.evaluate(effect.until.event), (ends) => {
    const found = endsAfter(fire, ends, lastFrame(context));

    return {
      end: found.frame,
      endedBy: found.interrupted ? "slide-change" : "until",
      fire,
    };
  });
};

/** The fire frames of an effect: its event's occurrences, or its absolute time. */
const firesOf = (
  context: Context,
  effect: Effect,
  tools: Tools
): Result.Result<readonly number[], ScheduleError> => {
  const { when } = effect;

  if ("absoluteFlicks" in when) {
    return Result.succeed([
      context.timing.slideFrame + frames(context, when.absoluteFlicks),
    ]);
  }

  return Result.flatMap(tools.evaluate(when.event), (event) => {
    const found = Arr.map(event, ({ frame }) => frame);

    if (found.length === 0) {
      return Result.fail(
        unresolved(
          context,
          `effect ${effect.id} (line ${effect.line}) never fires: ${effect.written} has no occurrence in Scene ${context.scene.id}`
        )
      );
    }

    return found.length > 1 && verbArguments[effect.verb].instances === "one"
      ? Result.fail(
          unresolved(
            context,
            `effect ${effect.id} (line ${effect.line}) fires ${found.length} times (frames ${Arr.join(Arr.map(found, String), ", ")}), but a ${effect.verb} happens once: use first(...) or all(...) to pick one`
          )
        )
      : Result.succeed(found);
  });
};

const checked = (
  context: Context,
  effect: Effect,
  fires: readonly number[]
): Result.Result<readonly number[], ScheduleError> => {
  const outside = Arr.flatMap(fires, (fire) =>
    Option.toArray(Option.fromNullishOr(outsideScene(context, effect, fire)))
  );

  return Option.match(Arr.head(outside), {
    onNone: () => Result.succeed(fires),
    onSome: Result.fail,
  });
};

/** The runs of an effect, memoised; an effect that waits for itself is `UnresolvedAnchor`. */
const runsOf = (
  context: Context,
  effect: Effect,
  tools: Tools
): Result.Result<readonly Run[], ScheduleError> => {
  const known = context.runs.get(effect.id);

  if (known !== undefined) {
    return Result.succeed(known);
  }

  const before = context.current;

  context.current = { id: effect.id, line: effect.line };

  if (context.active.has(effect.id)) {
    context.current = before;

    return Result.fail(
      unresolved(context, `effect ${effect.id} waits for itself`)
    );
  }

  context.active.add(effect.id);

  const resolved = Result.flatMap(
    Result.flatMap(firesOf(context, effect, tools), (fires) =>
      checked(context, effect, fires)
    ),
    (fires) =>
      Result.all(Arr.map(fires, (fire) => endOf(context, effect, fire, tools)))
  );

  context.active.delete(effect.id);
  context.current = before;

  if (Result.isSuccess(resolved)) {
    context.runs.set(effect.id, resolved.success);
  }

  return resolved;
};

/** The helpers' tools: evaluating an event of the Scene, and resolving another effect (memoised, cycle-checked). */
const toolsOf = (
  context: Context,
  evaluate: Evaluate<ScheduleError>
): Tools => {
  const tools: Tools = {
    evaluate,
    runs: (effect) => runsOf(context, effect, tools),
  };

  return tools;
};

/** The frames of every source of an event, resolved from the Scene's timing and the machines. */
const sourcesOf = (context: Context): Sources<ScheduleError> => ({
  anchor: (anchor, evaluate) => {
    const tools = toolsOf(context, evaluate);

    return Match.value(anchor).pipe(
      Match.discriminatorsExhaustive("kind")({
        edge: (found) => edgeEvent(context, found, tools),
        occupancy: (found) => stateOf(context, found, tools),
        word: (found) => wordEvent(context, found),
      })
    );
  },
  emptyWindow: (what) => emptyWindow(context, what),
  frames: (ms) => frames(context, ms),
  state: (n, evaluate) => stateWindow(context, n, toolsOf(context, evaluate)),
  unresolved: (message) => unresolved(context, message),
});

const intentOf = (effect: Effect): string =>
  effect.until === undefined
    ? effect.written
    : `${effect.written} until ${effect.until.written}`;

const timedRuns = (
  effect: Effect,
  runs: readonly Run[]
): readonly TimedEffect[] =>
  Arr.map(runs, (run, index): TimedEffect => ({
    commandFrame: commandOf(effect, run.fire),
    effectId: effect.id,
    endCommandFrame:
      effect.verb === "focus" && run.endedBy === "until" ? run.end - 1 : null,
    endFrame: effect.verb === "sound" ? null : run.end,
    endedBy: run.endedBy,
    fireFrame: run.fire,
    instance: index + 1,
    intent: intentOf(effect),
  }));

/** The Scene's effects with their frames, one entry per instance, in resolved time order. */
export interface Resolved {
  readonly effects: readonly TimedEffect[];
  readonly events: readonly TimedEvent[];
}

/**
 * The Scene's effects (one entry per instance, in resolved time order, ties in source order) and derived events with
 * their frames, or the first reason one cannot be resolved.
 */
export const resolveEffects = (
  scene: Scene,
  timing: SceneTiming,
  settings: Settings,
  lifecycle: RendererLifecycle
): Result.Result<Resolved, ScheduleError> => {
  const context: Context = {
    active: new Set(),
    current: { id: "", line: 0 },
    lifecycle,
    runs: new Map(),
    scene,
    settings,
    timing,
  };

  const evaluate = evaluator(
    sourcesOf(context),
    new Map(
      Arr.map(scene.events, ({ event, name }): [string, EventExpr] => [
        name,
        event,
      ])
    )
  );

  const tools = toolsOf(context, evaluate);

  const effects = Result.all(
    Arr.map(scene.effects, (effect) =>
      Result.map(tools.runs(effect), (runs) => timedRuns(effect, runs))
    )
  );

  const events = Result.all(
    Arr.map(scene.events, (derived) => {
      context.current = { id: derived.name, line: derived.line };

      return Result.map(
        evaluate({ kind: "ref", name: derived.name }),
        (event): TimedEvent => ({
          frames: Arr.map(event, ({ frame }) => frame),
          name: derived.name,
          written: derived.written,
        })
      );
    })
  );

  return Result.flatMap(effects, (timed) =>
    Result.map(events, (derivedEvents) => ({
      effects: Arr.sort(
        Arr.flatten(timed),
        Order.mapInput(Order.Number, (effect: TimedEffect) => effect.fireFrame)
      ),
      events: derivedEvents,
    }))
  );
};
