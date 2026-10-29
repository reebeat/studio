import { Console, Effect, Layer } from "effect";
import { Command, Flag } from "effect/cli";
import { FetchHttpClient, HttpServer } from "effect/http";

import type { AssetStore } from "./assetStore.ts";
import { openBrowser } from "./browser.ts";
import { serverLayer } from "./bunServer.ts";
import { selfCheck } from "./check.ts";
import { HostPlatform } from "./hostPlatform.ts";
import { app } from "./server.ts";

const version = "0.0.0";

const checkThenExit = (url: string) =>
  selfCheck(url).pipe(Effect.andThen(Console.log("check: ok")));

const serveUntilInterrupted = (url: string, noOpen: boolean) =>
  (noOpen
    ? Effect.void
    : openBrowser(url).pipe(
        Effect.catchTag("OpenBrowserFailed", (failure) =>
          Console.log(
            `could not open a browser (${failure.command}); open ${url} yourself`
          )
        )
      )
  ).pipe(Effect.andThen(Effect.never));

const launch = Effect.fn("launch")(function* run(options: {
  readonly check: boolean;
  readonly noOpen: boolean;
}) {
  const server = yield* HttpServer.HttpServer;

  yield* HttpServer.serveEffect(app);

  const url = `${HttpServer.formatAddress(server.address)}/`;

  yield* Console.log(`reebeat studio listening on ${url}`);
  yield* options.check
    ? checkThenExit(url)
    : serveUntilInterrupted(url, options.noOpen);
});

const command = Command.make(
  "reebeat-studio",
  {
    check: Flag.Boolean("check").pipe(
      Flag.withDescription(
        "Start, verify the served app over HTTP, and exit (exit code 1 when it fails)"
      ),
      Flag.withDefault(false)
    ),
    noOpen: Flag.Boolean("no-open").pipe(
      Flag.withDescription("Do not open the default browser"),
      Flag.withDefault(false)
    ),
  },
  (options) => launch(options).pipe(Effect.scoped)
).pipe(
  Command.withDescription(
    "Serve the reebeat studio editor on 127.0.0.1 and open it in your browser"
  )
);

// The program, given the files to serve (embedded in the binary, or a directory in development). The roots run it
// with `BunRuntime.runMain`: it serves until interrupted (Ctrl-C or SIGTERM), then ends with exit code 0.
export const program = <E>(assets: Layer.Layer<AssetStore, E>) =>
  Command.run(command, { version }).pipe(
    Effect.provide(
      Layer.mergeAll(
        serverLayer,
        FetchHttpClient.layer,
        HostPlatform.layer,
        assets
      )
    )
  );
