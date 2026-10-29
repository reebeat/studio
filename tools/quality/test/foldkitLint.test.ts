import { assert, describe, it } from "@effect/vitest";

import { foldkitLint, foldkitSeverity } from "../foldkitLint.ts";

describe("foldkitSeverity", () => {
  it("keeps off as off", () => {
    assert.strictEqual(foldkitSeverity("off"), "off");
  });

  it("turns every other severity into error, so a new severity never weakens a rule", () => {
    assert.strictEqual(foldkitSeverity("error"), "error");
    assert.strictEqual(foldkitSeverity("warn"), "error");
    assert.strictEqual(foldkitSeverity("deny"), "error");
  });
});

describe("foldkitLint", () => {
  it("maps the rules and the overrides of a recommended preset", () => {
    const lint = foldkitLint({
      overrides: [
        {
          excludeFiles: ["**/*.test.ts"],
          files: ["**/entry.ts"],
          rules: { "foldkit/no-impure-call-at-decision-time": "off" },
        },
        { files: ["**/server/**"], rules: { "foldkit/x": "warn" } },
      ],
      rules: { "foldkit/a": "error", "foldkit/b": "off" },
    });

    assert.deepStrictEqual(lint.rules, {
      "foldkit/a": "error",
      "foldkit/b": "off",
    });
    assert.deepStrictEqual(lint.overrides, [
      {
        excludeFiles: ["**/*.test.ts"],
        files: ["**/entry.ts"],
        rules: { "foldkit/no-impure-call-at-decision-time": "off" },
      },
      {
        excludeFiles: [],
        files: ["**/server/**"],
        rules: { "foldkit/x": "error" },
      },
    ]);
  });
});
