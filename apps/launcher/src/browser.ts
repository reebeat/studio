import { Effect, Schema } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import { HostPlatform } from "./hostPlatform.ts";

class OpenBrowserFailed extends Schema.TaggedError<
  OpenBrowserFailed,
  { readonly brand: unique symbol }
>()("OpenBrowserFailed", {
  cause: Schema.Defect(),
  command: Schema.String,
}) {}

// The program that opens a URL in the default browser, per operating system (the names `process.platform` has).
// The URL is always one this program built (`http://127.0.0.1:<port>/`), so it needs no quoting.
export const openCommand = (
  platform: string,
  url: string
): readonly [string, readonly string[]] => {
  if (platform === "darwin") {
    return ["open", [url]];
  }

  if (platform === "win32") {
    return ["cmd", ["/c", "start", "", url]];
  }

  return ["xdg-open", [url]];
};

export const openBrowser = Effect.fn("openBrowser")(function* open(
  url: string
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const host = yield* HostPlatform;
  const [program, args] = openCommand(host.name, url);

  yield* spawner.exitCode(ChildProcess.make(program, args)).pipe(
    Effect.mapError(
      (cause) => new OpenBrowserFailed({ cause, command: program })
    ),
    Effect.filterOrFail(
      (code) => code === 0,
      (code) =>
        new OpenBrowserFailed({
          cause: `exit code ${code}`,
          command: program,
        })
    )
  );
});
