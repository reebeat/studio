// One Action line is one Element: `text {id=one cell=mc class=box visible=false}` (spec 0002: `key=value` only, no
// sigils, no bare flags). A plain function: it returns the Element (when the line has an id and every value is valid)
// and every problem found on the line, each with what was found, what was expected and the nearest valid form.
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
import {
  didYouMean,
  elementProperties,
  oneOf,
  problem,
  propertySchemas,
} from "./grammar.ts";
import type { PropertyKey } from "./grammar.ts";
import { ElementSchema } from "./plan.ts";
import type { Element } from "./plan.ts";

const attributeBlock = /^(?<text>.*?)\s*\{(?<attributes>[^{}]*)\}\s*$/u;

const keys = Arr.map(elementProperties, (property) => property.key);

const decodeElement = Schema.decodeUnknownResult(ElementSchema);

const guards = {
  cell: Schema.is(propertySchemas.cell),
  class: Schema.is(propertySchemas.class),
  id: Schema.is(propertySchemas.id),
  visible: Schema.is(propertySchemas.visible),
} as const;

const isKey = (word: string): word is PropertyKey => Arr.contains(keys, word);

/** The values a property accepts, as a message says them. */
const specs = new Map(
  Arr.map(elementProperties, (property) => [property.key, property] as const)
);

const expectedValues = (key: PropertyKey): string => {
  const spec = specs.get(key);

  return spec === undefined || spec.values.length === 0
    ? (spec?.form ?? key)
    : oneOf(spec.values);
};

/** The values of every closed property, to say which key a bare value belongs to (`box` is `class=box`). */
const owners = Arr.flatMap(elementProperties, (property) =>
  Arr.map(property.values, (value) => ({ key: property.key, value }))
);

const bad = (line: number, message: string): PlanError =>
  planError("BadProperty", line, message);

/** A release-1 word: `#id`, `@cell`, `.class` or `hidden`. */
const isReleaseOne = (word: string): boolean =>
  /^[#@.]/u.test(word) || word === "hidden";

/** The release-1 block rewritten as `key=value` words, so the error can show the replacement. */
const rewritten = (words: readonly string[]): string =>
  Arr.join(
    Arr.map(words, (word) => {
      if (word === "hidden") {
        return "visible=false";
      }

      const names = new Map([
        ["#", "id"],
        [".", "class"],
        ["@", "cell"],
      ]);

      const key = names.get(Str.slice(0, 1)(word));

      return key === undefined ? word : `${key}=${Str.slice(1)(word)}`;
    }),
    " "
  );

const hiddenIdOf = (words: readonly string[]): string | undefined =>
  Arr.contains(words, "hidden")
    ? Arr.findFirst(words, (word) => Str.startsWith("#")(word)).pipe(
        Option.map((word) => Str.slice(1)(word)),
        Option.getOrUndefined
      )
    : undefined;

const releaseOne = (
  text: string,
  words: readonly string[],
  line: number
): PlanError =>
  planError(
    "ReleaseOneForm",
    line,
    problem(
      `release-1 Element form {${Arr.join(words, " ")}}`,
      `key=value properties: ${text} {${rewritten(words)}}`
    )
  );

const slug = (text: string): string =>
  pipe(
    text,
    Str.toLowerCase,
    Str.replaceAll(/[^a-z0-9]+/gu, "-"),
    Str.replaceAll(/^-+|-+$/gu, ""),
    Str.replace(/^(?=[0-9])/u, "e")
  );

/**
 * The line with its id added: what the author wrote stays as written, and only a required property that is missing
 * gets an example value, so that the suggestion is a valid line.
 */
const withId = (text: string, words: readonly string[]): string => {
  const written = new Set(
    Arr.map(words, (word) => Str.split(word, "=")[0] ?? "")
  );

  const filled = Arr.flatMap(elementProperties, (property) =>
    property.required && property.key !== "id" && !written.has(property.key)
      ? [`${property.key}=${property.example}`]
      : []
  );

  return `"${text} {id=${slug(text) || "<id>"} ${Arr.join([...words, ...filled], " ")}}"`;
};

const missingId = (
  text: string,
  words: readonly string[],
  line: number
): PlanError =>
  planError(
    "MissingId",
    line,
    problem(
      `Element "${text}" has no id`,
      `"${text} {id=<id> cell=<cell> class=<class>}"`,
      withId(text, words)
    )
  );

/** The problem with one `key=value` word, or the pair. */
const readPair = (
  word: string,
  line: number
): Result.Result<readonly [PropertyKey, string], PlanError> => {
  const at = Str.indexOf("=")(word);

  if (Option.isNone(at)) {
    const owner = Option.getOrUndefined(
      Arr.findFirst(owners, (candidate) => candidate.value === word)
    );

    return Result.fail(
      bad(
        line,
        problem(
          `"${word}" in the Element properties is not key=value`,
          `key=value, with the keys ${oneOf(keys)}`,
          owner === undefined ? undefined : `${owner.key}=${word}`
        )
      )
    );
  }

  const key = Str.slice(0, at.value)(word);
  const value = Str.slice(at.value + 1)(word);

  if (!isKey(key)) {
    return Result.fail(
      bad(
        line,
        problem(
          `unknown Element property "${key}"`,
          oneOf(keys),
          didYouMean(key, keys)
        )
      )
    );
  }

  return guards[key](value)
    ? Result.succeed([key, value] as const)
    : Result.fail(
        bad(
          line,
          problem(
            `${key}=${value} is not a valid value`,
            expectedValues(key),
            didYouMean(value, specs.get(key)?.values ?? [])
          )
        )
      );
};

export interface ParsedElement {
  /** Absent when the line has no usable `id` or a property is wrong. */
  readonly element: Element | undefined;
  readonly errors: readonly PlanError[];
  /** The id of a release-1 `hidden` Element: the one a `[[next]]` cue of its Scene was meant to reveal. */
  readonly releaseOneHidden: string | undefined;
}

const failed = (errors: readonly PlanError[]): ParsedElement => ({
  element: undefined,
  errors,
  releaseOneHidden: undefined,
});

/** The pairs of a `{...}` block, or every problem found in it. */
const readPairs = (words: readonly string[], line: number) => {
  const pairs = new Map<PropertyKey, string>();
  const errors: PlanError[] = [];

  for (const word of words) {
    const pair = readPair(word, line);

    if (Result.isFailure(pair)) {
      errors.push(pair.failure);
    } else if (pairs.has(pair.success[0])) {
      errors.push(
        bad(
          line,
          problem(
            `Element property "${pair.success[0]}" appears twice (${pair.success[0]}=${pairs.get(pair.success[0]) ?? ""} and ${word})`,
            "each property once"
          )
        )
      );
    } else {
      pairs.set(pair.success[0], pair.success[1]);
    }
  }

  return { errors, pairs };
};

/** The required properties a block lacks, `id` excepted. */
const missingProperties = (
  pairs: ReadonlyMap<PropertyKey, string>,
  text: string,
  line: number
): readonly PlanError[] =>
  Arr.flatMap(elementProperties, (property) =>
    property.required && property.key !== "id" && !pairs.has(property.key)
      ? [
          bad(
            line,
            problem(
              `Element "${text}" has no ${property.key}`,
              `${property.key}=<${expectedValues(property.key)}>`
            )
          ),
        ]
      : []
  );

/** Parses one non-empty line of an Action block; `line` is its 1-based source line. */
export const parseElementLine = (raw: string, line: number): ParsedElement => {
  const trimmed = Str.trim(raw);
  const match = attributeBlock.exec(trimmed);
  const text = match?.groups?.text ?? trimmed;

  const words = Arr.filter(
    Str.split(match?.groups?.attributes ?? "", /\s+/u),
    (word) => word !== ""
  );

  if (Str.includes("[[")(trimmed)) {
    return failed([
      planError(
        "UnsupportedElement",
        line,
        problem(
          "a [[note]] in an Element line",
          "the only note is a [[effects ...]] block of its own"
        )
      ),
    ]);
  }

  if (match === null) {
    return failed([missingId(text, words, line)]);
  }

  if (Arr.some(words, isReleaseOne)) {
    return {
      ...failed([releaseOne(text, words, line)]),
      releaseOneHidden: hiddenIdOf(words),
    };
  }

  const { errors, pairs } = readPairs(words, line);

  const id = pairs.get("id");

  // A property that was written wrongly is not also reported as missing.
  const all =
    errors.length > 0
      ? errors
      : [
          ...(id === undefined ? [missingId(text, words, line)] : []),
          ...missingProperties(pairs, text, line),
        ];

  if (all.length > 0) {
    return failed(all);
  }

  return Result.match(
    decodeElement({
      cell: pairs.get("cell"),
      class: pairs.get("class"),
      id,
      line,
      text,
      visible: pairs.get("visible") !== "false",
    }),
    {
      onFailure: (failure) =>
        failed([
          bad(
            line,
            problem(
              `Element "${text}": ${failure.message}`,
              "key=value properties"
            )
          ),
        ]),
      onSuccess: (element) => ({
        element,
        errors: [],
        releaseOneHidden: undefined,
      }),
    }
  );
};
