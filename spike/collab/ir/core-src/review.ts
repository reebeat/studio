// The review text of `reebeat plan` (design 4.0, modelled on `terraform plan`): per Scene its Elements with `+`
// (enter), `-` (exit) and `~` (update) across `> AUTO-ANIMATE` boundaries, its effects as `intent -> frame` (spec 0002),
// its Lines, and one summary line. Deterministic: the same Plan gives the same text. A plain function.
import { Array as Arr, Match, Option, String as Str } from "effect";

import type {
  Effect,
  Element,
  Identity,
  Line,
  PlanJson,
  Scene,
  TimedLine,
  TimedScene,
} from "./plan.ts";
import { soundsOf } from "./steps.ts";
import type { Carrier } from "./steps.ts";

export interface ReviewOptions {
  /** Adds frames and seconds from the Timeline (`reebeat plan --timing`). */
  readonly timing?: boolean;
}

const verbWidth = "update".length;

// A minimum id column, so adding an Element with a short id re-aligns no other row of the golden text.
const minimumIdWidth = 12;

const quote = (text: string): string => JSON.stringify(text);

const describe = (element: Element): string =>
  Arr.join(
    [
      `@${element.cell}`,
      `.${element.class}`,
      ...(element.visible ? [] : ["hidden"]),
      quote(element.text),
    ],
    " "
  );

const changeText = (
  change: Identity["update"][number]["changes"][number],
  before: Element,
  after: Element
): string => {
  if (change === "cell") {
    return `cell ${before.cell}→${after.cell}`;
  }

  if (change === "class") {
    return `class ${before.class}→${after.class}`;
  }

  return `text ${quote(before.text)}→${quote(after.text)}`;
};

const elementRow = (
  mark: string,
  id: string,
  verb: string,
  rest: string,
  idWidth: number
): string =>
  `      ${mark} ${Str.padEnd(idWidth)(id)}  ${Str.padEnd(verbWidth)(verb)}  ${rest}`;

const widest = (ids: readonly string[]): number =>
  Arr.reduce(ids, minimumIdWidth, (width, id) => Math.max(width, id.length));

const byId = (elements: readonly Element[]): ReadonlyMap<string, Element> =>
  new Map(Arr.map(elements, (element) => [element.id, element]));

const described = (
  elements: ReadonlyMap<string, Element>,
  id: string
): string =>
  Option.match(Option.fromNullishOr(elements.get(id)), {
    onNone: () => "",
    onSome: describe,
  });

/** The Element rows of a Scene joined to the previous one by `> AUTO-ANIMATE`: exit, update, same, enter. */
const diffRows = (
  scene: Scene,
  previous: Scene,
  identity: Identity
): readonly string[] => {
  const before = byId(previous.elements);
  const after = byId(scene.elements);

  const width = widest([
    ...identity.exit,
    ...Arr.map(identity.update, (change) => change.id),
    ...identity.same,
    ...identity.enter,
  ]);

  return [
    ...Arr.map(identity.exit, (id) =>
      elementRow("-", id, "exit", described(before, id), width)
    ),
    ...Arr.map(identity.update, ({ changes, id }) => {
      const earlier = before.get(id);
      const later = after.get(id);

      const text =
        earlier === undefined || later === undefined
          ? ""
          : Arr.join(
              Arr.map(changes, (change) => changeText(change, earlier, later)),
              ", "
            );

      return elementRow("~", id, "update", text, width);
    }),
    ...Arr.map(identity.same, (id) =>
      elementRow(" ", id, "same", described(after, id), width)
    ),
    ...Arr.map(identity.enter, (id) =>
      elementRow("+", id, "enter", described(after, id), width)
    ),
  ];
};

const elementRows = (
  scene: Scene,
  previous: Scene | undefined
): readonly string[] => {
  if (scene.identity !== null && previous !== undefined) {
    return diffRows(scene, previous, scene.identity);
  }

  const width = widest(Arr.map(scene.elements, (element) => element.id));

  return Arr.map(scene.elements, (element) =>
    elementRow(" ", element.id, "show", describe(element), width)
  );
};

const hintText = (plan: PlanJson, line: Line): string => {
  const parts = [
    ...(line.hints.speed === plan.settings.speed
      ? []
      : [`speed ${line.hints.speed}`]),
    ...(line.hints.pauseBefore === 0
      ? []
      : [`pause ${line.hints.pauseBefore} s`]),
  ];

  return parts.length === 0 ? "" : `  (${Arr.join(parts, ", ")})`;
};

const seconds = (plan: PlanJson, frames: number): string =>
  (frames / plan.settings.fps).toFixed(2);

const span = (plan: PlanJson, from: number, to: number): string =>
  `frames ${from}-${to} (${seconds(plan, from)}-${seconds(plan, to)} s)`;

const timedLineRows = (
  plan: PlanJson,
  timed: TimedLine | undefined
): readonly string[] =>
  timed === undefined
    ? []
    : [`        ${span(plan, timed.startFrame, timed.endFrame)}`];

const lineRows = (
  plan: PlanJson,
  line: Line,
  timed: TimedLine | undefined
): readonly string[] => [
  `      ${line.id}${hintText(plan, line)}`,
  `        ${quote(line.text)}`,
  ...timedLineRows(plan, timed),
];

/** What an effect does, as the review prints it: `sound whoosh`, `show note`. */
const doing = (effect: Effect): string =>
  `${effect.verb} ${effect.name ?? effect.target ?? ""}`;

/** Where the Deck plays a sound (`soundsOf`, the one rule the Deck and the check share), as the row says it. */
const carrierText = (carrier: Carrier): string =>
  Match.value(carrier).pipe(
    Match.discriminatorsExhaustive("kind")({
      alone: () => "plays alone",
      slide: () => "rides the slide",
      step: (found) => `rides step ${found.effectId}`,
    })
  );

/**
 * One row per effect: `s1  sound whoosh  one.move.start  ->  frame 732` (the frame once the Timeline exists), and
 * for a sound, where the Deck plays it: `(rides the slide)`, `(rides step r1)` or `(plays alone)`. The carrier needs
 * the resolved times (the nearest step before a word), so it is printed with the frames only.
 */
const effectRows = (
  plan: PlanJson,
  scene: Scene,
  timed: TimedScene | undefined
): readonly string[] => {
  const idWidth = Arr.reduce(scene.effects, 2, (width, effect) =>
    Math.max(width, effect.id.length)
  );

  const doingWidth = Arr.reduce(scene.effects, 0, (width, effect) =>
    Math.max(width, doing(effect).length)
  );

  const carriers = new Map(
    timed === undefined
      ? []
      : Arr.map(soundsOf(plan, scene), ({ carrier, effect }) => [
          effect.id,
          carrierText(carrier),
        ])
  );

  return Arr.map(scene.effects, (effect) => {
    const fire = Option.getOrUndefined(
      Arr.findFirst(
        timed?.effects ?? [],
        (candidate) => candidate.effectId === effect.id
      )
    )?.fireFrame;

    const carrier = carriers.get(effect.id);
    const when = `${Str.padEnd(doingWidth)(doing(effect))}  ${effect.written}`;
    const frame = fire === undefined ? "" : `  ->  frame ${fire}`;

    return `      ${Str.padEnd(idWidth)(effect.id)}  ${when}${frame}${carrier === undefined ? "" : `  (${carrier})`}`;
  });
};

const sceneRows = (
  plan: PlanJson,
  scene: Scene,
  previous: Scene | undefined,
  timed: TimedScene | undefined
): readonly string[] => {
  const into =
    scene.identity === null || previous === undefined
      ? scene.transition
      : `${scene.transition} from ${previous.id}`;

  return [
    `  Scene ${scene.id}  ${scene.heading}  (line ${scene.line}, transition: ${into})`,
    ...(timed === undefined
      ? []
      : [
          `    slide change at frame ${timed.slideFrame}, ${span(plan, timed.slideFrame, timed.endFrame)}`,
        ]),
    "    Elements",
    ...elementRows(scene, previous),
    ...(scene.effects.length === 0
      ? []
      : ["    Effects", ...effectRows(plan, scene, timed)]),
    "    Lines",
    ...Arr.flatMap(scene.lines, (line) =>
      lineRows(
        plan,
        line,
        Option.getOrUndefined(
          Arr.findFirst(
            timed?.lines ?? [],
            (candidate) => candidate.lineId === line.id
          )
        )
      )
    ),
  ];
};

/** Every absolute time of the Plan, with the Scene, the effect and the reason that was written. */
const absoluteRows = (plan: PlanJson): readonly string[] =>
  Arr.flatMap(plan.scenes, (scene) =>
    Arr.flatMap(scene.effects, (effect) =>
      "absoluteFlicks" in effect.when
        ? [
            `  ${scene.id} ${effect.id} (line ${effect.line}): at ${effect.written}`,
          ]
        : []
    )
  );

const summary = (plan: PlanJson): string => {
  const identities = Arr.flatMap(plan.scenes, (scene) =>
    scene.identity === null ? [] : [scene.identity]
  );

  const count = (pick: (identity: Identity) => number): number =>
    Arr.reduce(identities, 0, (total, identity) => total + pick(identity));

  const lines = Arr.reduce(
    plan.scenes,
    0,
    (total, scene) => total + scene.lines.length
  );

  const effects = Arr.reduce(
    plan.scenes,
    0,
    (total, scene) => total + scene.effects.length
  );

  const enter = count((identity) => identity.enter.length);
  const exit = count((identity) => identity.exit.length);
  const update = count((identity) => identity.update.length);

  return `Plan: ${plan.scenes.length} scenes, ${lines} lines, ${effects} effects; ${enter} to enter, ${exit} to exit, ${update} to update`;
};

const absoluteSummary = (plan: PlanJson): readonly string[] => {
  const rows = absoluteRows(plan);

  return [
    ...rows,
    `${rows.length} absolute time${rows.length === 1 ? "" : "s"}`,
  ];
};

const timingSummary = (plan: PlanJson): string =>
  plan.timeline === undefined
    ? "Timeline: none yet (it is added by build, once speech has aligned the Lines)"
    : `Timeline: ${plan.timeline.totalFrames} frames, ${seconds(plan, plan.timeline.totalFrames)} s at ${plan.settings.fps} fps`;

const timedScene = (plan: PlanJson, sceneId: string): TimedScene | undefined =>
  Option.getOrUndefined(
    Arr.findFirst(
      plan.timeline?.scenes ?? [],
      (candidate) => candidate.sceneId === sceneId
    )
  );

const chapterRows = (
  plan: PlanJson,
  chapter: PlanJson["chapters"][number],
  timing: boolean
): readonly string[] => [
  "",
  `Chapter ${chapter.id}  ${chapter.title}  (line ${chapter.line})`,
  ...(chapter.synopsis === undefined
    ? []
    : [`  Synopsis: ${chapter.synopsis}`]),
  ...Arr.flatMap(plan.scenes, (scene, index) =>
    scene.chapterId === chapter.id
      ? sceneRows(
          plan,
          scene,
          plan.scenes[index - 1],
          timing ? timedScene(plan, scene.id) : undefined
        )
      : []
  ),
];

/**
 * The review text of a Plan. Scenes list their Elements once, with `+ - ~` marks (and a blank mark for `same`)
 * when they are joined to the previous Scene by `> AUTO-ANIMATE`, then their effects (with frames when `timing` and a
 * Timeline are there). The last line counts the absolute times; each is listed with its reason above it.
 */
export const reviewText = (
  plan: PlanJson,
  options: ReviewOptions = {}
): string => {
  const timing = options.timing === true;

  return Arr.join(
    [
      `Story: ${plan.title}${plan.author === undefined ? "" : ` (${plan.author})`}`,
      `Source: sha256 ${plan.sourceSha256}`,
      `Speech rate: ${plan.settings.speed} (a Line that differs says so)`,
      ...Arr.flatMap(plan.chapters, (chapter) =>
        chapterRows(plan, chapter, timing)
      ),
      "",
      summary(plan),
      ...(timing ? [timingSummary(plan)] : []),
      ...absoluteSummary(plan),
      "",
    ],
    "\n"
  );
};
