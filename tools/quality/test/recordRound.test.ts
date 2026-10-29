import { NodeServices } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect } from "effect";
import { ChildProcess } from "effect/process";

import { scriptHarness } from "./scriptHarness.ts";

// The script is the contract (spec 0003, F5): it runs with a stub `gh` first on PATH that records each call.
const stubGh = `#!/usr/bin/env bash
echo "$*" >>"$(dirname "$0")/gh-calls"
case "$1 $2" in
  "pr view") echo 0123456789abcdef0123456789abcdef01234567 ;;
  *) cat >/dev/null ;;
esac
`;

const run = (verdict: string, body: string) =>
  Effect.gen(function* recordRound() {
    const { dir, fs, path, root, spawner, systemPath } = yield* scriptHarness;
    const script = path.join(root, ".agents/skills/review-pr/record-round.sh");

    yield* fs.writeFileString(path.join(dir, "gh"), stubGh, { mode: 0o755 });
    yield* fs.writeFileString(path.join(dir, "body.md"), body);

    const exitCode = yield* spawner.exitCode(
      ChildProcess.make(
        "bash",
        [script, "7", "1", verdict, path.join(dir, "body.md")],
        {
          env: { PATH: `${dir}:${systemPath}` },
        }
      )
    );

    const called = yield* fs.exists(path.join(dir, "gh-calls"));

    return { called, exitCode: Number(exitCode) };
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer));

const body = (
  author: string,
  reviewers: string,
  checked = "plan, implementation, agreement"
) =>
  Arr.join(
    [
      `Author: ${author}`,
      `Reviewers: ${reviewers}`,
      ...(checked === "" ? [] : [`Checked: ${checked}`]),
      "",
      "No findings.",
    ],
    "\n"
  );

describe("record-round.sh", () => {
  it.effect("records a pass whose reviewers are not the author", () =>
    Effect.gen(function* recorded() {
      assert.deepStrictEqual(
        yield* run("pass", body("StudioSkills", "RevOne, RevTwo")),
        { called: true, exitCode: 0 }
      );
    })
  );

  it.effect(
    "refuses a pass that the author is among the reviewers of, before calling gh",
    () =>
      Effect.gen(function* refused() {
        assert.deepStrictEqual(
          yield* run("pass", body("StudioSkills", "RevOne,  studioskills ")),
          {
            called: false,
            exitCode: 65,
          }
        );
      })
  );

  it.effect("lets the author record a round that asks for changes", () =>
    Effect.gen(function* changes() {
      assert.deepStrictEqual(
        yield* run("changes", body("StudioSkills", "StudioSkills")),
        { called: true, exitCode: 0 }
      );
    })
  );

  it.effect("refuses a body without Author, Reviewers or Checked", () =>
    Effect.gen(function* missing() {
      assert.deepStrictEqual(
        yield* run("pass", body("StudioSkills", "RevOne", "")),
        { called: false, exitCode: 65 }
      );
      assert.deepStrictEqual(
        yield* run("pass", "Reviewers: RevOne\nChecked: plan\n"),
        { called: false, exitCode: 65 }
      );
      assert.deepStrictEqual(yield* run("pass", "Author: A\nChecked: plan\n"), {
        called: false,
        exitCode: 65,
      });
    })
  );
});
