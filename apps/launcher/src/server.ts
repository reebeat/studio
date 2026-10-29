import { Effect, Option } from "effect";
import { HttpServerRequest, HttpServerResponse } from "effect/http";

import { AssetStore } from "./assetStore.ts";
import { assetKeyOf, cacheControlOf } from "./routing.ts";

// Read-only by construction: the handler has no branch that writes, and any method but GET and HEAD is refused before
// the path is looked at. `Allow` tells a client what is accepted.
const safeHeaders = {
  "Cross-Origin-Resource-Policy": "same-origin",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
} as const;

const refuse = (status: number, text: string) =>
  HttpServerResponse.text(text, {
    headers:
      status === 405 ? { ...safeHeaders, Allow: "GET, HEAD" } : safeHeaders,
    status,
  });

export const app = Effect.gen(function* serve() {
  const request = yield* HttpServerRequest.HttpServerRequest;
  const store = yield* AssetStore;

  if (request.method !== "GET" && request.method !== "HEAD") {
    return refuse(405, "method not allowed");
  }

  const key = assetKeyOf(new URL(request.url, "http://127.0.0.1").pathname);

  if (Option.isNone(key)) {
    return refuse(404, "not found");
  }

  const asset = yield* store.find(key.value);

  return Option.isNone(asset)
    ? refuse(404, "not found")
    : HttpServerResponse.uint8Array(asset.value.bytes, {
        contentType: asset.value.contentType,
        headers: {
          ...safeHeaders,
          "Cache-Control": cacheControlOf(key.value),
        },
      });
});
