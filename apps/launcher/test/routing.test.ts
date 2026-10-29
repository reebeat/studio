import { assert, describe, it } from "@effect/vitest";
import { Option } from "effect";

import { assetKeyOf, cacheControlOf } from "../src/routing.ts";

describe("assetKeyOf", () => {
  it("names the page for the root and the file for a path under the app", () => {
    assert.deepStrictEqual(assetKeyOf("/"), Option.some("index.html"));
    assert.deepStrictEqual(
      assetKeyOf("/index.html"),
      Option.some("index.html")
    );
    assert.deepStrictEqual(
      assetKeyOf("/assets/index-abc.js"),
      Option.some("assets/index-abc.js")
    );
  });

  // Every path that could name a file outside the table, in every spelling a client can send.
  const refused = [
    "/..",
    "/../etc/passwd",
    "/assets/../index.html",
    "/%2e%2e/etc/passwd",
    "/%2E%2E%2Fetc%2Fpasswd",
    "/assets/..%2findex.html",
    "/assets/%2e%2e/index.html",
    "/a\\b",
    "/a%5Cb",
    "/a%00b",
    "//index.html",
    "/assets//x.js",
    "/assets/",
    "/./index.html",
    "index.html",
    "/%",
    "/%zz",
  ];

  for (const path of refused) {
    it(`refuses ${path}`, () => {
      assert.deepStrictEqual(assetKeyOf(path), Option.none());
    });
  }
});

describe("cacheControlOf", () => {
  it("lets a hashed file be cached for good and the page not at all", () => {
    assert.strictEqual(
      cacheControlOf("assets/index-abc.js"),
      "public, max-age=31536000, immutable"
    );
    assert.strictEqual(cacheControlOf("index.html"), "no-cache");
  });
});
