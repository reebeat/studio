import { assert, describe, it } from "@effect/vitest";
import { Cause, Exit } from "effect";

import { exitCodeOf } from "../src/exitCode.ts";

describe("exitCodeOf", () => {
  it("is 0 for a program that ends and for one that is interrupted (Ctrl-C, SIGTERM)", () => {
    assert.strictEqual(exitCodeOf(Exit.succeed("done")), 0);
    assert.strictEqual(exitCodeOf(Exit.failCause(Cause.interrupt(1))), 0);
  });

  it("is 1 for a failure and for a defect", () => {
    assert.strictEqual(exitCodeOf(Exit.fail("boom")), 1);
    assert.strictEqual(exitCodeOf(Exit.die("boom")), 1);
  });

  it("is 1 when an interruption comes with a real failure", () => {
    assert.strictEqual(
      exitCodeOf(
        Exit.failCause(Cause.combine(Cause.interrupt(1), Cause.fail("boom")))
      ),
      1
    );
  });
});
