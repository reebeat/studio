// Provenance: adapted from tsukuri-labs/tsukuri @ f7c348877585f54b6bf00651608726dd7e5044d3 (vite.config.ts), which adapted it from
// phibkro/vektorprogrammet-reimagined @ 797e9e41d96194b9479ff224ac1c40bbc0545888. Deviations: the Effect groups and the
// per-file overrides of tsukuri's packages are replaced by this repository's own (apps/editor, tools/quality), and the
// Foldkit Oxlint plugin rules apply to apps/editor. See PROVENANCE.md.
import { effectNative, strict } from "@effect/tsgo/oxlint-presets";
import foldkitRecommended from "@foldkit/oxlint-plugin/recommended.json" with { type: "json" };
import { effect } from "@phibkro/oxlint-effect-plugin";
import type { EffectConfigInput } from "@phibkro/oxlint-effect-plugin";
import ultraciteFmt from "ultracite/oxfmt";
import antiSlop from "ultracite/oxlint/anti-slop";
import core from "ultracite/oxlint/core";
import { defineConfig } from "vite-plus";

import { diagnosticRules } from "./tools/quality/diagnosticRules.ts";
import { foldkitLint } from "./tools/quality/foldkitLint.ts";

const foldkit = foldkitLint(foldkitRecommended);

export const tsgoRules = diagnosticRules.lint;

// Effect roles per path. A package adds its own group in the spec that creates it.
const effectConfig: EffectConfigInput = {
  groups: [
    {
      files: ["**/*.test.ts", "**/*.test.tsx"],
      platform: "node",
      role: "test",
      strictness: "strict",
    },
    {
      // The Foldkit definitions: Model, Messages, init, update and view. They run in the browser and call no runtime.
      files: ["apps/editor/src/**"],
      platform: "browser",
      role: "application",
      strictness: "strict",
    },
    {
      // The one module that boots the Foldkit runtime.
      files: ["apps/editor/src/entry.ts"],
      platform: "browser",
      role: "composition-root",
      strictness: "strict",
    },
    {
      files: ["tools/quality/**"],
      platform: "node",
      role: "composition-root",
      strictness: "strict",
    },
  ],
};

const effectConfigResult = effect(effectConfig);

// Ultracite's `anti-slop` preset already enables the 18 generic rules, so only the Effect rules are added here.
const effectAntiSlopRuleNames = [
  "no-manual-effect-error-tag",
  "no-manual-tag-comparison",
  "no-manual-tagged-construction",
  "no-service-constructor-imports",
  "prefer-effect-match",
];

const localAntiSlopRules: Record<string, "error"> = {};

for (const name of effectAntiSlopRuleNames) {
  localAntiSlopRules[`anti-slop-effect/${name}`] = "error";
}

const restrictedSourcePatterns = [
  {
    message:
      "Import another workspace package through its export map, not its source path.",
    regex: "^@tsukuri-studio/[^/]+/src(?:/|$)",
  },
  {
    message:
      "Import another workspace package through its export map, not its source path.",
    regex: "^(?:\\./|(?:\\.\\./)+)(?:apps|tools)/[^/]+/src(?:/|$)",
  },
];

export default defineConfig({
  // Prose is written by hand: Oxfmt re-wraps Markdown and joins hard line breaks, which changes meaning.
  fmt: {
    ...ultraciteFmt,
    ignorePatterns: [...(ultraciteFmt.ignorePatterns ?? []), "**/*.md"],
  },
  lint: {
    extends: [core, antiSlop, strict, effectNative],
    // The vendored anti-slop rules keep their upstream style; they are checked by their own provenance, not ours.
    ignorePatterns: [
      ...(core.ignorePatterns ?? []),
      "tools/oxlint/anti-slop/**",
    ],
    jsPlugins: [
      { name: "vite-plus", specifier: "vite-plus/oxlint-plugin" },
      ...effectConfigResult.jsPlugins,
      {
        name: "anti-slop-effect",
        specifier: "./tools/oxlint/anti-slop/effect/index.ts",
      },
      { name: "complexity", specifier: "oxlint-plugin-complexity" },
      ...foldkitRecommended.jsPlugins,
    ],
    options: { typeAware: true, typeCheck: true },
    overrides: [
      ...effectConfigResult.overrides,
      {
        // unicorn/throw-new-error treats Schema.TaggedError class definitions as throw sites; they contain no throw.
        files: ["tools/quality/effectExceptions.ts"],
        rules: { "unicorn/throw-new-error": "off" },
      },
      {
        // The Foldkit conventions (FOLDKIT.md): the framework's own rules, at the severity its recommended preset sets.
        files: ["apps/editor/**"],
        rules: foldkit.rules,
      },
      ...foldkit.overrides,
      {
        // Foldkit declares each Schema and its type under one name (`const Message` and `type Message`, as FOLDKIT.md
        // requires). Oxlint's no-redeclare does not know that TypeScript merges a value and a type of the same name;
        // the TypeScript checker still rejects a real redeclaration.
        files: ["apps/editor/src/**"],
        rules: { "eslint/no-redeclare": "off" },
      },
    ],
    rules: {
      ...effectConfigResult.rules,
      ...tsgoRules,
      ...localAntiSlopRules,
      "complexity/complexity": ["error", { cognitive: 15 }],
      "no-restricted-imports": [
        "error",
        { patterns: [...restrictedSourcePatterns] },
      ],
      // Workspace modules use lower camelCase filenames.
      "unicorn/filename-case": ["error", { case: "camelCase" }],
      // Preset contradiction: effecttsgo(prefer-effect-array) requires Effect's data-first Array module
      // (`Arr.map(xs, fn)`), which unicorn/no-array-method-this-argument misreads as a native
      // `.map(fn, thisArg)` call. Native array methods are already steered to Effect Array, so the rule
      // adds only false positives here. One global switch instead of a per-file list that drifts.
      "unicorn/no-array-method-this-argument": "off",
      "vite-plus/prefer-vite-plus-imports": "error",
    },
  },
  run: { cache: true },
  staged: { "*": "vp check --fix" },
});
