import { Array as Arr, Record as Rec, Result } from "effect";

type Severity = "error" | "off";

type RuleSettings = Readonly<Record<string, string | undefined>>;

interface RecommendedOverride {
  readonly excludeFiles?: readonly string[] | undefined;
  readonly files: readonly string[];
  readonly rules: RuleSettings;
}

interface Recommended {
  readonly overrides: readonly RecommendedOverride[];
  readonly rules: RuleSettings;
}

// `@foldkit/oxlint-plugin/recommended.json` is JSON, so its severities arrive typed as `string`. Only `off` stays off:
// any other value, including one a later release adds, becomes `error`, so a new severity never weakens a rule.
export const foldkitSeverity = (value: string): Severity =>
  value === "off" ? "off" : "error";

// JSON inference gives a rule that only some overrides set the type `undefined` in the others; those are dropped.
const severities = (rules: RuleSettings) =>
  Rec.filterMap(rules, (value) =>
    value === undefined
      ? Result.failVoid
      : Result.succeed(foldkitSeverity(value))
  );

export const foldkitLint = (recommended: Recommended) => ({
  overrides: Arr.map(recommended.overrides, (override) => ({
    excludeFiles: [...(override.excludeFiles ?? [])],
    files: [...override.files],
    rules: severities(override.rules),
  })),
  rules: severities(recommended.rules),
});
