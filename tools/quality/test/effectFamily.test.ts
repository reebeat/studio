import { NodeServices } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import {
  Array as Arr,
  Effect,
  FileSystem,
  Path,
  Record,
  Result,
  Schema,
  String as Str,
} from "effect";

import { effectFamilyDrift, tsgoDrift } from "../effectFamily.ts";

const readLock = Effect.gen(function* readLock() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  return yield* fs.readFileString(
    yield* path.fromFileUrl(new URL("../../../bun.lock", import.meta.url))
  );
});

const entry = (name: string, version: string) =>
  `    "${name}": ["${name}@${version}", "", {}, "sha512-x"],\n`;

describe("Effect family versions", () => {
  it.effect("every @effect/* package in bun.lock is the effect version", () =>
    Effect.gen(function* aligned() {
      assert.deepStrictEqual(effectFamilyDrift(yield* readLock), []);
    }).pipe(Effect.provide(NodeServices.layer))
  );

  it.effect(
    "a family package behind effect is reported by name and version",
    () =>
      Effect.gen(function* probe() {
        const lock = yield* readLock;
        const behind = `${lock}${entry("@effect/probe", "4.0.0")}`;

        assert.deepStrictEqual(effectFamilyDrift(behind), [
          `@effect/probe is locked at 4.0.0, effect at ${/"effect@(?<version>[^"]+)"/u.exec(lock)?.groups?.version}`,
        ]);
      }).pipe(Effect.provide(NodeServices.layer))
  );

  it("passes when effect and every family package share one version", () => {
    const lock = `${entry("effect", "4.0.6")}${entry("@effect/sql-pg", "4.0.6")}${entry("@effect/vitest", "4.0.6")}`;

    assert.deepStrictEqual(effectFamilyDrift(lock), []);
  });

  it.effect(
    "names the drifted package when one entry of the real bun.lock changes",
    () =>
      Effect.gen(function* drifted() {
        const lock = yield* readLock;

        const version = /"effect@(?<version>[^"]+)"/u.exec(lock)?.groups
          ?.version;

        const scratch = Str.replace(
          /"@effect\/vitest@[^"]+"/u,
          '"@effect/vitest@0.0.1"'
        )(lock);

        assert.notStrictEqual(scratch, lock);
        assert.deepStrictEqual(effectFamilyDrift(scratch), [
          `@effect/vitest is locked at 0.0.1, effect at ${version}`,
        ]);
      }).pipe(Effect.provide(NodeServices.layer))
  );

  it("names a nested family package by what it is, not by its path", () => {
    const lock = `${entry("effect", "4.0.6")}    "host/@effect/sql-pg": ["@effect/sql-pg@4.0.5", "", {}, "x"],\n`;

    assert.deepStrictEqual(effectFamilyDrift(lock), [
      "@effect/sql-pg is locked at 4.0.5, effect at 4.0.6",
    ]);
  });

  it("leaves @effect/tsgo and its binaries on their own release line", () => {
    const lock = `${entry("effect", "4.0.6")}${entry("@effect/tsgo", "0.53.1")}${entry("@effect/tsgo-linux-x64", "0.53.1")}`;

    assert.deepStrictEqual(effectFamilyDrift(lock), []);
  });

  it("fails when effect itself is locked twice or not at all", () => {
    assert.lengthOf(
      effectFamilyDrift(
        `${entry("effect", "4.0.5")}${entry("effect", "4.0.6")}`
      ),
      1
    );
    assert.lengthOf(effectFamilyDrift(entry("@effect/sql-pg", "4.0.6")), 1);
  });
});

const nested = (host: string, version: string) =>
  `    "${host}/@effect/tsgo": ["@effect/tsgo@${version}", "", {}, "sha512-x"],\n`;

describe("one @effect/tsgo for the repository", () => {
  it.effect(
    "the real bun.lock has one version for the root and the workspace packages",
    () =>
      Effect.gen(function* aligned() {
        assert.deepStrictEqual(tsgoDrift(yield* readLock), []);
      }).pipe(Effect.provide(NodeServices.layer))
  );

  it("negative control: a workspace package locked at another version is named with the version of the root", () => {
    const lock = `${entry("@effect/tsgo", "0.63.0")}${nested("@tsukuri/quality", "0.53.1")}`;

    assert.deepStrictEqual(tsgoDrift(lock), [
      "@effect/tsgo is locked at 0.53.1 under @tsukuri/quality, at 0.63.0 at the root",
    ]);
  });

  it.effect(
    "negative control: the same drift added to the real bun.lock is reported",
    () =>
      Effect.gen(function* drifted() {
        const lock = `${yield* readLock}${nested("@tsukuri/quality", "0.53.1")}`;

        assert.lengthOf(tsgoDrift(lock), 1);
      }).pipe(Effect.provide(NodeServices.layer))
  );

  it("tolerates the copy inside @phibkro/oxlint-effect-plugin, which imports no @effect/tsgo module", () => {
    const lock = `${entry("@effect/tsgo", "0.63.0")}${nested("@phibkro/oxlint-effect-plugin", "0.48.0")}`;

    assert.deepStrictEqual(tsgoDrift(lock), []);
  });

  it("names a copy under any other dependency, and a lock without a root copy", () => {
    assert.lengthOf(
      tsgoDrift(
        `${entry("@effect/tsgo", "0.63.0")}${nested("somebody-else", "0.48.0")}`
      ),
      1
    );
    assert.deepStrictEqual(tsgoDrift(nested("@tsukuri/quality", "0.53.1")), [
      "@effect/tsgo has no root entry in bun.lock",
    ]);
  });
});

const Registry = Schema.Struct({
  exceptions: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      versions: Schema.Record(Schema.String, Schema.String),
    })
  ),
});

const readRegistry = Effect.gen(function* readRegistry() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  return yield* Schema.decodeEffect(Schema.fromJsonString(Registry))(
    yield* fs.readFileString(
      yield* path.fromFileUrl(
        new URL("../effect-exceptions.json", import.meta.url)
      )
    )
  );
});

/** What a record says about `name` when it differs from the lock: a missing key (`recorded` undefined) is a difference. */
const staleRecord = (
  id: string,
  name: string,
  recorded: string | undefined,
  locked: string | undefined
) =>
  recorded === locked
    ? Result.failVoid
    : Result.succeed(
        recorded === undefined
          ? `${id} records no ${name}, the lock holds ${locked}`
          : `${id} records ${name} ${recorded}, the lock holds ${locked}`
      );

interface Held {
  readonly "@effect/tsgo": string | undefined;
  readonly effect: string | undefined;
}

/** Every exception record that does not name each held package at the version the lock holds, a missing key included. */
const staleRecords = (
  exceptions: readonly {
    readonly id: string;
    readonly versions: Readonly<Record<string, string>>;
  }[],
  held: Held
) =>
  Arr.flatMap(exceptions, ({ id, versions }) =>
    Arr.filterMap(Record.toEntries(held), ([name, version]) =>
      staleRecord(id, name, versions[name], version)
    )
  );

const heldBy = (lock: string): Held => ({
  "@effect/tsgo": /"@effect\/tsgo": \["@effect\/tsgo@(?<version>[^"]+)"/u.exec(
    lock
  )?.groups?.version,
  effect: /"effect@(?<version>[^"]+)"/u.exec(lock)?.groups?.version,
});

describe("registered exceptions follow the upgrade", () => {
  it.effect(
    "every exception records the effect and @effect/tsgo versions the lock holds, so a bump reopens it",
    () =>
      Effect.gen(function* recorded() {
        const held = heldBy(yield* readLock);

        assert.isDefined(held.effect);
        assert.isDefined(held["@effect/tsgo"]);
        assert.deepStrictEqual(
          staleRecords((yield* readRegistry).exceptions, held),
          []
        );
      }).pipe(Effect.provide(NodeServices.layer))
  );

  it("negative control: a record behind the lock is named", () => {
    assert.deepStrictEqual(
      Result.getOrElse(
        staleRecord("EX-0001", "effect", "4.0.6", "4.1.0"),
        () => ""
      ),
      "EX-0001 records effect 4.0.6, the lock holds 4.1.0"
    );
  });

  it.effect(
    "negative control: deleting `effect` or `@effect/tsgo` from a record is a failure, not a pass",
    () =>
      Effect.gen(function* missing() {
        const held = heldBy(yield* readLock);

        // The registry may be empty (this repository has no suppression): then the control runs on a record that
        // names the held versions, which is a record the lock agrees with.
        const fixture = {
          id: "EX-0000",
          versions: {
            "@effect/tsgo": held["@effect/tsgo"] ?? "",
            effect: held.effect ?? "",
          },
        };

        const [first = fixture, ...rest] = (yield* readRegistry).exceptions;

        const without = (name: string) => ({
          ...first,
          versions: Record.remove(first.versions, name),
        });

        assert.deepStrictEqual(
          staleRecords([without("effect"), ...rest], held),
          [`${first.id} records no effect, the lock holds ${held.effect}`]
        );
        assert.deepStrictEqual(
          staleRecords([without("@effect/tsgo"), ...rest], held),
          [
            `${first.id} records no @effect/tsgo, the lock holds ${held["@effect/tsgo"]}`,
          ]
        );
      }).pipe(Effect.provide(NodeServices.layer))
  );
});
