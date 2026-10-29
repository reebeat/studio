// The cross-checks of one Scene's effects (spec 0002, F2; spec 0004, F8): every reference resolves (Element ids of this
// Scene, effect ids, derived event names, a `word(...)` phrase that the narration has and that is unambiguous unless
// `, n` is written, a Beat that can exist), every moment named is one of a declared machine that the Scene reaches,
// nothing waits for itself (through effects, derived events, an `until` or a Beat), percents only on events with a
// window, a `show` or `focus` fires once, `show` only on a `visible=false` Element, and every hidden Element is shown
// once. Plain functions over the assembled Scene; each returns its errors in the order found.
import {
  Array as Arr,
  Match,
  Option,
  Record,
  Schema,
  String as Str,
} from "effect";

import { formatAnchor } from "./anchors.ts";
import { planError } from "./errors.ts";
import type { PlanError } from "./errors.ts";
import { anchorsOf, refsOf, statesOf } from "./evaluate.ts";
import {
  eventKind,
  hasWindow,
  initialState,
  isStep,
  showEffectOf,
} from "./events.ts";
import { formatEvent } from "./expr.ts";
import {
  anchorWords,
  didYouMean,
  oneOf,
  problem,
  verbArguments,
} from "./grammar.ts";
import { effectOf, elementOf } from "./lookup.ts";
import { elementEvents, machines } from "./machines.ts";
import type { Machine } from "./machines.ts";
import { occupancies, reaches } from "./occupancy.ts";
import { EdgeSchema } from "./plan.ts";
import type { Anchor, Effect, EventExpr, Scene } from "./plan.ts";
import { findPhrase, narrationWords, phraseTokens } from "./words.ts";

const isEdgePoint = Schema.is(EdgeSchema);

const names = (values: readonly string[]): string =>
  values.length === 0 ? "none" : oneOf(values);

/** `did you mean` for an id: the nearest id, written as the author would. */
const nearest = (found: string, known: readonly string[]): string | undefined =>
  didYouMean(found, known);

const elementIds = (scene: Scene): readonly string[] =>
  Arr.map(scene.elements, (element) => element.id);

/** Where a check stands: the line of the effect or derived event it is about. */
interface Place {
  readonly line: number;
}

const unknown = (
  scene: Scene,
  place: Place,
  what: string,
  found: string,
  known: readonly string[]
): PlanError =>
  planError(
    "UnknownReference",
    place.line,
    problem(
      `${what} "${found}" is not in Scene ${scene.id}`,
      names(known),
      nearest(found, known)
    )
  );

/** The Elements `show` and `focus` name, and the rules of `show`. */
const targetErrors = (scene: Scene, effect: Effect): readonly PlanError[] => {
  const { target } = effect;

  if (target === undefined) {
    return [];
  }

  const element = elementOf(scene, target);

  if (element === undefined) {
    return [unknown(scene, effect, "Element", target, elementIds(scene))];
  }

  if (effect.verb === "show" && element.visible) {
    return [
      planError(
        "BadShow",
        effect.line,
        problem(
          `show of Element "${target}", which is visible`,
          `an Element with visible=false (line ${element.line}), or a focus effect`
        )
      ),
    ];
  }

  return [];
};

/** Hidden Elements need exactly one `show`. */
const hiddenErrors = (scene: Scene): readonly PlanError[] =>
  Arr.flatMap(scene.elements, (element) => {
    if (element.visible) {
      return [];
    }

    const shows = Arr.filter(
      scene.effects,
      (effect) => effect.verb === "show" && effect.target === element.id
    );

    if (shows.length === 0) {
      return [
        planError(
          "HiddenNeverRevealed",
          element.line,
          problem(
            `Element "${element.id}" is visible=false and no effect shows it`,
            `a line of the [[effects]] block: r1: show ${element.id} at word("<phrase>").end`
          )
        ),
      ];
    }

    const [first, second] = shows;

    return second === undefined
      ? []
      : [
          planError(
            "BadShow",
            second.line,
            problem(
              `Element "${element.id}" is shown twice (effects ${first?.id ?? ""} and ${second.id})`,
              "one show effect for each visible=false Element"
            )
          ),
        ];
  });

const wordErrors = (
  scene: Scene,
  place: Place,
  anchor: Extract<Anchor, { kind: "word" }>
): readonly PlanError[] => {
  const found = findPhrase(scene.lines, anchor.phrase);
  const text = formatAnchor(anchor);

  if (found.length === 0) {
    const first = phraseTokens(anchor.phrase)[0] ?? anchor.phrase;
    const close = nearest(first, narrationWords(scene.lines));

    // The words are there, one after the other, but not inside one Line: say the rule, not only that it is missing.
    const spans =
      findPhrase(
        [{ words: Arr.flatMap(scene.lines, (line) => line.words) }],
        anchor.phrase
      ).length > 0;

    return [
      planError(
        "UnknownReference",
        place.line,
        spans
          ? problem(
              `${text}: "${anchor.phrase}" runs from the end of one Line into the start of the next (a phrase must stay within one Line)`,
              "words that stand next to each other in one Line",
              close === undefined
                ? undefined
                : `word("${Str.toLowerCase(close)}")`
            )
          : problem(
              `${text}: the narration of Scene ${scene.id} has no "${anchor.phrase}"`,
              "words that the Lines of this Scene say",
              close === undefined
                ? undefined
                : `word("${Str.toLowerCase(close)}")`
            )
      ),
    ];
  }

  if (!anchor.explicit && found.length > 1) {
    return [
      planError(
        "AmbiguousWord",
        place.line,
        problem(
          `word("${anchor.phrase}") occurs ${found.length} times in Scene ${scene.id}`,
          "the occurrence you mean",
          `word("${anchor.phrase}", 1) to word("${anchor.phrase}", ${found.length})`
        )
      ),
    ];
  }

  return anchor.occurrence > found.length
    ? [
        planError(
          "UnknownReference",
          place.line,
          problem(
            `${text}: occurrence ${anchor.occurrence}, but the phrase occurs ${found.length} time${found.length === 1 ? "" : "s"}`,
            `an occurrence from 1 to ${found.length}`
          )
        ),
      ]
    : [];
};

/** What an Element needs for an event to happen in a Scene that is joined to the previous one by `> AUTO-ANIMATE`. */
const needs = {
  enter: "an Element that the previous Scene lacks",
  exit: "an Element of the previous Scene that this Scene lacks",
  move: "a cell that differs from the previous Scene",
  update: "a class or text that differs from the previous Scene",
};

const needFor = (
  table: Readonly<Record<string, string>>,
  event: string
): string => Option.getOrElse(Record.get(table, event), () => "a change");

const eventsOf = (scene: Scene, id: string): string => {
  const happening = Arr.filter(
    elementEvents,
    (event) => eventKind(scene, id, event) !== undefined
  );

  return happening.length === 0
    ? "no event in this Scene"
    : Arr.join(happening, ", ");
};

/** Why an Element has no `event` in this Scene: what was found and what was expected. */
const missingEvent = (scene: Scene, id: string, event: string) => {
  const element = elementOf(scene, id);

  if (element !== undefined && !element.visible) {
    return {
      expected: `a show effect for ${id} (hidden Elements have enter, from their show effect, and nothing else)`,
      found: `${id}.${event} on Element "${id}", which is visible=false${event === "enter" ? " and has no show effect" : ""}`,
    };
  }

  if (scene.identity === null) {
    return {
      expected:
        "enter (an Element of a Scene that is not > AUTO-ANIMATE only enters with the slide)",
      found: `${id}.${event}: Scene ${scene.id} is not > AUTO-ANIMATE, so Elements only enter`,
    };
  }

  return {
    expected: `${needFor(needs, event)} (${id} has ${eventsOf(scene, id)})`,
    found: `Element "${id}" has no ${event} in Scene ${scene.id}`,
  };
};

const missing = (
  scene: Scene,
  place: Place,
  id: string,
  event: string
): PlanError => {
  const { expected, found } = missingEvent(scene, id, event);

  return planError("NoSuchEvent", place.line, problem(found, expected));
};

const machineOf = (
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

/** Whether an Element's machine reaches `state` in the Scene: which transitions happen, in declaration order. */
const reachesState = (scene: Scene, id: string, state: string): boolean => {
  const machine = machineOf(state, "state");

  if (machine === undefined) {
    return false;
  }

  const happenings = Arr.flatMap(machine.transitions, ({ name }, index) =>
    eventKind(scene, id, name) === undefined
      ? []
      : [{ name, window: { end: index * 10 + 5, start: index * 10 + 1 } }]
  );

  return reaches(
    occupancies(machine, initialState(scene, id, machine), happenings, {
      end: 1000,
      start: 0,
    }),
    state
  );
};

const elementErrors = (
  scene: Scene,
  place: Place,
  id: string,
  anchor: Extract<Anchor, { kind: "edge" | "occupancy" }>
): readonly PlanError[] => {
  const ids = [...elementIds(scene), ...(scene.identity?.exit ?? [])];

  if (!ids.includes(id)) {
    return [unknown(scene, place, "Element", id, ids)];
  }

  if (anchor.kind === "edge") {
    return eventKind(scene, id, anchor.transition) === undefined
      ? [missing(scene, place, id, anchor.transition)]
      : [];
  }

  return reachesState(scene, id, anchor.state)
    ? []
    : [
        planError(
          "NoSuchEvent",
          place.line,
          problem(
            `Element "${id}" is never ${anchor.state} in Scene ${scene.id}`,
            `a state ${id} reaches: its events are ${eventsOf(scene, id)}`
          )
        ),
      ];
};

const effectErrors = (
  scene: Scene,
  place: Place,
  id: string,
  anchor: Extract<Anchor, { kind: "edge" | "occupancy" }>
): readonly PlanError[] => {
  const target = effectOf(scene, id);

  if (target === undefined) {
    return [
      unknown(
        scene,
        place,
        "effect",
        id,
        Arr.map(scene.effects, (other) => other.id)
      ),
    ];
  }

  // A sound plays to its own end, which the plan does not know: only its start is an event.
  const needsEnd =
    target.verb === "sound" &&
    (anchor.kind === "edge"
      ? anchor.at !== "start"
      : anchor.state !== "idle" && anchor.state !== "active");

  return needsEnd
    ? [
        planError(
          "UnsupportedEdge",
          place.line,
          `${formatAnchor(anchor)}: a sound has no end (it plays to its own end, which the plan does not know); use ${id}.start`
        ),
      ]
    : [];
};

/** The most States the Scene can have: one, and one more for each step (a Beat leads to each). */
const maxStates = (scene: Scene): number =>
  1 + Arr.filter(scene.effects, isStep).length;

const numberedError = (
  scene: Scene,
  place: Place,
  what: string,
  n: number,
  most: number
): readonly PlanError[] =>
  n > most
    ? [
        planError(
          "UnknownReference",
          place.line,
          problem(
            `${what}(${n}) in Scene ${scene.id}, which has at most ${most} (one State, and one more State and one Beat for each show or focus)`,
            `a number from 1 to ${most}`
          )
        ),
      ]
    : [];

const stateErrors = (
  scene: Scene,
  place: Place,
  n: number
): readonly PlanError[] =>
  numberedError(scene, place, anchorWords.state, n, maxStates(scene));

const machineAnchorErrors = (
  scene: Scene,
  place: Place,
  anchor: Extract<Anchor, { kind: "edge" | "occupancy" }>
): readonly PlanError[] =>
  Match.value(anchor.subject).pipe(
    Match.discriminatorsExhaustive("kind")({
      beat: (subject) =>
        numberedError(
          scene,
          place,
          anchorWords.beat,
          subject.n,
          maxStates(scene) - 1
        ),
      effect: (subject) => effectErrors(scene, place, subject.id, anchor),
      element: (subject) => elementErrors(scene, place, subject.id, anchor),
      scene: () => [],
      state: (subject) => stateErrors(scene, place, subject.n),
    })
  );

const anchorWindowed = (scene: Scene, anchor: Anchor): boolean => {
  if (anchor.kind !== "edge") {
    return true;
  }

  return Match.value(anchor.subject).pipe(
    Match.discriminatorsExhaustive("kind")({
      beat: () => true,
      effect: (subject) => effectOf(scene, subject.id)?.verb !== "sound",
      element: (subject) => {
        const kind = eventKind(scene, subject.id, anchor.transition);

        return kind === undefined ? true : hasWindow(scene, kind);
      },
      scene: () => scene.transition !== "cut",
      state: () => true,
    })
  );
};

/** Whether the event has a window to take a percent of (an instant has none). */
const windowed = (
  scene: Scene,
  lets: ReadonlyMap<string, EventExpr>,
  expr: EventExpr
): boolean =>
  Match.value(expr).pipe(
    Match.discriminatorsExhaustive("kind")({
      all: (found) =>
        Arr.every(found.of, (operand) => windowed(scene, lets, operand)),
      anchor: ({ anchor }) => anchorWindowed(scene, anchor),
      each: (found) =>
        Arr.every(found.of, (operand) => windowed(scene, lets, operand)),
      first: (found) =>
        Arr.every(found.of, (operand) => windowed(scene, lets, operand)),
      ref: (found) => {
        const body = lets.get(found.name);

        return body === undefined ? true : windowed(scene, lets, body);
      },
      shift: (found) => windowed(scene, lets, found.of),
      within: (found) => windowed(scene, lets, found.of),
    })
  );

const percentError = (place: Place, text: string, what: string): PlanError =>
  planError(
    "BadPercent",
    place.line,
    problem(
      `${what} on ${text}, which has no window (it is an instant)`,
      "start or end, or a percent of a move, an update, a show, a focus, or the transition of a Scene that is not > CUT"
    )
  );

/** The percent points and percent offsets of an expression that sit on an event with no window. */
const percentErrors = (
  scene: Scene,
  lets: ReadonlyMap<string, EventExpr>,
  place: Place,
  expr: EventExpr
): readonly PlanError[] =>
  Match.value(expr).pipe(
    Match.discriminatorsExhaustive("kind")({
      all: (found) =>
        Arr.flatMap(found.of, (operand) =>
          percentErrors(scene, lets, place, operand)
        ),
      anchor: ({ anchor }) =>
        anchor.kind === "edge" &&
        !isEdgePoint(anchor.at) &&
        !anchorWindowed(scene, anchor)
          ? [
              percentError(
                place,
                formatAnchor(anchor),
                `percent point ${anchor.at.percent}%`
              ),
            ]
          : [],
      each: (found) =>
        Arr.flatMap(found.of, (operand) =>
          percentErrors(scene, lets, place, operand)
        ),
      first: (found) =>
        Arr.flatMap(found.of, (operand) =>
          percentErrors(scene, lets, place, operand)
        ),
      ref: () => [],
      shift: (found) => [
        ...(found.offset.unit === "percent" && !windowed(scene, lets, found.of)
          ? [
              percentError(
                place,
                formatEvent(found.of),
                `percent offset ${found.offset.value}%`
              ),
            ]
          : []),
        ...percentErrors(scene, lets, place, found.of),
      ],
      within: (found) => percentErrors(scene, lets, place, found.of),
    })
  );

const refErrors = (
  scene: Scene,
  place: Place,
  expr: EventExpr
): readonly PlanError[] =>
  Arr.flatMap(refsOf(expr), (name) =>
    Arr.some(scene.events, (derived) => derived.name === name)
      ? []
      : [
          unknown(
            scene,
            place,
            "derived event",
            name,
            Arr.map(scene.events, (derived) => derived.name)
          ),
        ]
  );

/** The most occurrences an event can have: only `each` (and an effect that fires several times) multiplies them. */
const occurrences = (scene: Scene, expr: EventExpr, depth: number): number =>
  depth > 20
    ? 1
    : Match.value(expr).pipe(
        Match.discriminatorsExhaustive("kind")({
          all: () => 1,
          anchor: ({ anchor }) => {
            if (anchor.kind === "word" || anchor.subject.kind !== "effect") {
              return 1;
            }

            const target = effectOf(scene, anchor.subject.id);

            return target === undefined || "absoluteFlicks" in target.when
              ? 1
              : occurrences(scene, target.when.event, depth + 1);
          },
          each: (found) =>
            Arr.reduce(
              found.of,
              0,
              (total, operand) => total + occurrences(scene, operand, depth + 1)
            ),
          first: () => 1,
          ref: (found) =>
            Option.match(
              Arr.findFirst(
                scene.events,
                (derived) => derived.name === found.name
              ),
              {
                onNone: () => 1,
                onSome: (derived) =>
                  occurrences(scene, derived.event, depth + 1),
              }
            ),
          shift: (found) => occurrences(scene, found.of, depth + 1),
          within: (found) => occurrences(scene, found.of, depth + 1),
        })
      );

const onceErrors = (scene: Scene, effect: Effect): readonly PlanError[] => {
  if (
    "absoluteFlicks" in effect.when ||
    verbArguments[effect.verb].instances !== "one"
  ) {
    return [];
  }

  const count = occurrences(scene, effect.when.event, 0);

  return count > 1
    ? [
        planError(
          "BadEffect",
          effect.line,
          problem(
            `${effect.id}: ${effect.written} can happen ${count} times, but a ${effect.verb} happens once`,
            "first(...) or all(...) to pick one moment (only a sound runs once for each occurrence)"
          )
        ),
      ]
    : [];
};

/** The reference, machine, percent and State errors of one event, written where it stands. */
const eventErrors = (
  scene: Scene,
  lets: ReadonlyMap<string, EventExpr>,
  place: Place,
  expr: EventExpr
): readonly PlanError[] => [
  ...Arr.flatMap(anchorsOf(expr), (anchor) =>
    anchor.kind === "word"
      ? wordErrors(scene, place, anchor)
      : machineAnchorErrors(scene, place, anchor)
  ),
  ...refErrors(scene, place, expr),
  ...Arr.flatMap(statesOf(expr), (n) => stateErrors(scene, place, n)),
  ...percentErrors(scene, lets, place, expr),
];

/** Whether an anchor names the appearance of a hidden Element: its `enter`, or a state it reaches by entering. */
const anchorsEnter = (
  anchor: Extract<Anchor, { kind: "edge" | "occupancy" }>
): boolean =>
  anchor.kind === "edge"
    ? anchor.transition === "enter"
    : anchor.state === "entering" ||
      anchor.state === "present" ||
      anchor.state === "absent";

const stepIds = (scene: Scene): readonly string[] =>
  Arr.map(Arr.filter(scene.effects, isStep), (effect) => effect.id);

/** What an effect or a derived event waits for: other effects, derived events, and the steps a State or Beat is made of. */
const dependencies = (scene: Scene, expr: EventExpr): readonly string[] => {
  const effects = Arr.flatMap(anchorsOf(expr), (anchor): readonly string[] => {
    if (anchor.kind === "word") {
      return [];
    }

    if (anchor.subject.kind === "effect") {
      return [anchor.subject.id];
    }

    if (anchor.subject.kind === "element") {
      const shown = showEffectOf(scene, anchor.subject.id);

      return shown !== undefined && anchorsEnter(anchor) ? [shown.id] : [];
    }

    return anchor.subject.kind === "scene" ? [] : stepIds(scene);
  });

  return [
    ...effects,
    ...refsOf(expr),
    ...(statesOf(expr).length > 0 ? stepIds(scene) : []),
  ];
};

/** A node of the dependency graph: an effect (its `at` and `until`) or a derived event. */
interface Node {
  readonly line: number;
  readonly name: string;
  readonly needs: readonly string[];
}

const nodesOf = (scene: Scene): readonly Node[] => [
  ...Arr.map(scene.effects, (effect): Node => ({
    line: effect.line,
    name: effect.id,
    needs: [
      ...("absoluteFlicks" in effect.when
        ? []
        : dependencies(scene, effect.when.event)),
      ...(effect.until === undefined
        ? []
        : dependencies(scene, effect.until.event)),
    ],
  })),
  ...Arr.map(scene.events, (derived): Node => ({
    line: derived.line,
    name: derived.name,
    needs: dependencies(scene, derived.event),
  })),
];

/** One error per cycle of effects and derived events that wait for each other. */
const cycleErrors = (scene: Scene): readonly PlanError[] => {
  const nodes = nodesOf(scene);
  const errors: PlanError[] = [];
  const done = new Set<string>();

  const visit = (node: Node, path: readonly string[]): void => {
    const at = path.indexOf(node.name);

    if (at !== -1) {
      const cycle = [...path.slice(at), node.name];

      const line = Math.min(
        ...Arr.flatMap(cycle, (name) =>
          Arr.map(
            Arr.filter(nodes, (other) => other.name === name),
            (other) => other.line
          )
        )
      );

      errors.push(
        planError(
          "EffectCycle",
          line,
          problem(
            `effects and derived events wait for each other: ${Arr.join(cycle, " -> ")}`,
            "a chain that ends at a word, the scene, the transition or an Element event (a step cannot be timed by a State or a Beat it opens)"
          )
        )
      );

      return;
    }

    if (done.has(node.name)) {
      return;
    }

    for (const name of node.needs) {
      const next = Arr.findFirst(nodes, (other) => other.name === name);

      if (Option.isSome(next)) {
        visit(next.value, [...path, node.name]);
      }
    }

    done.add(node.name);
  };

  for (const node of nodes) {
    visit(node, []);
  }

  return errors;
};

const lineErrors = (scene: Scene): readonly PlanError[] => {
  const lets = new Map(
    Arr.map(scene.events, (derived): [string, EventExpr] => [
      derived.name,
      derived.event,
    ])
  );

  return [
    ...Arr.flatMap(scene.effects, (effect) => [
      ...targetErrors(scene, effect),
      ...("absoluteFlicks" in effect.when
        ? []
        : eventErrors(scene, lets, effect, effect.when.event)),
      ...(effect.until === undefined
        ? []
        : eventErrors(scene, lets, effect, effect.until.event)),
      ...onceErrors(scene, effect),
    ]),
    ...Arr.flatMap(scene.events, (derived) =>
      eventErrors(scene, lets, derived, derived.event)
    ),
  ];
};

/** The errors of one Scene's effects and derived events. */
export const validateScene = (scene: Scene): readonly PlanError[] => [
  ...lineErrors(scene),
  ...hiddenErrors(scene),
  ...cycleErrors(scene),
];
