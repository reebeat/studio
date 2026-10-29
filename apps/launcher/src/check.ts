import { Effect, Option, Schema, String as Str } from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";

class SelfCheckFailed extends Schema.TaggedError<
  SelfCheckFailed,
  { readonly brand: unique symbol }
>()("SelfCheckFailed", {
  detail: Schema.String,
  step: Schema.String,
}) {}

const ensure = (ok: boolean, step: string, detail: string) =>
  ok ? Effect.void : Effect.fail(new SelfCheckFailed({ detail, step }));

const scriptSource = /src="(?<path>\/assets\/[^"]+\.js)"/u;

const methods = ["POST", "PUT", "PATCH", "DELETE"] as const;

const escapes = [
  "%2e%2e/%2e%2e/etc/passwd",
  "..%2f..%2fetc%2fpasswd",
  "assets/..%2findex.html",
] as const;

// What `--check` verifies about a server that is already listening, over real HTTP on the loopback address: the page is
// the editor, the script it names is served, nothing can write, and a path that leaves the app finds nothing.
export const selfCheck = Effect.fn("selfCheck")(function* check(base: string) {
  const client = yield* HttpClient.HttpClient;

  const send = (request: HttpClientRequest.HttpClientRequest) =>
    client.execute(request).pipe(
      Effect.mapError(
        (problem) =>
          new SelfCheckFailed({
            detail: `request failed: ${problem._tag}`,
            step: `${request.method} ${request.url}`,
          })
      )
    );

  const page = yield* send(HttpClientRequest.get(base));

  const html = yield* page.text.pipe(
    Effect.mapError(
      () =>
        new SelfCheckFailed({
          detail: "the body could not be read",
          step: "GET /",
        })
    )
  );

  yield* ensure(page.status === 200, "GET /", `status ${page.status}`);
  yield* ensure(
    Str.includes('<div id="root">')(html) &&
      Str.includes("<title>reebeat studio</title>")(html),
    "GET /",
    "the page is not the editor's index.html"
  );

  const script = yield* Effect.fromOption(
    Option.fromNullishOr(scriptSource.exec(html)?.groups?.path)
  ).pipe(
    Effect.mapError(
      () =>
        new SelfCheckFailed({
          detail: "the page names no script under /assets/",
          step: "GET /",
        })
    )
  );

  const asset = yield* send(
    HttpClientRequest.get(`${base}${Str.slice(1)(script)}`)
  );

  yield* ensure(
    asset.status === 200,
    `GET ${script}`,
    `status ${asset.status}`
  );

  yield* Effect.forEach(
    methods,
    (method) =>
      send(HttpClientRequest.make(method)(base)).pipe(
        Effect.flatMap((response) =>
          ensure(
            response.status === 405,
            `${method} /`,
            `status ${response.status}, wanted 405`
          )
        )
      ),
    { discard: true }
  );

  yield* Effect.forEach(
    escapes,
    (path) =>
      send(HttpClientRequest.get(`${base}${path}`)).pipe(
        Effect.flatMap((response) =>
          ensure(
            response.status === 404,
            `GET /${path}`,
            `status ${response.status}, wanted 404`
          )
        )
      ),
    { discard: true }
  );
});
