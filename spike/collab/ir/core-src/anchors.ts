// Anchors that name a machine (spec 0004), read and written through `vocabulary` of `machines.ts` and nothing else: a
// path is read only through the generated forms, and `formatAnchor` writes one back the way an author spells it. A path
// that is not in the vocabulary is a Plan error that says what was found, what is expected and the nearest valid
// spelling. The one source that is not a machine is a word of the narration (`word("x").end`), written here and read by
// `expr.ts`. Plain functions.
import {
  Array as Arr,
  Match,
  Option,
  Result,
  Schema,
  String as Str,
  pipe,
} from "effect";

import { planError } from "./errors.ts";
import type { PlanError } from "./errors.ts";
import {
  anchorFormsText,
  anchorWords,
  didYouMean,
  percentPattern,
  problem,
} from "./grammar.ts";
import { aliases, percentToken, spelled, vocabulary } from "./machines.ts";
import type { Form, SubjectKind } from "./machines.ts";
import { EdgeSchema } from "./plan.ts";
import type { Anchor, Point, Subject } from "./plan.ts";

const isEdge = Schema.is(EdgeSchema);

const bad = (line: number, message: string): PlanError =>
  planError("BadEffect", line, message);

const percentOf = (token: string): number | undefined => {
  const value = percentPattern.exec(token)?.groups?.value;

  return value === undefined ? undefined : Number(value);
};

const tokenMatches = (token: string, expected: string): boolean =>
  expected === percentToken
    ? percentOf(token) !== undefined
    : token === expected;

/** The form whose tail is `tail`, for one kind of subject; a progress form only when `progress` allows it. */
const formOf = (
  subject: SubjectKind,
  tail: readonly string[],
  progress: boolean
): Option.Option<Form> =>
  Arr.findFirst(
    vocabulary,
    (form) =>
      form.machine.subject === subject &&
      (form.kind === "progress") === progress &&
      form.tail.length === tail.length &&
      Arr.every(form.tail, (expected, index) =>
        tokenMatches(tail[index] ?? "", expected)
      )
  );

/** Replaces the prefix of a path an alias spells by what it stands for (`transition.50%` is `scene.transition.50%`). */
const expandAlias = (tokens: readonly string[]): readonly string[] =>
  Option.match(
    Arr.findFirst(
      aliases,
      (alias) =>
        tokens.length >= alias.spelled.length &&
        Arr.every(alias.spelled, (word, index) => tokens[index] === word)
    ),
    {
      onNone: () => tokens,
      onSome: (alias) => [
        ...alias.for,
        ...Arr.drop(tokens, alias.spelled.length),
      ],
    }
  );

/** The spelling an alias gives a canonical path, if one does (`scene.shown.leave` is `scene.end`). */
const aliased = (path: readonly string[]): readonly string[] =>
  Option.match(
    Arr.findFirst(
      aliases,
      (alias) =>
        path.length >= alias.for.length &&
        Arr.every(alias.for, (word, index) => path[index] === word)
    ),
    {
      onNone: () => path,
      onSome: (alias) => [
        ...alias.spelled,
        ...Arr.drop(path, alias.for.length),
      ],
    }
  );

const numberedPattern = new RegExp(
  String.raw`^(?<word>${anchorWords.beat}|${anchorWords.state})\((?<n>\d+)\)$`,
  "u"
);

/** What the first token of a path stands for: the Scene, a State or a Beat by number, or an Element or effect by id. */
type Head =
  | { readonly kind: "scene" }
  | { readonly kind: "beat"; readonly n: number }
  | { readonly kind: "state"; readonly n: number }
  | { readonly id: string; readonly kind: "name" };

const headOf = (token: string): Head => {
  const found = numberedPattern.exec(token)?.groups;

  if (found?.n !== undefined) {
    return {
      kind: found.word === anchorWords.beat ? "beat" : "state",
      n: Number(found.n),
    };
  }

  return token === anchorWords.scene
    ? { kind: "scene" }
    : { id: token, kind: "name" };
};

/** The kinds of subject a head may be: an id is an Element or an effect, and the form decides which. */
const subjectKindsOf = (head: Head): readonly SubjectKind[] =>
  Match.value(head).pipe(
    Match.discriminatorsExhaustive("kind")({
      beat: (): readonly SubjectKind[] => ["beat"],
      name: (): readonly SubjectKind[] => ["element", "effect"],
      scene: (): readonly SubjectKind[] => ["scene"],
      state: (): readonly SubjectKind[] => ["state"],
    })
  );

const subjectOf = (head: Head, form: Form): Subject =>
  Match.value(head).pipe(
    Match.discriminatorsExhaustive("kind")({
      beat: (found): Subject => ({ kind: "beat", n: found.n }),
      name: (found): Subject => ({
        id: found.id,
        kind: form.machine.subject === "effect" ? "effect" : "element",
      }),
      scene: (): Subject => ({ kind: "scene" }),
      state: (found): Subject => ({ kind: "state", n: found.n }),
    })
  );

const pointOf = (form: Form, percent: number | undefined): Point =>
  form.kind === "edge" && form.point !== "percent"
    ? form.point
    : { percent: percent ?? 0 };

const anchorOf = (
  head: Head,
  form: Form,
  percent: number | undefined
): Anchor =>
  form.kind === "state"
    ? {
        event: form.event,
        kind: "occupancy",
        state: form.state.name,
        subject: subjectOf(head, form),
      }
    : {
        at: pointOf(form, percent),
        kind: "edge",
        subject: subjectOf(head, form),
        transition: form.transition.name,
      };

/** Every spelling of every form for the head `token`, aliases included: what `did you mean` chooses from. */
const spellingsFor = (head: Head, token: string): readonly string[] =>
  Arr.flatMap(
    Arr.filter(vocabulary, (form) =>
      Arr.contains(subjectKindsOf(head), form.machine.subject)
    ),
    (form: Form): readonly string[] => {
      const path = [token, ...form.tail];

      return [
        spelled(token, form),
        ...Arr.flatMap(aliases, (alias) =>
          Arr.join(Arr.take(path, alias.for.length), ".") ===
          Arr.join(alias.for, ".")
            ? [
                Arr.join(
                  [...alias.spelled, ...Arr.drop(path, alias.for.length)],
                  "."
                ),
              ]
            : []
        ),
      ];
    }
  );

const trailingPercent = /(?<number>\d+(?:\.\d+)?)%$/u;

/** `near` with the percent the author wrote put back where the placeholder stands. */
const withNumber = (
  near: string | undefined,
  number: string | undefined
): string | undefined =>
  near === undefined || number === undefined
    ? near
    : Str.replace(percentToken, `${number}%`)(near);

const noMoment = (path: string, line: number, head: Head): PlanError => {
  const number = trailingPercent.exec(path)?.groups?.number;

  const normal =
    number === undefined ? path : Str.replace(`${number}%`, percentToken)(path);

  const [token] = Str.split(path, ".");

  return bad(
    line,
    problem(
      `"${path}" names no moment of a declared machine`,
      anchorFormsText,
      withNumber(didYouMean(normal, spellingsFor(head, token)), number)
    )
  );
};

/**
 * Reads a dotted path as an anchor through the generated vocabulary. `progress` says that the path ends in the
 * behaviour of a transition (`one.move.progress`), which only `when(... >= N%)` accepts; its percent is read there.
 */
export const readAnchorPath = (
  path: string,
  line: number,
  progress = false
): Result.Result<Anchor, PlanError> => {
  const [headToken = "", ...tail] = expandAlias(Str.split(path, "."));
  const head = headOf(headToken);

  const found = Arr.head(
    Arr.flatMap(subjectKindsOf(head), (subject) =>
      Option.toArray(formOf(subject, tail, progress))
    )
  );

  return Option.match(found, {
    onNone: () => Result.fail(noMoment(path, line, head)),
    onSome: (form) =>
      Result.succeed(anchorOf(head, form, percentOf(tail.at(-1) ?? ""))),
  });
};

const pointText = (point: Point): string =>
  isEdge(point) ? point : `${point.percent}%`;

const headText = (subject: Subject): string =>
  Match.value(subject).pipe(
    Match.discriminatorsExhaustive("kind")({
      beat: (found) => `${anchorWords.beat}(${found.n})`,
      effect: (found) => found.id,
      element: (found) => found.id,
      scene: () => anchorWords.scene,
      state: (found) => `${anchorWords.state}(${found.n})`,
    })
  );

/** The canonical path of an anchor that names a machine: head, then the tail of its form. */
const pathOf = (
  anchor: Anchor & { readonly kind: "edge" | "occupancy" }
): readonly string[] => {
  const head = headText(anchor.subject);

  return anchor.kind === "occupancy"
    ? Option.match(
        Arr.findFirst(
          vocabulary,
          (form) =>
            form.kind === "state" &&
            form.state.name === anchor.state &&
            form.event === anchor.event &&
            form.machine.subject === anchor.subject.kind
        ),
        { onNone: () => [head], onSome: (form) => [head, ...form.tail] }
      )
    : Option.match(
        Arr.findFirst(
          vocabulary,
          (form) =>
            form.kind === "edge" &&
            form.transition.name === anchor.transition &&
            form.machine.subject === anchor.subject.kind
        ),
        {
          onNone: () => [head],
          onSome: (form) => [
            head,
            ...Arr.dropRight(form.tail, 1),
            pointText(anchor.at),
          ],
        }
      );
};

/**
 * The anchor as an author writes it, through the aliases: `one.move.50%`, `scene.end`, `transition.start`,
 * `word("matches").end`. A word omits its occurrence when it is the first, unless `explicit` asks for it.
 */
export const formatAnchor = (anchor: Anchor, explicit = false): string =>
  anchor.kind === "word"
    ? `${anchorWords.word}("${anchor.phrase}"${anchor.occurrence === 1 && !explicit && !anchor.explicit ? "" : `, ${anchor.occurrence}`}).${anchor.edge}`
    : pipe(pathOf(anchor), aliased, Arr.join("."));
