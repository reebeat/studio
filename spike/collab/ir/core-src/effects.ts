// One line of an `[[effects]]` block (spec 0002, "plan contract for effects", and spec 0004), read and written:
//
//   <id>: <verb> <argument> at <when> [until <event>]
//   let <name> = <event>
//
// The vocabulary comes from `plan.ts`, `machines.ts` and `grammar.ts`; the events are read by `expr.ts`; this file owns
// the shape of the two lines. Every problem is a Plan error with what was found, what was expected and the nearest
// valid form. Plain functions: no Effect, no service.
import {
  Array as Arr,
  Option,
  Result,
  Schema,
  String as Str,
  pipe,
} from "effect";

import { planError } from "./errors.ts";
import type { PlanError } from "./errors.ts";
import { readEventPrefix } from "./expr.ts";
import {
  absolutePattern,
  absoluteUnit,
  bodyPattern,
  didYouMean,
  effectLine,
  keywords,
  lineForm,
  linePattern,
  oneOf,
  problem,
  reservedIds,
  verbArguments,
} from "./grammar.ts";
import {
  SfxNameSchema,
  VerbSchema,
  idPattern,
  sfxNames,
  verbs,
} from "./plan.ts";
import type { DerivedEvent, Effect, Until, When } from "./plan.ts";

const isSfx = Schema.is(SfxNameSchema);
const isVerb = Schema.is(VerbSchema);

const bad = (line: number, message: string): PlanError =>
  planError("BadEffect", line, message);

const collapse = (text: string): string =>
  pipe(text, Str.replaceAll(/\s+/gu, " "), Str.trim);

/** `value` times `factor`, without the float noise of the product (`0.1 * 1000`). */
const scaled = (value: number, factor: number): number =>
  Number((value * factor).toFixed(6));

/** `12.5s because "reason"`; `AbsoluteNeedsReason` when the reason is missing (F5). */
const absoluteWhen = (
  text: string,
  line: number
): Result.Result<When, PlanError> => {
  const groups = absolutePattern.exec(text)?.groups;

  if (groups?.unit !== absoluteUnit.token) {
    return Result.fail(
      bad(
        line,
        problem(
          `"${text}" is not an absolute time`,
          `an absolute time in seconds with its reason: at 12.5${absoluteUnit.token} ${keywords.because} "<reason>"`
        )
      )
    );
  }

  const reason = collapse(groups.reason ?? "");

  if (reason === "") {
    return Result.fail(
      planError(
        "AbsoluteNeedsReason",
        line,
        problem(
          `absolute time "${text}" has no reason`,
          `at ${groups.value ?? ""}${absoluteUnit.token} ${keywords.because} "<why this moment is fixed>"`
        )
      )
    );
  }

  return Result.succeed({
    absoluteFlicks: Math.round(
      scaled(Number(groups.value), absoluteUnit.factor)
    ),
    reason,
  });
};

const readArgument = (
  verb: Effect["verb"],
  argument: string,
  line: number
): Result.Result<Pick<Effect, "name" | "target">, PlanError> => {
  if (verb !== "sound") {
    return idPattern.test(argument)
      ? Result.succeed({ target: argument })
      : Result.fail(
          bad(
            line,
            problem(
              `"${argument}" is not an Element id`,
              verbArguments[verb].argument
            )
          )
        );
  }

  return isSfx(argument)
    ? Result.succeed({ name: argument })
    : Result.fail(
        planError(
          "UnknownSfx",
          line,
          problem(
            `unknown sound "${argument}"`,
            oneOf(sfxNames),
            didYouMean(argument, sfxNames)
          )
        )
      );
};

/** What follows `at`: its text, and the `until` clause after it, if any. */
interface Timing {
  readonly until: Until | undefined;
  readonly when: When;
  readonly written: string;
}

const untilClause = (
  rest: string,
  line: number
): Result.Result<Until, PlanError> => {
  const text = Str.trim(Str.slice(keywords.until.length)(rest));

  return Result.flatMap(readEventPrefix(text, line), (read) =>
    read.rest === text.length
      ? Result.succeed({ event: read.event, written: read.written })
      : Result.fail(
          bad(
            line,
            problem(
              `"${Str.slice(read.rest)(text)}" after the ${keywords.until} event`,
              "the end of the line"
            )
          )
        )
  );
};

/** The text after `at`: an absolute time with its reason, or an event and an optional `until` event. */
const timingOf = (
  text: string,
  line: number
): Result.Result<Timing, PlanError> => {
  if (/^\d/u.test(text)) {
    return Result.map(absoluteWhen(text, line), (when) => ({
      until: undefined,
      when,
      written: text,
    }));
  }

  return Result.flatMap(
    readEventPrefix(text, line),
    (read): Result.Result<Timing, PlanError> => {
      const rest = Str.slice(read.rest)(text);

      if (rest === "") {
        return Result.succeed({
          until: undefined,
          when: { event: read.event },
          written: read.written,
        });
      }

      if (!Str.startsWith(`${keywords.until} `)(rest)) {
        return Result.fail(
          bad(
            line,
            problem(
              `"${rest}" after the event`,
              `an offset, "${keywords.until} <event>" or the end of the line`
            )
          )
        );
      }

      return Result.map(untilClause(rest, line), (until) => ({
        until,
        when: { event: read.event },
        written: read.written,
      }));
    }
  );
};

/** Why a verb refuses an `until`, or `undefined` when it takes one. */
const untilRefusal = (
  verb: Effect["verb"],
  until: Until | undefined,
  line: number
): PlanError | undefined =>
  until === undefined || verbArguments[verb].until
    ? undefined
    : bad(
        line,
        problem(
          `${keywords.until} on a ${verb}, which ${verb === "sound" ? "plays to its own end" : "stays shown"}`,
          `${keywords.until} only on ${oneOf(Arr.filter(verbs, (known) => verbArguments[known].until))}`
        )
      );

/** Reads one non-empty line of an `[[effects]]` block that is an effect; `line` is its 1-based source line. */
export const parseEffectLine = (
  raw: string,
  line: number
): Result.Result<Effect, PlanError> => {
  const text = collapse(raw);
  const head = linePattern.exec(text)?.groups;
  const body = bodyPattern.exec(head?.rest ?? "")?.groups;

  if (head === undefined || body === undefined) {
    return Result.fail(
      bad(line, problem(`"${text}" is not an effect line`, lineForm))
    );
  }

  const id = head.id ?? "";
  const verb = body.verb ?? "";

  if (!idPattern.test(id) || Arr.contains(reservedIds, id)) {
    return Result.fail(
      bad(
        line,
        problem(
          `effect id "${id}" is not usable`,
          `an identifier that is not ${oneOf(reservedIds)}`
        )
      )
    );
  }

  if (!isVerb(verb)) {
    return Result.fail(
      bad(
        line,
        problem(`unknown verb "${verb}"`, oneOf(verbs), didYouMean(verb, verbs))
      )
    );
  }

  return Result.flatMap(
    readArgument(verb, body.argument ?? "", line),
    (argument) =>
      Result.flatMap(timingOf(body.when ?? "", line), (timing) => {
        const refused = untilRefusal(verb, timing.until, line);

        if (refused !== undefined) {
          return Result.fail(refused);
        }

        const base = {
          id,
          line,
          verb,
          when: timing.when,
          written: timing.written,
          ...argument,
        };

        return Result.succeed(
          timing.until === undefined ? base : { ...base, until: timing.until }
        );
      })
  );
};

/** Whether a collapsed row of an `[[effects]]` block is a `let` line. */
export const isLetLine = (raw: string): boolean =>
  Str.startsWith(`${keywords.let} `)(collapse(raw));

/** Reads one `let <name> = <event>` line: a derived event of the Scene. */
export const parseLetLine = (
  raw: string,
  line: number
): Result.Result<DerivedEvent, PlanError> => {
  const text = collapse(raw);
  const rest = Str.trim(Str.slice(keywords.let.length)(text));
  const equals = Option.getOrElse(Str.indexOf("=")(rest), () => -1);
  const name = Str.trim(Str.slice(0, Math.max(equals, 0))(rest));
  const source = Str.trim(Str.slice(equals + 1)(rest));

  if (equals === -1 || source === "") {
    return Result.fail(
      bad(
        line,
        problem(
          `"${text}" is not a derived event`,
          `${keywords.let} <name> = <event>`
        )
      )
    );
  }

  if (!idPattern.test(name) || Arr.contains(reservedIds, name)) {
    return Result.fail(
      bad(
        line,
        problem(
          `derived event name "${name}" is not usable`,
          `an identifier that is not ${oneOf(reservedIds)}`
        )
      )
    );
  }

  return Result.flatMap(readEventPrefix(source, line), (read) =>
    read.rest === source.length
      ? Result.succeed({ event: read.event, line, name, written: read.written })
      : Result.fail(
          bad(
            line,
            problem(
              `"${Str.slice(read.rest)(source)}" after the event of ${name}`,
              "the end of the line"
            )
          )
        )
  );
};

/** The effect as one line of an `[[effects]]` block, its timing as the author wrote it; `parseEffectLine` reads it back. */
export const formatEffect = (effect: Effect): string =>
  `${effectLine(effect.id, effect.verb, effect.name ?? effect.target ?? "", effect.written)}${
    effect.until === undefined
      ? ""
      : ` ${keywords.until} ${effect.until.written}`
  }`;

/** The derived event as a `let` line. */
export const formatLet = (derived: DerivedEvent): string =>
  `${keywords.let} ${derived.name} = ${derived.written}`;
