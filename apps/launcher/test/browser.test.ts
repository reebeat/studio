import { assert, describe, it } from "@effect/vitest";

import { openCommand } from "../src/browser.ts";

const url = "http://127.0.0.1:41234/";

describe("openCommand", () => {
  it("opens the default browser with the program each system ships", () => {
    assert.deepStrictEqual(openCommand("darwin", url), ["open", [url]]);
    assert.deepStrictEqual(openCommand("linux", url), ["xdg-open", [url]]);
    assert.deepStrictEqual(openCommand("win32", url), [
      "cmd",
      ["/c", "start", "", url],
    ]);
  });

  it("falls back to xdg-open for any other system", () => {
    assert.deepStrictEqual(openCommand("freebsd", url), ["xdg-open", [url]]);
  });
});
