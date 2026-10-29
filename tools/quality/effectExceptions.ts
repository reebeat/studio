// Provenance: split from phibkro/vektorprogrammet-reimagined @ 797e9e41d96194b9479ff224ac1c40bbc0545888
// (tools/quality/checkEffectExceptions.ts) so tests can run the check on fixtures. See PROVENANCE.md.
import {
  Array as Arr,
  Effect,
  FileSystem,
  Option,
  Path,
  Schema,
  String as Str,
  pipe,
} from "effect";
import { parseSync } from "oxc-parser";

const Exception = Schema.Struct({
  id: Schema.NonEmptyString,
  nativeAlternativesExamined: Schema.NonEmptyArray(Schema.NonEmptyString),
  owner: Schema.NonEmptyString,
  reason: Schema.NonEmptyString,
  retirementTrigger: Schema.NonEmptyString,
  scope: Schema.Struct({
    directives: Schema.NonEmptyArray(Schema.NonEmptyString),
    files: Schema.NonEmptyArray(Schema.NonEmptyString),
  }),
  versions: Schema.Record(Schema.NonEmptyString, Schema.NonEmptyString),
});

const Registry = Schema.Struct({
  description: Schema.NonEmptyString,
  exceptions: Schema.Array(Exception),
});

const decodeRegistry = Schema.decodeUnknownEffect(
  Schema.fromJsonString(Registry)
);

export class RegistryViolations extends Schema.TaggedError<
  RegistryViolations,
  { readonly brand: unique symbol }
>()("RegistryViolations", {
  message: Schema.String,
}) {}

const directivePattern =
  /(?:oxlint-disable(?:-next-line|-line)?|eslint-disable(?:-next-line|-line)?|@ts-expect-error|@ts-ignore|@ts-nocheck)/gu;

const sourcePattern = /\.[cm]?[jt]sx?$/u;

interface Site {
  readonly directive: string;
  readonly line: number;
  readonly path: string;
}

const isScannable = (path: string): boolean =>
  sourcePattern.test(path) &&
  !Str.startsWith("node_modules/")(path) &&
  !Str.includes("/node_modules/")(path) &&
  !Str.startsWith(".devenv/")(path) &&
  !Str.startsWith(".worktrees/")(path);

export interface ExceptionCheckInput {
  /** Repository-relative paths that git tracks or would track. Files missing on disk are skipped. */
  readonly paths: readonly string[];
  /** Absolute path of the registry JSON. */
  readonly registryPath: string;
  /** Absolute directory that `paths` are relative to. */
  readonly root: string;
}

interface ExceptionCheckResult {
  readonly exceptionCount: number;
  /** One sentence per violation, each naming the file and line or the registry entry. Empty when clean. */
  readonly findings: readonly string[];
}

/**
 * Every suppression directive in the scanned sources needs a registry entry for that file and directive, and every
 * registry entry needs a live suppression and an existing file.
 */
export const checkExceptions = Effect.fn("checkExceptions")(function* check(
  input: ExceptionCheckInput
) {
  const fs = yield* FileSystem.FileSystem;
  const pathService = yield* Path.Path;

  // `git ls-files -c` also lists tracked files deleted from the working tree (for example mid-rename).
  const present = Arr.flatten(
    yield* Effect.forEach(input.paths, (path) =>
      Effect.map(fs.exists(pathService.join(input.root, path)), (exists) =>
        exists ? [path] : []
      )
    )
  );

  const registry = yield* decodeRegistry(
    yield* fs.readFileString(input.registryPath)
  );

  const sitesPerFile = yield* Effect.forEach(
    Arr.filter(present, isScannable),
    (path) =>
      Effect.map(
        fs.readFileString(pathService.join(input.root, path)),
        (text): readonly Site[] => {
          const { comments } = parseSync(path, text);

          return Arr.flatMap(comments, (comment) => {
            const line = pipe(
              text,
              Str.slice(0, comment.start),
              Str.split("\n")
            ).length;

            return Arr.map(
              [...Str.matchAll(directivePattern)(comment.value)],
              ([directive]): Site => ({ directive, line, path })
            );
          });
        }
      )
  );

  const classified = Arr.map(Arr.flatten(sitesPerFile), (site) => ({
    exception: Arr.findFirst(
      registry.exceptions,
      (entry) =>
        entry.scope.files.includes(site.path) &&
        entry.scope.directives.includes(site.directive)
    ),
    site,
  }));

  const unregistered = Arr.flatMap(classified, ({ exception, site }) =>
    Option.isNone(exception)
      ? [`${site.path}:${site.line}: unregistered ${site.directive}`]
      : []
  );

  const liveIds = new Set(
    Arr.flatMap(classified, ({ exception }) =>
      Option.isSome(exception) ? [exception.value.id] : []
    )
  );

  const stale = Arr.flatMap(registry.exceptions, (exception) => [
    ...(Arr.some(present, (path) => exception.scope.files.includes(path))
      ? []
      : [`${exception.id} lists no existing source file`]),
    ...(liveIds.has(exception.id)
      ? []
      : [`${exception.id} has no live suppression site`]),
  ]);

  const ids = Arr.map(registry.exceptions, (entry) => entry.id);

  const duplicates = Arr.flatMap(ids, (id, index) =>
    Arr.contains(Arr.take(ids, index), id) ? [`duplicate id ${id}`] : []
  );

  return {
    exceptionCount: registry.exceptions.length,
    findings: [...unregistered, ...stale, ...duplicates],
  } satisfies ExceptionCheckResult;
});
