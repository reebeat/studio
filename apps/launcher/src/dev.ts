import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Layer } from "effect";

import { fromDirectory } from "./assetStore.ts";
import { program } from "./cli.ts";
import { teardown } from "./exitCode.ts";

// Development: serve the editor's last build from its directory (`bun run build` in apps/editor first).
BunRuntime.runMain(
  program(
    fromDirectory(new URL("../../editor/dist", import.meta.url).pathname).pipe(
      Layer.provide(BunServices.layer)
    )
  ),
  { teardown }
);
