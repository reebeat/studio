import { BunRuntime, BunServices } from "@effect/platform-bun";
import {
  Array as Arr,
  Effect,
  FileSystem,
  Option,
  Path,
  Record as Rec,
  Schema,
  String as Str,
} from "effect";

import { EmbeddedAssets } from "../src/assetStore.ts";

// Reads every file of the built editor and writes them as one JSON document the binary embeds. Run after
// `bun run build` in apps/editor (the root `bun run build` orders them).
const embed = Effect.gen(function* run() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = path.resolve(import.meta.dirname, "../../editor/dist");

  const out = path.resolve(
    import.meta.dirname,
    "../embedded/assets.embedded.json"
  );

  const names = yield* fs.readDirectory(root, { recursive: true });

  const files = yield* Effect.forEach(names, (name) =>
    fs
      .stat(path.join(root, name))
      .pipe(
        Effect.flatMap((info) =>
          info.type === "File"
            ? fs
                .readFile(path.join(root, name))
                .pipe(
                  Effect.map((bytes) =>
                    Option.some([
                      Str.replaceAll("\\", "/")(name),
                      bytes,
                    ] as const)
                  )
                )
            : Effect.succeedNone
        )
      )
  );

  const assets = Rec.fromEntries(Arr.getSomes(files));

  yield* Rec.has(assets, "index.html")
    ? Effect.void
    : Effect.die(`${root} has no index.html: build apps/editor first`);

  yield* fs.makeDirectory(path.dirname(out), { recursive: true });
  yield* fs.writeFileString(
    out,
    yield* Schema.encodeEffect(Schema.fromJsonString(EmbeddedAssets))(assets)
  );
  yield* Effect.log(`embedded ${Rec.size(assets)} files into ${out}`);
});

BunRuntime.runMain(embed.pipe(Effect.provide(BunServices.layer)));
