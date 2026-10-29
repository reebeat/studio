import { Array as Arr, Option, Order, Result, String as Str } from "effect";

/** A markdown file: its repository-relative path and its text. */
export interface Source {
  readonly file: string;
  readonly text: string;
}

interface Entry {
  readonly file: string;
  readonly id: string;
  readonly specs: readonly string[];
}

const group = (match: RegExpExecArray, name: string): Option.Option<string> =>
  Option.fromNullishOr(match.groups?.[name]);

// A feature entry is a level-3 heading that opens with its id in backticks, then a `Spec: 0000, 0003` line.
const idPattern = /^`(?<id>[a-z][a-z0-9-]*)`/u;
const specLine = /^Spec: (?<specs>.+)$/mu;

const parseEntries = (
  features: readonly Source[]
): readonly Result.Result<Entry, string>[] =>
  Arr.flatMap(features, ({ file, text }) =>
    Arr.map(Arr.drop(Str.split(text, /^### /mu), 1), (section) => {
      const id = Option.flatMap(
        Option.fromNullishOr(idPattern.exec(section)),
        (m) => group(m, "id")
      );

      const specs = Option.map(
        Option.flatMap(Option.fromNullishOr(specLine.exec(section)), (m) =>
          group(m, "specs")
        ),
        (line) =>
          Arr.filter(Str.split(line, /[\s,]+/u), (token) => token !== "")
      );

      if (Option.isNone(id)) {
        return Result.fail(
          `${file}: a "###" heading that does not open with an id in backticks: "${Str.trim(Str.takeLeft(section, 40))}"`
        );
      }

      return Option.isNone(specs)
        ? Result.fail(
            `${file}: feature \`${id.value}\` has no "Spec: NNNN" line`
          )
        : Result.succeed({ file, id: id.value, specs: specs.value });
    })
  );

const specNumber = (file: string): Option.Option<string> =>
  Option.flatMap(
    Option.fromNullishOr(/(?:^|\/)(?<number>\d{4})-[^/]*\.md$/u.exec(file)),
    (m) => group(m, "number")
  );

// `Verify skill: none, <reason>` or `Verify skill: pending, <reason>`: the spec's own statement that it has no entry.
const claimPattern = /^Verify skill: (?<kind>none|pending), (?<reason>\S.*)$/mu;
const anyClaim = /^Verify skill:/mu;
const planned = /^Status:.*\bplanned\b/imu;

const claimKind = (text: string): Option.Option<string> =>
  Option.flatMap(Option.fromNullishOr(claimPattern.exec(text)), (m) =>
    group(m, "kind")
  );

const specFindings = (
  spec: Source,
  entries: readonly Entry[]
): readonly string[] => {
  const number = specNumber(spec.file);

  const named =
    Option.isSome(number) &&
    Arr.some(entries, (entry) => Arr.contains(entry.specs, number.value));

  const kind = claimKind(spec.text);

  if (Option.isSome(kind) && named) {
    return [
      `${spec.file}: says "Verify skill: ${kind.value}" but a feature entry names it`,
    ];
  }

  if (Option.isSome(kind)) {
    return kind.value === "pending" && !planned.test(spec.text)
      ? [
          `${spec.file}: "Verify skill: pending" is allowed only while its Status says planned`,
        ]
      : [];
  }

  if (anyClaim.test(spec.text)) {
    return [
      `${spec.file}: a "Verify skill:" line must read "none, <reason>" or "pending, <reason>"`,
    ];
  }

  return named
    ? []
    : [
        `${spec.file}: no feature entry names this spec; add one to .agents/skills/verify-studio/features/ or write "Verify skill: none, <reason>" in the spec`,
      ];
};

const duplicates = (entries: readonly Entry[]): readonly string[] =>
  Arr.filterMap(Arr.dedupe(Arr.map(entries, ({ id }) => id)), (id) =>
    Arr.filter(entries, (entry) => entry.id === id).length > 1
      ? Result.succeed(`feature id \`${id}\` is defined more than once`)
      : Result.failVoid
  );

const unknownSpecs = (
  entries: readonly Entry[],
  specs: readonly Source[]
): readonly string[] => {
  const known = Arr.filterMap(specs, ({ file }) =>
    Result.fromOption(specNumber(file), () => file)
  );

  return Arr.flatMap(entries, ({ file, id, specs: named }) =>
    Arr.filterMap(named, (number) =>
      Arr.contains(known, number)
        ? Result.failVoid
        : Result.succeed(
            `${file}: feature \`${id}\` names spec ${number}, which does not exist in docs/specs`
          )
    )
  );
};

/**
 * Sentences that say where the verify skill's feature map and the specs disagree. Empty when every spec is named by an
 * entry or says it needs none, every entry names an existing spec, and every id is unique.
 */
export const featureMapFindings = (
  specs: readonly Source[],
  features: readonly Source[]
): readonly string[] => {
  const parsed = parseEntries(features);

  const entries = Arr.filterMap(parsed, (result) =>
    Result.isSuccess(result) ? Result.succeed(result.success) : Result.failVoid
  );

  const malformed = Arr.filterMap(parsed, (result) =>
    Result.isFailure(result) ? Result.succeed(result.failure) : Result.failVoid
  );

  return Arr.sort(
    [
      ...malformed,
      ...duplicates(entries),
      ...unknownSpecs(entries, specs),
      ...Arr.flatMap(specs, (spec) => specFindings(spec, entries)),
    ],
    Order.String
  );
};
