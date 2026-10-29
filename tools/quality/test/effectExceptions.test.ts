import { NodeServices } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect, FileSystem, Path, Schema } from "effect";

import { checkExceptions } from "../effectExceptions.ts";

interface Source {
  readonly path: string;
  readonly text: string;
}

interface Entry {
  readonly id: string;
  readonly nativeAlternativesExamined: readonly string[];
  readonly owner: string;
  readonly reason: string;
  readonly retirementTrigger: string;
  readonly scope: {
    readonly directives: readonly string[];
    readonly files: readonly string[];
  };
  readonly versions: Readonly<Record<string, string>>;
}

const entry = (id: string, file: string, directive: string): Entry => ({
  id,
  nativeAlternativesExamined: ["fixture: no native alternative"],
  owner: "fixture",
  reason: "fixture",
  retirementTrigger: "fixture",
  scope: { directives: [directive], files: [file] },
  versions: {},
});

/** Writes the sources and the registry to a fresh temporary directory (removed with the scope) and checks them. */
const check = Effect.fn("check")(function* check(
  sources: readonly Source[],
  exceptions: readonly Entry[]
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.makeTempDirectoryScoped();
  const registryPath = path.join(root, "effect-exceptions.json");

  yield* Effect.forEach(sources, (source) =>
    Effect.gen(function* write() {
      const target = path.join(root, source.path);

      yield* fs.makeDirectory(path.dirname(target), { recursive: true });
      yield* fs.writeFileString(target, source.text);
    })
  );

  yield* fs.writeFileString(
    registryPath,
    yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))({
      description: "fixture",
      exceptions,
    })
  );

  return yield* checkExceptions({
    paths: Arr.map(sources, ({ path: sourcePath }) => sourcePath),
    registryPath,
    root,
  });
});

const suppressed: Source = {
  path: "src/a.ts",
  text: "// oxlint-disable-next-line no-console\nconsole.log(1);\n",
};

describe("Effect exception registry", () => {
  it.effect(
    "fails on a suppression without an entry and names file and line",
    () =>
      Effect.gen(function* unregistered() {
        const { findings } = yield* check([suppressed], []);

        assert.deepStrictEqual(findings, [
          "src/a.ts:1: unregistered oxlint-disable-next-line",
        ]);
      }).pipe(Effect.provide(NodeServices.layer))
  );

  it.effect(
    "passes when the suppression has an entry for its file and directive",
    () =>
      Effect.gen(function* registered() {
        const { exceptionCount, findings } = yield* check(
          [suppressed],
          [entry("EX-0001", "src/a.ts", "oxlint-disable-next-line")]
        );

        assert.deepStrictEqual(findings, []);
        assert.strictEqual(exceptionCount, 1);
      }).pipe(Effect.provide(NodeServices.layer))
  );

  it.effect("fails on an entry whose suppression was removed", () =>
    Effect.gen(function* stale() {
      const { findings } = yield* check(
        [{ path: "src/a.ts", text: "console.log(1);\n" }],
        [entry("EX-0001", "src/a.ts", "oxlint-disable-next-line")]
      );

      assert.deepStrictEqual(findings, [
        "EX-0001 has no live suppression site",
      ]);
    }).pipe(Effect.provide(NodeServices.layer))
  );

  it.effect("fails on an entry for a file that does not exist", () =>
    Effect.gen(function* missing() {
      const { findings } = yield* check(
        [{ path: "src/a.ts", text: "export const a = 1;\n" }],
        [entry("EX-0001", "src/gone.ts", "@ts-ignore")]
      );

      assert.deepStrictEqual(findings, [
        "EX-0001 lists no existing source file",
        "EX-0001 has no live suppression site",
      ]);
    }).pipe(Effect.provide(NodeServices.layer))
  );

  it.effect(
    "does not accept an entry for another directive of the same file",
    () =>
      Effect.gen(function* otherDirective() {
        const { findings } = yield* check(
          [
            {
              path: "src/a.ts",
              text: "// @ts-ignore\nexport const a: number = '';\n",
            },
          ],
          [entry("EX-0001", "src/a.ts", "oxlint-disable-next-line")]
        );

        assert.deepStrictEqual(findings, [
          "src/a.ts:1: unregistered @ts-ignore",
          "EX-0001 has no live suppression site",
        ]);
      }).pipe(Effect.provide(NodeServices.layer))
  );

  it.effect("fails on a duplicate entry id", () =>
    Effect.gen(function* duplicate() {
      const { findings } = yield* check(
        [suppressed],
        [
          entry("EX-0001", "src/a.ts", "oxlint-disable-next-line"),
          entry("EX-0001", "src/a.ts", "oxlint-disable-next-line"),
        ]
      );

      assert.deepStrictEqual(findings, ["duplicate id EX-0001"]);
    }).pipe(Effect.provide(NodeServices.layer))
  );

  it.effect(
    "ignores directive text outside comments and files under node_modules",
    () =>
      Effect.gen(function* ignored() {
        const { findings } = yield* check(
          [
            {
              path: "src/a.ts",
              text: 'export const note = "oxlint-disable-next-line";\n',
            },
            { path: "node_modules/pkg/index.js", text: "// eslint-disable\n" },
          ],
          []
        );

        assert.deepStrictEqual(findings, []);
      }).pipe(Effect.provide(NodeServices.layer))
  );
});
