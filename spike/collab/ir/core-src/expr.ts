// Event expressions of the effects block (spec 0004), read and written:
//
//   event ::= term [ offset ]
//   term  ::= anchor | name | all(event, ...) | first(event, ...) | each(event, ..., [throttle=d] [stagger=d])
//           | within(event, state(n)) | when(<subject>.<transition>.progress >= N%)
//
// A recursive descent over the text after `at`, `until` or `=`, with positions; every problem is a Plan error that says
// what was found, what was expected and, when one is near, the nearest valid form (spec 0002, F2). The words and the
// units come from `grammar.ts`, the anchors from `anchors.ts`. Plain functions over `Result`.
import {
  Array as Arr,
  Option,
  Record,
  Result,
  Schema,
  String as Str,
  pipe,
} from "effect";

import { formatAnchor, readAnchorPath } from "./anchors.ts";
import { planError } from "./errors.ts";
import type { PlanError } from "./errors.ts";
import {
  anchorWords,
  combinatorWords,
  didYouMean,
  durationPattern,
  durationUnits,
  oneOf,
  optionWords,
  percentUnit,
  problem,
  progressWord,
  sourceUnits,
  offsetExamples,
  offsetPattern,
  keywords,
  reservedIds,
} from "./grammar.ts";
import { EdgeSchema, edges } from "./plan.ts";
import type { Duration, EventExpr, Offset } from "./plan.ts";
import { flicksPerSecond } from "./time.ts";

const bad = (line: number, message: string): PlanError =>
  planError("BadEffect", line, message);

/** A value read from `text` and the position after it. */
type Parsed<A> = Result.Result<readonly [A, number], PlanError>;

const isEdge = (found: string): found is (typeof edges)[number] =>
  Arr.contains(edges, found);

const charAt = (text: string, at: number): string =>
  Option.getOrElse(Str.charAt(at)(text), () => "");

const isEdgePoint = Schema.is(EdgeSchema);

/** `value` times `factor`, without the float noise of the product (`0.1 * 1000`). */
const scaled = (value: number, factor: number): number =>
  Number((value * factor).toFixed(6));

const skipSpaces = (text: string, at: number): number => {
  let position = at;

  while (position < text.length && /\s/u.test(charAt(text, position))) {
    position += 1;
  }

  return position;
};

const identifierPattern = /^[A-Za-z][A-Za-z0-9_-]*/u;

const wordOf = (text: string, at: number): string =>
  identifierPattern.exec(Str.slice(at)(text))?.[0] ?? "";

const isCall = (text: string, at: number, word: string): boolean =>
  wordOf(text, at) === word && charAt(text, at + word.length) === "(";

/** The offset `+100ms`, `-3f`, `+50%` as the Plan stores it. */
const readOffset = (
  token: string,
  line: number
): Result.Result<Offset, PlanError> => {
  const groups = offsetPattern.exec(token)?.groups;

  if (groups === undefined) {
    return Result.fail(
      bad(
        line,
        problem(
          `"${token}" after the event is not an offset`,
          `an offset such as ${oneOf(offsetExamples)}, "${keywords.until}" or nothing`
        )
      )
    );
  }

  const unit = Option.getOrUndefined(
    Arr.findFirst(sourceUnits, (candidate) => candidate.token === groups.unit)
  );

  if (unit === undefined) {
    return Result.fail(
      bad(
        line,
        problem(
          groups.unit === ""
            ? `offset "${token}" has no unit`
            : `unknown unit "${groups.unit ?? ""}" in offset "${token}"`,
          oneOf(Arr.map(sourceUnits, (known) => known.token)),
          didYouMean(
            groups.unit ?? "",
            Arr.map(sourceUnits, (known) => known.token)
          )
        )
      )
    );
  }

  const magnitude =
    unit.stored === "flicks"
      ? Math.round(scaled(Number(groups.value), unit.factor))
      : scaled(Number(groups.value), unit.factor);

  const signed = groups.sign === "-" ? -magnitude : magnitude;

  if (unit.stored === "f" && !Number.isInteger(signed)) {
    // The nearest whole form rounds the SIGNED value, as the schedule does (halves toward +infinity): -1.5f is -1f.
    const whole = Math.round(signed);

    return Result.fail(
      bad(
        line,
        problem(
          `frame offset "${token}" is not a whole number of frames`,
          "+Nf with an integer N, as +2f (seconds, milliseconds and percents may be decimal)",
          `${whole < 0 ? "-" : "+"}${Math.abs(whole)}f`
        )
      )
    );
  }

  return Result.succeed(
    unit.stored === "percent"
      ? { unit: "percent", value: signed }
      : { unit: unit.stored, value: signed }
  );
};

/** A duration `250ms`, `0.3s`, `6f` (`throttle=` and `stagger=`): a positive length of time. */
const readDuration = (
  token: string,
  line: number,
  option: string
): Result.Result<Duration, PlanError> => {
  const groups = durationPattern.exec(token)?.groups;

  const unit = Option.getOrUndefined(
    Arr.findFirst(
      durationUnits,
      (candidate) => candidate.token === groups?.unit
    )
  );

  if (groups === undefined || unit === undefined) {
    return Result.fail(
      bad(
        line,
        problem(
          `"${token}" after ${option}= is not a duration`,
          `a number and a unit, as ${oneOf(Arr.map(durationUnits, ({ example, token: unitToken }) => `${example}${unitToken}`))}`
        )
      )
    );
  }

  const value =
    unit.stored === "flicks"
      ? Math.round(scaled(Number(groups.value), unit.factor))
      : scaled(Number(groups.value), unit.factor);

  if (value <= 0 || (unit.stored === "f" && !Number.isInteger(value))) {
    return Result.fail(
      bad(
        line,
        problem(
          `"${token}" after ${option}= is not a positive duration (frames are whole numbers)`,
          "a duration longer than zero"
        )
      )
    );
  }

  return Result.succeed({ unit: unit.stored, value });
};

const edgeProblem = (found: string, line: number, what: string): PlanError =>
  bad(
    line,
    problem(
      `unknown edge "${found}" in ${what}`,
      oneOf(edges),
      didYouMean(found, edges)
    )
  );

/** `word("<phrase>"[, <n>]).<edge>` from `at` (which stands on `word`). */
const readWord = (
  text: string,
  at: number,
  line: number
): Parsed<EventExpr> => {
  const pattern = new RegExp(
    String.raw`^${anchorWords.word}\(\s*"(?<phrase>[^"]*)"\s*(?:,\s*(?<n>\d+)\s*)?\)\.(?<edge>[A-Za-z]*)`,
    "u"
  );

  const groups = pattern.exec(Str.slice(at)(text))?.groups;
  const matched = pattern.exec(Str.slice(at)(text))?.[0] ?? "";

  if (groups === undefined) {
    return Result.fail(
      bad(
        line,
        problem(
          `"${pipe(text, Str.slice(at), Str.split(/[\s,)]/u))[0] ?? ""}" is not a word anchor`,
          `${anchorWords.word}("<phrase>"[, <n>]).start or .end`
        )
      )
    );
  }

  const phrase = pipe(
    groups.phrase ?? "",
    Str.replaceAll(/\s+/gu, " "),
    Str.trim
  );

  const occurrence = Number(groups.n ?? "1");
  const edge = groups.edge ?? "";

  if (phrase === "") {
    return Result.fail(
      bad(
        line,
        problem(
          `${anchorWords.word}("") names no word`,
          `a word or phrase of the narration, as ${anchorWords.word}("matches")`
        )
      )
    );
  }

  if (occurrence < 1) {
    return Result.fail(
      bad(
        line,
        problem(
          `${anchorWords.word}("${phrase}", ${occurrence}) counts from 0`,
          "an occurrence number from 1 (the first)"
        )
      )
    );
  }

  if (!isEdge(edge)) {
    return Result.fail(
      edgeProblem(edge, line, `${anchorWords.word}("${phrase}")`)
    );
  }

  return Result.succeed([
    {
      anchor: {
        edge,
        explicit: groups.n !== undefined,
        kind: "word",
        occurrence,
        phrase,
      },
      kind: "anchor",
    },
    at + matched.length,
  ]);
};

/** The characters of a path or a name: it ends at a space, a comma or a closing parenthesis (a Beat's parentheses stay). */
const pathEnd = (text: string, at: number): number => {
  const numbered = new RegExp(
    String.raw`^(?:${anchorWords.beat}|${anchorWords.state})\(\d+\)`,
    "u"
  ).exec(Str.slice(at)(text))?.[0];

  let position = at + (numbered?.length ?? 0);

  while (position < text.length && !/[\s,)]/u.test(charAt(text, position))) {
    position += 1;
  }

  return position;
};

const unreadable = (text: string, at: number, line: number): PlanError =>
  bad(
    line,
    problem(
      at >= text.length
        ? "the event ends too soon"
        : `"${Str.slice(at)(text)}" is not an event`,
      `an anchor, a derived event name, ${oneOf(Record.values(combinatorWords))}(...)`
    )
  );

/** A bare name is a derived event (`let`); the anchor words alone are not names. */
const readName = (
  name: string,
  line: number
): Result.Result<EventExpr, PlanError> =>
  Arr.contains(reservedIds, name)
    ? Result.fail(
        bad(
          line,
          problem(
            `"${name}" alone names no moment`,
            `${name}.<moment> (see the anchor shapes), or the name of a derived event`
          )
        )
      )
    : Result.succeed({ kind: "ref", name });

const readPathTerm = (
  text: string,
  at: number,
  line: number
): Parsed<EventExpr> => {
  const end = pathEnd(text, at);
  const token = Str.slice(at, end)(text);

  if (token === "") {
    return Result.fail(unreadable(text, at, line));
  }

  if (!Str.includes(".")(token) && identifierPattern.test(token)) {
    return Result.map(readName(token, line), (expr) => [expr, end] as const);
  }

  return Result.map(
    readAnchorPath(token, line),
    (anchor) => [{ anchor, kind: "anchor" } satisfies EventExpr, end] as const
  );
};

/** What follows a combinator's name and its `(`: the comma separated events, and the options of `each`. */
interface Arguments {
  readonly end: number;
  readonly events: readonly EventExpr[];
  readonly stagger: Duration | undefined;
  readonly throttle: Duration | undefined;
}

const emptyArguments = (end: number): Arguments => ({
  end,
  events: [],
  stagger: undefined,
  throttle: undefined,
});

const closeProblem = (
  text: string,
  at: number,
  line: number,
  name: string
): PlanError =>
  bad(
    line,
    problem(
      at >= text.length
        ? `${name}( is never closed`
        : `"${Str.slice(at)(text)}" inside ${name}(...)`,
      '"," between events and ")" after the last one'
    )
  );

const optionOf = (text: string, at: number): string | undefined =>
  Arr.findFirst(Record.values(optionWords), (word) =>
    Str.startsWith(`${word}=`)(Str.slice(at)(text))
  ).pipe(Option.getOrUndefined);

// The parser below is mutually recursive: an event holds terms, and a term may hold events.
/* oxlint-disable typescript/no-use-before-define */

const readOption = (
  text: string,
  at: number,
  line: number,
  option: string
): Parsed<Duration> => {
  const start = at + option.length + 1;
  const end = pathEnd(text, start);

  return Result.map(
    readDuration(Str.slice(start, end)(text), line, option),
    (duration) => [duration, end] as const
  );
};

const nextArgument = (
  text: string,
  at: number,
  line: number,
  name: string,
  found: Arguments
): Parsed<Arguments> => {
  const start = skipSpaces(text, at);

  const option =
    name === combinatorWords.each ? optionOf(text, start) : undefined;

  if (option !== undefined) {
    return Result.flatMap(
      readOption(text, start, line, option),
      ([duration, end]) =>
        afterArgument(
          text,
          end,
          line,
          name,
          option === optionWords.throttle
            ? { ...found, throttle: duration }
            : { ...found, stagger: duration }
        )
    );
  }

  return Result.flatMap(readEvent(text, start, line), ([event, end]) =>
    afterArgument(text, end, line, name, {
      ...found,
      events: [...found.events, event],
    })
  );
};

const afterArgument = (
  text: string,
  at: number,
  line: number,
  name: string,
  found: Arguments
): Parsed<Arguments> => {
  const position = skipSpaces(text, at);
  const next = charAt(text, position);

  if (next === ")") {
    return Result.succeed([{ ...found, end: position + 1 }, position + 1]);
  }

  return next === ","
    ? nextArgument(text, position + 1, line, name, found)
    : Result.fail(closeProblem(text, position, line, name));
};

const readArguments = (
  text: string,
  at: number,
  line: number,
  name: string
): Parsed<Arguments> => nextArgument(text, at, line, name, emptyArguments(at));

const needsTwo = (
  name: string,
  line: number,
  count: number
): Result.Result<true, PlanError> =>
  count >= 2
    ? Result.succeed(true)
    : Result.fail(
        bad(
          line,
          problem(
            `${name}(...) with ${count} event${count === 1 ? "" : "s"}`,
            `${name}(...) of two or more events, or just the event`
          )
        )
      );

const readGroup = (
  text: string,
  at: number,
  line: number,
  name: "all" | "each" | "first"
): Parsed<EventExpr> =>
  Result.flatMap(
    readArguments(text, at + name.length + 1, line, name),
    ([parsed, end]) =>
      Result.flatMap(
        needsTwo(name, line, parsed.events.length),
        (): Parsed<EventExpr> => {
          if (name !== combinatorWords.each) {
            return Result.succeed([
              { kind: name, of: parsed.events },
              end,
            ] as const);
          }

          return Result.succeed([
            {
              kind: "each",
              of: parsed.events,
              stagger: parsed.stagger ?? null,
              throttle: parsed.throttle ?? null,
            },
            end,
          ] as const);
        }
      )
  );

const readWithin = (
  text: string,
  at: number,
  line: number
): Parsed<EventExpr> =>
  Result.flatMap(
    readEvent(text, at + combinatorWords.within.length + 1, line),
    ([inner, afterEvent]) => {
      const comma = skipSpaces(text, afterEvent);
      const stateAt = skipSpaces(text, comma + 1);

      const found = new RegExp(
        String.raw`^${anchorWords.state}\((?<n>\d+)\)\s*\)`,
        "u"
      ).exec(Str.slice(stateAt)(text));

      if (charAt(text, comma) !== "," || found?.groups?.n === undefined) {
        return Result.fail(
          bad(
            line,
            problem(
              `${combinatorWords.within}(...) without its State`,
              `${combinatorWords.within}(<event>, ${anchorWords.state}(<n>))`
            )
          )
        );
      }

      return Result.succeed([
        { kind: "within", of: inner, state: Number(found.groups.n) },
        stateAt + found[0].length,
      ] as const);
    }
  );

const whenPattern = new RegExp(
  String.raw`^${combinatorWords.when}\(\s*(?<path>[^\s>)]+)\s*>=\s*(?<value>\d+(?:\.\d+)?)\s*${percentUnit.token}\s*\)`,
  "u"
);

const readWhen = (
  text: string,
  at: number,
  line: number
): Parsed<EventExpr> => {
  const found = whenPattern.exec(Str.slice(at)(text));
  const path = found?.groups?.path ?? "";
  const value = Number(found?.groups?.value ?? "NaN");

  if (found === null || !Str.endsWith(`.${progressWord}`)(path)) {
    return Result.fail(
      bad(
        line,
        problem(
          `"${pipe(text, Str.slice(at), Str.split(")"))[0] ?? ""})" is not a progress threshold`,
          `${combinatorWords.when}(<subject>.<transition>.${progressWord} >= <N>${percentUnit.token})`
        )
      )
    );
  }

  if (value > 100) {
    return Result.fail(
      bad(
        line,
        problem(
          `${value}${percentUnit.token} in ${combinatorWords.when}(...) is more than a whole transition`,
          "a percent from 0 to 100"
        )
      )
    );
  }

  return Result.map(
    readAnchorPath(path, line, true),
    (anchor) =>
      [
        {
          anchor:
            anchor.kind === "edge"
              ? { ...anchor, at: { percent: value } }
              : anchor,
          kind: "anchor",
        } satisfies EventExpr,
        at + found[0].length,
      ] as const
  );
};

const unknownCall = (name: string, line: number): PlanError =>
  bad(
    line,
    problem(
      `unknown combinator "${name}"`,
      oneOf(Record.values(combinatorWords)),
      didYouMean(name, Record.values(combinatorWords))
    )
  );

const readTerm = (
  text: string,
  at: number,
  line: number
): Parsed<EventExpr> => {
  const name = wordOf(text, at);
  const call = charAt(text, at + name.length) === "(";

  if (isCall(text, at, anchorWords.word)) {
    return readWord(text, at, line);
  }

  if (isCall(text, at, combinatorWords.all)) {
    return readGroup(text, at, line, combinatorWords.all);
  }

  if (isCall(text, at, combinatorWords.first)) {
    return readGroup(text, at, line, combinatorWords.first);
  }

  if (isCall(text, at, combinatorWords.each)) {
    return readGroup(text, at, line, combinatorWords.each);
  }

  if (isCall(text, at, combinatorWords.within)) {
    return readWithin(text, at, line);
  }

  if (isCall(text, at, combinatorWords.when)) {
    return readWhen(text, at, line);
  }

  return call && name !== anchorWords.beat && name !== anchorWords.state
    ? Result.fail(unknownCall(name, line))
    : readPathTerm(text, at, line);
};

/** `term [ offset ]`: an offset is a sign, a number and a unit after a space. */
const readEvent = (text: string, at: number, line: number): Parsed<EventExpr> =>
  Result.flatMap(readTerm(text, skipSpaces(text, at), line), ([term, end]) => {
    const start = skipSpaces(text, end);

    if (charAt(text, start) !== "+" && charAt(text, start) !== "-") {
      return Result.succeed([term, end] as const);
    }

    const stop = pathEnd(text, start);

    return Result.map(
      readOffset(Str.slice(start, stop)(text), line),
      (offset) =>
        [{ kind: "shift", of: term, offset } satisfies EventExpr, stop] as const
    );
  });

/* oxlint-enable typescript/no-use-before-define */

/** An event and the text it was written as (whitespace collapsed), and what follows it. */
export interface ReadEvent {
  readonly event: EventExpr;
  /** The index in `text` after the event and the spaces after it. */
  readonly rest: number;
  readonly written: string;
}

/** Reads the event at the start of `text`; what follows is for the caller (`until`, or nothing). */
export const readEventPrefix = (
  text: string,
  line: number
): Result.Result<ReadEvent, PlanError> =>
  Result.map(readEvent(text, 0, line), ([event, end]) => ({
    event,
    rest: skipSpaces(text, end),
    written: pipe(
      Str.slice(0, end)(text),
      Str.replaceAll(/\s+/gu, " "),
      Str.trim
    ),
  }));

/** Flicks as the source writes them: whole seconds, whole milliseconds, or decimal seconds. */
const formatFlicks = (flicks: number): string => {
  if (flicks % flicksPerSecond === 0) {
    return `${flicks / flicksPerSecond}s`;
  }

  return flicks % (flicksPerSecond / 1000) === 0
    ? `${flicks / (flicksPerSecond / 1000)}ms`
    : `${flicks / flicksPerSecond}s`;
};

/** `+100ms`, `-3f`, `+50%`: an offset as it is written (a time in the whole unit that holds it, else decimal seconds). */
export const formatOffset = (offset: Offset): string => {
  const sign = offset.value < 0 ? "-" : "+";

  if (offset.unit === "percent") {
    return `${sign}${Math.abs(offset.value)}${percentUnit.token}`;
  }

  return offset.unit === "f"
    ? `${sign}${Math.abs(offset.value)}f`
    : `${sign}${formatFlicks(Math.abs(offset.value))}`;
};

const formatDuration = (duration: Duration): string =>
  duration.unit === "f" ? `${duration.value}f` : formatFlicks(duration.value);

/**
 * The event in its canonical form: a percent of a transition is the threshold `when(<path>.progress >= N%)`, every
 * combinator is written as a call, an offset follows its event.
 */
export const formatEvent = (expr: EventExpr): string => {
  switch (expr.kind) {
    case "anchor": {
      const { anchor } = expr;

      if (anchor.kind === "edge" && !isEdgePoint(anchor.at)) {
        const base = formatAnchor({ ...anchor, at: edges[0] });

        return `${combinatorWords.when}(${Str.slice(0, base.length - edges[0].length)(base)}${progressWord} >= ${anchor.at.percent}${percentUnit.token})`;
      }

      return formatAnchor(anchor);
    }

    case "ref": {
      return expr.name;
    }

    case "all":
    case "first": {
      return `${expr.kind}(${Arr.join(Arr.map(expr.of, formatEvent), ", ")})`;
    }

    case "each": {
      return `${combinatorWords.each}(${Arr.join(
        [
          ...Arr.map(expr.of, formatEvent),
          ...(expr.throttle === null
            ? []
            : [`${optionWords.throttle}=${formatDuration(expr.throttle)}`]),
          ...(expr.stagger === null
            ? []
            : [`${optionWords.stagger}=${formatDuration(expr.stagger)}`]),
        ],
        ", "
      )})`;
    }

    case "within": {
      return `${combinatorWords.within}(${formatEvent(expr.of)}, ${anchorWords.state}(${expr.state}))`;
    }

    case "shift": {
      return `${formatEvent(expr.of)} ${formatOffset(expr.offset)}`;
    }

    default: {
      return "";
    }
  }
};
