import { Array as Arr, Option, Order, Result, String as Str } from "effect";

interface Locked {
  readonly name: string;
  readonly version: string;
}

// A `bun.lock` entry is `"<key>": ["<name>@<version>", ...]`. The key can be a nested path, the name cannot.
const entry =
  /^\s+"[^"]+": \["(?<name>effect|@effect\/[^@"]+)@(?<version>[^"]+)"/gmu;

// `@effect/tsgo` and its platform binaries are a separate release line.
const ownLine = /^@effect\/tsgo(?:-|$)/u;

const locked = (lock: string): readonly Locked[] =>
  Arr.filterMap(Arr.fromIterable(Str.matchAll(entry)(lock)), ({ groups }) =>
    groups?.name === undefined || groups.version === undefined
      ? Result.failVoid
      : Result.succeed({ name: groups.name, version: groups.version })
  );

/**
 * Sentences that describe how the `@effect/*` family in a `bun.lock` text steps out of line with `effect`.
 * Empty when `effect` has one locked version and every family package is that version.
 */
export const effectFamilyDrift = (lock: string): readonly string[] => {
  const entries = locked(lock);

  const versions = Arr.sort(
    Arr.dedupe(
      Arr.map(
        Arr.filter(entries, ({ name }) => name === "effect"),
        ({ version }) => version
      )
    ),
    Order.String
  );

  const [effect, ...others] = versions;

  if (effect === undefined || others.length > 0) {
    return [
      `effect must have exactly one locked version, found: ${Arr.isArrayNonEmpty(versions) ? Arr.join(versions, ", ") : "none"}`,
    ];
  }

  return Arr.filterMap(entries, ({ name, version }) =>
    name === "effect" || ownLine.test(name) || version === effect
      ? Result.failVoid
      : Result.succeed(`${name} is locked at ${version}, effect at ${effect}`)
  );
};

// A `@effect/tsgo` entry: its key is `@effect/tsgo` at the root or `<host>/@effect/tsgo` for a copy nested under `host`
// (a workspace package such as `@reebeat/quality`, or a dependency that pins its own).
const tsgoEntry =
  /^\s+"(?<key>(?:[^"]+\/)?@effect\/tsgo)": \["@effect\/tsgo@(?<version>[^"]+)"/gmu;

/**
 * Dependencies whose own nested copy of `@effect/tsgo` is tolerated: it resolves only for that dependency's imports.
 * `@phibkro/oxlint-effect-plugin` 0.2.0 pins 0.48.0 and imports no `@effect/tsgo` module (its `dist` names the
 * package only in rule ids and text), so its copy feeds no preset, schema or binary of this repository.
 */
const transitiveHosts: readonly string[] = ["@phibkro/oxlint-effect-plugin"];

const hostOf = (key: string): string =>
  key === "@effect/tsgo" ? "" : Str.slice(0, -"/@effect/tsgo".length)(key);

/**
 * Sentences that describe how `@effect/tsgo` in a `bun.lock` text is not one version for the repository: the presets
 * (`@effect/tsgo/oxlint-presets`), the schema and the patched binaries all resolve from the copy the importing
 * package gets, so a workspace package with its own version reads other rules than the root. Empty when the root has a
 * copy and every other copy outside `transitiveHosts` is that version.
 */
export const tsgoDrift = (lock: string): readonly string[] => {
  const copies = Arr.filterMap(
    Arr.fromIterable(Str.matchAll(tsgoEntry)(lock)),
    ({ groups }) =>
      groups?.key === undefined || groups.version === undefined
        ? Result.failVoid
        : Result.succeed({ host: hostOf(groups.key), version: groups.version })
  );

  const root = Arr.findFirst(copies, ({ host }) => host === "");

  if (Option.isNone(root)) {
    return ["@effect/tsgo has no root entry in bun.lock"];
  }

  return Arr.filterMap(copies, ({ host, version }) =>
    Arr.contains(transitiveHosts, host) || version === root.value.version
      ? Result.failVoid
      : Result.succeed(
          `@effect/tsgo is locked at ${version} under ${host}, at ${root.value.version} at the root`
        )
  );
};
