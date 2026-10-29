import { NodeServices } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect, FileSystem, Path, String as Str } from "effect";

import { featureMapFindings } from "../featureMap.ts";
import type { Source } from "../featureMap.ts";

const readMarkdown = (directory: string) =>
  Effect.gen(function* markdownFiles() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* path.fromFileUrl(new URL("../../../", import.meta.url));

    const names = Arr.filter(
      yield* fs.readDirectory(path.join(root, directory)),
      Str.endsWith(".md")
    );

    return yield* Effect.forEach(names, (name) =>
      Effect.map(
        fs.readFileString(path.join(root, directory, name)),
        (text): Source => ({ file: `${directory}/${name}`, text })
      )
    );
  });

const spec = (file: string, body: string): Source => ({
  file: `docs/specs/${file}`,
  text: body,
});

const feature = (...entries: readonly string[]): Source => ({
  file: "features/shell.md",
  text: Arr.join(entries, "\n"),
});

const entry = (id: string, specs: string) =>
  `### \`${id}\`\n\nSpec: ${specs}\n\nObserve it.\n`;

describe("the verify skill's feature map and the specs", () => {
  it.effect(
    "every spec is named by a feature entry or says it needs none, on this head",
    () =>
      Effect.gen(function* head() {
        const specs = yield* readMarkdown("docs/specs");

        const features = yield* readMarkdown(
          ".agents/skills/verify-studio/features"
        );

        assert.isAbove(specs.length, 0);
        assert.isAbove(features.length, 0);
        assert.deepStrictEqual(featureMapFindings(specs, features), []);
      }).pipe(Effect.provide(NodeServices.layer))
  );

  it("passes when an entry names the spec", () => {
    assert.deepStrictEqual(
      featureMapFindings(
        [spec("0000-a.md", "Status: spec")],
        [feature(entry("shell-load", "0000"))]
      ),
      []
    );
  });

  it("names a spec that has neither an entry nor a statement (F2 control)", () => {
    assert.deepStrictEqual(
      featureMapFindings(
        [spec("0004-new.md", "Status: spec")],
        [feature(entry("shell-load", "0004"))]
      ),
      []
    );

    const [finding, ...rest] = featureMapFindings(
      [
        spec("0004-new.md", "Status: spec"),
        spec("0005-other.md", "Status: spec"),
      ],
      [feature(entry("shell-load", "0004"))]
    );

    assert.deepStrictEqual(rest, []);
    assert.include(
      finding ?? "",
      "docs/specs/0005-other.md: no feature entry names this spec"
    );
  });

  it("accepts a spec that says none, with a reason", () => {
    assert.deepStrictEqual(
      featureMapFindings(
        [spec("0003-x.md", "Status: spec\nVerify skill: none, process only")],
        []
      ),
      []
    );
  });

  it("refuses a statement without a reason, or with an unknown kind", () => {
    assert.lengthOf(
      featureMapFindings([spec("0003-x.md", "Verify skill: none")], []),
      1
    );
    assert.lengthOf(
      featureMapFindings([spec("0003-x.md", "Verify skill: maybe, later")], []),
      1
    );
  });

  it("allows pending only while the Status says planned (F4 control)", () => {
    assert.deepStrictEqual(
      featureMapFindings(
        [
          spec(
            "0001-x.md",
            "Status: **planned, blocked**\nVerify skill: pending, not built"
          ),
        ],
        []
      ),
      []
    );
    assert.deepStrictEqual(
      featureMapFindings(
        [spec("0001-x.md", "Status: spec\nVerify skill: pending, not built")],
        []
      ),
      [
        'docs/specs/0001-x.md: "Verify skill: pending" is allowed only while its Status says planned',
      ]
    );
  });

  it("refuses a spec that says none while an entry names it (F4 control)", () => {
    assert.deepStrictEqual(
      featureMapFindings(
        [spec("0000-a.md", "Status: spec\nVerify skill: none, nothing to see")],
        [feature(entry("shell-load", "0000"))]
      ),
      [
        'docs/specs/0000-a.md: says "Verify skill: none" but a feature entry names it',
      ]
    );
  });

  it("reports an entry that names a missing spec, has no Spec line, or repeats an id (F3 control)", () => {
    const findings = featureMapFindings(
      [spec("0000-a.md", "Status: spec")],
      [
        feature(
          entry("shell-load", "0000, 0009"),
          "### `no-spec`\n\nObserve it.\n",
          entry("shell-load", "0000"),
          "### Plain heading\n"
        ),
      ]
    );

    assert.deepStrictEqual(findings, [
      "feature id `shell-load` is defined more than once",
      'features/shell.md: a "###" heading that does not open with an id in backticks: "Plain heading"',
      'features/shell.md: feature `no-spec` has no "Spec: NNNN" line',
      "features/shell.md: feature `shell-load` names spec 0009, which does not exist in docs/specs",
    ]);
  });
});
