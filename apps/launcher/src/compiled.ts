import { BunRuntime } from "@effect/platform-bun";

import embedded from "../embedded/assets.embedded.json" with { type: "json" };
import { fromEmbedded } from "./assetStore.ts";
import { program } from "./cli.ts";
import { teardown } from "./exitCode.ts";

// The executable: the editor's build is inside the binary (`scripts/embed.ts` writes the JSON before `bun build --compile`).
BunRuntime.runMain(program(fromEmbedded(embedded)), { teardown });
