import { assert, describe, it } from "@effect/vitest";
import { Effect, Predicate } from "effect";
import { HttpServerRequest } from "effect/http";

import { fromFiles } from "../src/assetStore.ts";
import { app } from "../src/server.ts";

const encoder = new TextEncoder();

const files = {
  "assets/app-1.js": encoder.encode("console.log(1)"),
  "index.html": encoder.encode("<!doctype html><title>t</title>"),
};

const respondTo = (method: string, path: string) =>
  app.pipe(
    Effect.provideService(
      HttpServerRequest.HttpServerRequest,
      HttpServerRequest.fromWeb(
        new Request(`http://127.0.0.1${path}`, { method })
      )
    ),
    Effect.provide(fromFiles(files))
  );

describe("the launcher's handler", () => {
  it.effect(
    "serves the page and a hashed script with their types and cache rules",
    () =>
      Effect.gen(function* serves() {
        const page = yield* respondTo("GET", "/");
        const script = yield* respondTo("GET", "/assets/app-1.js");

        assert.strictEqual(page.status, 200);
        assert.include(page.headers["content-type"], "text/html");
        assert.strictEqual(page.headers["cache-control"], "no-cache");
        assert.strictEqual(page.headers["x-content-type-options"], "nosniff");
        assert.isTrue(Predicate.isTagged(page.body, "Uint8Array"));
        assert.strictEqual(script.status, 200);
        assert.include(script.headers["content-type"], "javascript");
        assert.include(script.headers["cache-control"], "immutable");
      })
  );

  it.effect("serves HEAD like GET (the server drops the body)", () =>
    Effect.gen(function* head() {
      assert.strictEqual((yield* respondTo("HEAD", "/")).status, 200);
    })
  );

  for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
    it.effect(`refuses ${method} with 405 and says what is allowed`, () =>
      Effect.gen(function* refuses() {
        const response = yield* respondTo(method, "/");

        assert.strictEqual(response.status, 405);
        assert.strictEqual(response.headers.allow, "GET, HEAD");
      })
    );
  }

  for (const path of [
    "/nope.js",
    "/%2e%2e/etc/passwd",
    "/assets/..%2findex.html",
  ]) {
    it.effect(`finds nothing for ${path}`, () =>
      Effect.gen(function* missing() {
        assert.strictEqual((yield* respondTo("GET", path)).status, 404);
      })
    );
  }
});
