import { assert, describe, it } from "@effect/vitest";
import {
  ByteSize,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Schema,
} from "effect";

import {
  AssetStore,
  EmbeddedAssets,
  fromDirectory,
  fromEmbedded,
} from "../src/assetStore.ts";

const bytes = (text: string) => new TextEncoder().encode(text);

describe("fromEmbedded", () => {
  it.effect(
    "serves what scripts/embed.ts writes: encode with the schema, read it back, same bytes and types",
    () =>
      Effect.gen(function* roundTrip() {
        const encoded = yield* Schema.encodeEffect(EmbeddedAssets)({
          "assets/a.js": bytes("x"),
          "index.html": bytes("<p>"),
        });

        const store = yield* AssetStore.pipe(
          Effect.provide(fromEmbedded(encoded))
        );

        const page = yield* store.find("index.html");
        const script = yield* store.find("assets/a.js");

        assert.deepStrictEqual(
          Option.map(page, (asset) => asset.bytes),
          Option.some(bytes("<p>"))
        );
        assert.deepStrictEqual(
          Option.map(page, (asset) => asset.contentType),
          Option.some("text/html")
        );
        assert.isTrue(Option.isSome(script));
        assert.isTrue(Option.isNone(yield* store.find("missing")));
      })
  );

  it.effect(
    "fails when the embedded data is not Base64 text, instead of serving garbage",
    () =>
      Effect.gen(function* corrupt() {
        const failure = yield* AssetStore.pipe(
          Effect.provide(fromEmbedded({ "index.html": "%%% not base64 %%%" })),
          Effect.flip
        );

        assert.strictEqual(failure._tag, "SchemaError");
      })
  );
});

const info = (type: FileSystem.File.Type): FileSystem.File.Info => ({
  atime: Option.none(),
  birthtime: Option.none(),
  blksize: Option.none(),
  blocks: Option.none(),
  dev: 0n,
  gid: Option.none(),
  ino: Option.none(),
  mode: 0o644,
  mtime: Option.none(),
  nlink: Option.none(),
  rdev: Option.none(),
  size: ByteSize.bytes(0),
  type,
  uid: Option.none(),
});

// A file system with one file, `/app/index.html`, and one directory, `/app/assets`. Reading a directory is an error,
// as on a real disk: the store must not try.
const fakeDisk = FileSystem.layerNoop({
  exists: (path) =>
    Effect.succeed(path === "/app/index.html" || path === "/app/assets"),
  readFile: (path) =>
    path === "/app/index.html"
      ? Effect.succeed(bytes("<p>hi"))
      : Effect.die(`read of ${path}`),
  stat: (path) =>
    Effect.succeed(info(path === "/app/assets" ? "Directory" : "File")),
});

describe("fromDirectory", () => {
  it.effect(
    "reads a file under the root; a missing key and a directory are None",
    () =>
      Effect.gen(function* directory() {
        const store = yield* AssetStore.pipe(
          Effect.provide(
            fromDirectory("/app").pipe(
              Layer.provide(Layer.mergeAll(fakeDisk, Path.layer))
            )
          )
        );

        assert.deepStrictEqual(
          Option.map(yield* store.find("index.html"), (asset) => asset.bytes),
          Option.some(bytes("<p>hi"))
        );
        assert.isTrue(Option.isNone(yield* store.find("nope.html")));
        // `GET /assets` names the directory: that is 404, not a crash.
        assert.isTrue(Option.isNone(yield* store.find("assets")));
      })
  );
});
