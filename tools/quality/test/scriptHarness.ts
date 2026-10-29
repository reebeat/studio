import { Config, Effect, FileSystem, Path, Schema } from "effect";
import { ChildProcessSpawner } from "effect/process";

/**
 * What a test of a shell script under `.agents/skills` needs: a scratch directory that is removed with the scope, the
 * repository root, the services to spawn the script, and the system `PATH` to put a stub in front of.
 */
export const scriptHarness = Effect.gen(function* scriptHarness() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const dir = yield* fs.makeTempDirectoryScoped();
  const root = yield* path.fromFileUrl(new URL("../../../", import.meta.url));
  const systemPath = yield* Config.schema(Schema.String, "PATH");

  return { dir, fs, path, root, spawner, systemPath };
});
