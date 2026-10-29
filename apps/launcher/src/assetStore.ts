import {
  Context,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Record as Rec,
  Schema,
} from "effect";
import { Mime } from "effect/http";

export interface Asset {
  readonly bytes: Uint8Array;
  readonly contentType: string;
}

// The static files the server may serve, by the path of the file under the built app (`index.html`, `assets/x.js`).
// Asking for a key that is not there is an ordinary answer (`None`), not a failure.
export class AssetStore extends Context.Service<
  AssetStore,
  {
    readonly find: (key: string) => Effect.Effect<Option.Option<Asset>>;
  }
>()("reebeat-studio/launcher/AssetStore") {}

const octetStream = "application/octet-stream";

const assetOf = (key: string, bytes: Uint8Array): Asset => ({
  bytes,
  contentType: Option.getOrElse(Mime.getType(key), () => octetStream),
});

const ofFiles = (files: Readonly<Record<string, Uint8Array>>) =>
  AssetStore.of({
    find: (key) =>
      Effect.succeed(
        Option.map(Rec.get(files, key), (bytes) => assetOf(key, bytes))
      ),
  });

// The embedded form of the built app: file name to bytes, the bytes as Base64 text. `scripts/embed.ts` writes it as
// JSON with this schema and the binary reads it with this schema, so they cannot disagree.
export const EmbeddedAssets = Schema.Record(
  Schema.String,
  Schema.Uint8ArrayFromBase64
);

export const fromEmbedded = (encoded: typeof EmbeddedAssets.Encoded) =>
  Layer.effect(
    AssetStore,
    Schema.decodeEffect(EmbeddedAssets)(encoded).pipe(Effect.map(ofFiles))
  );

export const fromFiles = (files: Readonly<Record<string, Uint8Array>>) =>
  Layer.succeed(AssetStore, ofFiles(files));

// A built app on disk, for development and tests. A key that names no regular file (nothing there, or a directory such
// as `assets`) is `None`; any other read failure is a defect, because the keys come from `assetKeyOf`, which has
// already refused every path that leaves the directory.
export const fromDirectory = (root: string) =>
  Layer.effect(
    AssetStore,
    Effect.gen(function* directory() {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      return AssetStore.of({
        find: (key) =>
          Effect.gen(function* find() {
            const file = path.join(root, key);

            if (!(yield* fs.exists(file))) {
              return Option.none();
            }

            const info = yield* fs.stat(file);

            return info.type === "File"
              ? Option.some(assetOf(key, yield* fs.readFile(file)))
              : Option.none();
          }).pipe(Effect.orDie),
      });
    })
  );
