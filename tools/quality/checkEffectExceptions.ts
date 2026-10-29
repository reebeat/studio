// Provenance: adapted from phibkro/vektorprogrammet-reimagined @ 797e9e41d96194b9479ff224ac1c40bbc0545888
// (tools/quality/checkEffectExceptions.ts). The checks live in effectExceptions.ts. See PROVENANCE.md.
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Array as Arr, Effect, Path, String as Str } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import { checkExceptions, RegistryViolations } from "./effectExceptions.ts";

/** The registry sits next to this checker; the source paths inside it stay repo-relative. */
const registryPath = new URL("effect-exceptions.json", import.meta.url)
  .pathname;

const main = Effect.gen(function* main() {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const path = yield* Path.Path;

  const listing = yield* spawner.string(
    ChildProcess.make("git", ["ls-files", "-c", "-o", "--exclude-standard"])
  );

  const { exceptionCount, findings } = yield* checkExceptions({
    paths: Arr.filter(Str.split(listing, /\r?\n/u), (line) => line !== ""),
    registryPath,
    root: path.resolve("."),
  });

  if (Arr.isReadonlyArrayNonEmpty(findings)) {
    const report = Arr.join(findings, "\n");

    yield* Effect.logError(report);

    return yield* new RegistryViolations({ message: report });
  }

  return yield* Effect.log(
    `Effect registry clean (${exceptionCount} suppression exceptions).`
  );
});

NodeRuntime.runMain(main.pipe(Effect.provide(NodeServices.layer)), {
  disableErrorReporting: true,
});
