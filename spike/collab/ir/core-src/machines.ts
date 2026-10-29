// The state machines of spec 0004, declared once as data. A machine says which states a thing passes through and which
// timed transitions connect them; everything an author can anchor to is GENERATED from these declarations by
// `vocabulary`: each transition yields a start, an end, N percent of the way and a progress behaviour, each state an
// enter and a leave event. The parser (`anchors.ts`), the linter, the `Anchor` schema of `plan.ts` and the grammar
// document read the declarations and never list an event of their own. Which transitions HAPPEN in a Scene is not
// here: for an Element it comes from the identity diff (`events.ts`), for an effect from its own timing and for the
// Scene from the sequence of Scenes; WHEN they happen comes from the renderer's declared lifecycle (`plan.ts`).
// Plain data and plain functions.
import { Array as Arr } from "effect";

/** What has a machine: an Element, an effect, the Scene (its slide change), a State of a Scene, a Beat between States. */
export const subjectKinds = [
  "element",
  "effect",
  "scene",
  "state",
  "beat",
] as const;

export type SubjectKind = (typeof subjectKinds)[number];

/**
 * What the behaviour of a transition looks like, from 0 to 1 over its window: `time` is linear in time, `eased` follows
 * the easing the renderer declares (`RendererLifecycle.matched.easing`).
 */
export const progressKinds = ["time", "eased"] as const;

export type ProgressKind = (typeof progressKinds)[number];

/** A timed edge: it starts when the machine leaves `from`, spends its window in `during` and ends in `to`. */
export interface Transition {
  /** The state the machine is in for the window of the transition. */
  readonly during: string;
  /** True: the name is not written (`r1.start`, not `r1.run.start`); only for the one transition of a machine. */
  readonly elide?: true;
  readonly from: string;
  /** What the transition is, in a sentence: the document and the messages print it. */
  readonly means: string;
  readonly name: string;
  readonly progress: ProgressKind;
  readonly to: string;
}

/** An alternative spelling of a path (head included): a prefix of the path is replaced by another. */
export interface Alias {
  readonly for: readonly string[];
  readonly spelled: readonly string[];
}

/** A state of a machine and what being in it means. */
export interface State {
  readonly means: string;
  readonly name: string;
}

export interface Machine {
  readonly aliases: readonly Alias[];
  readonly id: string;
  readonly initial: string;
  /** The names of the enter and the leave event of a state, as they are written. */
  readonly stateEvents: { readonly enter: string; readonly leave: string };
  /** True: the name of the one state is not written (`state(2).enter`). */
  readonly stateElided: boolean;
  readonly states: readonly State[];
  readonly subject: SubjectKind;
  readonly transitions: readonly Transition[];
}

const enterLeave = { enter: "enter", leave: "leave" } as const;

/** An Element's presence in a Scene: `enter` and `exit` come from the identity diff and from the `show` effect. */
const presence: Machine = {
  aliases: [],
  id: "presence",
  initial: "absent",
  stateElided: false,
  stateEvents: enterLeave,
  states: [
    { means: "the Element is not on the slide", name: "absent" },
    { means: "the Element is appearing", name: "entering" },
    { means: "the Element is on the slide", name: "present" },
    { means: "the Element is going away", name: "exiting" },
  ],
  subject: "element",
  transitions: [
    {
      during: "entering",
      from: "absent",
      means:
        "the Element appears: it is only in this Scene, or a show effect reveals it",
      name: "enter",
      progress: "time",
      to: "present",
    },
    {
      during: "exiting",
      from: "present",
      means: "the Element goes away: it is only in the previous Scene",
      name: "exit",
      progress: "time",
      to: "absent",
    },
  ],
};

/** An Element's place: `move` comes from a changed cell. */
const position: Machine = {
  aliases: [],
  id: "position",
  initial: "still",
  stateElided: false,
  stateEvents: enterLeave,
  states: [
    { means: "the Element stays in its cell", name: "still" },
    { means: "the Element is sliding to its new cell", name: "moving" },
  ],
  subject: "element",
  transitions: [
    {
      during: "moving",
      from: "still",
      means: "the Element slides to another cell: its cell changed",
      name: "move",
      progress: "eased",
      to: "still",
    },
  ],
};

/** An Element's look: `update` comes from a changed class or text. */
const style: Machine = {
  aliases: [],
  id: "style",
  initial: "steady",
  stateElided: false,
  stateEvents: enterLeave,
  states: [
    { means: "the Element keeps its class and text", name: "steady" },
    { means: "the Element is changing its class or text", name: "updating" },
  ],
  subject: "element",
  transitions: [
    {
      during: "updating",
      from: "steady",
      means: "the Element changes its class or its text",
      name: "update",
      progress: "eased",
      to: "steady",
    },
  ],
};

/**
 * An effect of a Scene: idle until its fire frame, active for its window, done after. Its one transition is not named
 * in the source: `r1.start`, `r1.end`. A `show` has the window the renderer declares, a `focus` runs to its `until` or
 * the end of the Scene and a `sound` has no window.
 */
const effect: Machine = {
  aliases: [],
  id: "effect",
  initial: "idle",
  stateElided: false,
  stateEvents: enterLeave,
  states: [
    { means: "the effect has not started", name: "idle" },
    { means: "the effect is running", name: "active" },
    { means: "the effect has ended", name: "done" },
  ],
  subject: "effect",
  transitions: [
    {
      during: "active",
      elide: true,
      from: "idle",
      means: "the effect runs: from its fire frame to the end of its window",
      name: "run",
      progress: "time",
      to: "done",
    },
  ],
};

/**
 * The slide change into a Scene, one step of the sequence of Scenes. `scene.start` is the frame the slide change is
 * shown (leaving `before`) and `scene.end` the Scene's last frame (leaving `shown`); `transition.<point>` is the
 * transition of the Scene.
 */
const slide: Machine = {
  aliases: [
    { for: ["scene", "transition"], spelled: ["transition"] },
    { for: ["scene", "before", "leave"], spelled: ["scene", "start"] },
    { for: ["scene", "shown", "leave"], spelled: ["scene", "end"] },
  ],
  id: "slide",
  initial: "before",
  stateElided: false,
  stateEvents: enterLeave,
  states: [
    { means: "the previous Scene is still shown", name: "before" },
    { means: "the slide change is running", name: "changing" },
    { means: "the Scene is shown", name: "shown" },
  ],
  subject: "scene",
  transitions: [
    {
      during: "changing",
      from: "before",
      means: "the slide change into this Scene",
      name: "transition",
      progress: "time",
      to: "shown",
    },
  ],
};

/**
 * The States of a Scene: a State is a declared set of Elements with their properties, and it HOLDS for a dwell
 * interval. State 1 opens with the Scene; each Beat leads to the next State. Its one state is the dwell itself, so its
 * name is not written: `state(2).enter` is the frame State 2 is reached (the end of the Beat before it) and
 * `state(2).leave` the frame it is left (the start of the Beat after it, or the last frame of the Scene).
 */
const dwell: Machine = {
  aliases: [],
  id: "dwell",
  initial: "dwell",
  stateElided: true,
  stateEvents: enterLeave,
  states: [{ means: "the State holds", name: "dwell" }],
  subject: "state",
  transitions: [],
};

/**
 * The Beats of a Scene: the transition the engine generates from one State to the next. Beat 1 leads from State 1 to
 * State 2 and starts at the first distinct fire frame of a `show` or `focus` after the Scene's first frame; its window
 * lasts as long as the slowest step that fires then (a `show` fades for the renderer's declared time, a `focus` is an
 * instant). Its start is the leave of the State before it and its end the enter of the State after it. The Beat into
 * a Scene from the previous Scene is the `transition` of the Scene.
 */
const beat: Machine = {
  aliases: [],
  id: "beat",
  initial: "waiting",
  stateElided: false,
  stateEvents: enterLeave,
  states: [
    { means: "the Beat has not started", name: "waiting" },
    { means: "the Beat is running", name: "changing" },
    { means: "the Beat is over", name: "done" },
  ],
  subject: "beat",
  transitions: [
    {
      during: "changing",
      elide: true,
      from: "waiting",
      means: "the Beat leads from one State of the Scene to the next",
      name: "change",
      progress: "time",
      to: "done",
    },
  ],
};

/** Every declared machine. */
export const machines: readonly Machine[] = [
  presence,
  position,
  style,
  effect,
  slide,
  dwell,
  beat,
];

/** The names of the transitions of an Element (`enter`, `exit`, `move`, `update`), in declaration order. */
export const elementEvents: readonly string[] = Arr.flatMap(
  [presence, position, style],
  (machine) => Arr.map(machine.transitions, ({ name }) => name)
);

/** The enter and the leave of a state, as the machines call them. */
export const stateEventNames = ["enter", "leave"] as const;

export type StateEventName = (typeof stateEventNames)[number];

/** One spelling generated from a machine. */
export type Form =
  | {
      readonly kind: "edge";
      readonly machine: Machine;
      readonly means: string;
      /** `start`, `end` or `<N>%`; the tail has the transition name unless it is elided. */
      readonly point: "start" | "end" | "percent";
      readonly tail: readonly string[];
      readonly transition: Transition;
    }
  | {
      readonly kind: "progress";
      readonly machine: Machine;
      readonly means: string;
      /** The tail has the transition name unless it is elided, then `progress`. */
      readonly tail: readonly string[];
      readonly transition: Transition;
    }
  | {
      readonly event: StateEventName;
      readonly kind: "state";
      readonly machine: Machine;
      readonly means: string;
      readonly state: State;
      readonly tail: readonly string[];
    };

/** The token that stands for a percent in a tail: `<N>%`. */
export const percentToken = "<N>%";

/** The token of the behaviour of a transition, read only inside `when(... >= N%)`. */
export const progressToken = "progress";

const edgeForms = (machine: Machine, transition: Transition): readonly Form[] =>
  Arr.map(
    [
      ["start", "the first frame of the window"],
      ["end", "the frame the window ends"],
      ["percent", "N percent of the way (the sugar of the progress threshold)"],
    ] as const,
    ([point, what]): Form => ({
      kind: "edge",
      machine,
      means: `${what}: ${transition.means}`,
      point,
      tail: [
        ...(transition.elide === true ? [] : [transition.name]),
        point === "percent" ? percentToken : point,
      ],
      transition,
    })
  );

const stateForms = (machine: Machine, state: State): readonly Form[] =>
  Arr.map(stateEventNames, (event): Form => ({
    event,
    kind: "state",
    machine,
    means: `the first frame the machine ${event === "enter" ? "enters" : "leaves"} this state (${state.means})`,
    state,
    tail: [
      ...(machine.stateElided ? [] : [state.name]),
      machine.stateEvents[event],
    ],
  }));

/**
 * Every spelling the declarations generate, in declaration order: for each transition its start, end and percent, then
 * its progress behaviour; for each state its enter and leave. This is the whole vocabulary of anchors that name a
 * machine (a word of the narration is the one source that is not).
 */
export const vocabulary: readonly Form[] = Arr.flatMap(machines, (machine) => [
  ...Arr.flatMap(machine.transitions, (transition) => [
    ...edgeForms(machine, transition),
    {
      kind: "progress",
      machine,
      means: `the progress of the transition, from 0 to 1: ${transition.means}`,
      tail: [
        ...(transition.elide === true ? [] : [transition.name]),
        progressToken,
      ],
      transition,
    } satisfies Form,
  ]),
  ...Arr.flatMap(machine.states, (state) => stateForms(machine, state)),
]);

/** The head of a spelling for a subject: the placeholder the document prints (`<id>`, `scene`, `beat(<n>)`). */
export const headPlaceholder: Readonly<Record<SubjectKind, string>> = {
  beat: "beat(<n>)",
  effect: "<id>",
  element: "<id>",
  scene: "scene",
  state: "state(<n>)",
};

/** The spelling of a form with `head` in front: `one.move.start`. */
export const spelled = (head: string, form: Form): string =>
  Arr.join([head, ...form.tail], ".");

/** Every alias of every machine. */
export const aliases: readonly Alias[] = Arr.flatMap(
  machines,
  (machine) => machine.aliases
);

/** Every transition name of every machine, once. */
export const transitionNames = Arr.dedupe(
  Arr.flatMap(machines, (machine) =>
    Arr.map(machine.transitions, ({ name }) => name)
  )
);

/** Every state name of every machine, once. */
export const stateNames = Arr.dedupe(
  Arr.flatMap(machines, (machine) =>
    Arr.map(machine.states, ({ name }) => name)
  )
);
