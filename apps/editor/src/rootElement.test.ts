import { assert, it } from "@effect/vitest";

import indexHtml from "../index.html?raw";
import { rootSelector } from "./application.ts";

it("the selector entry.ts renders into names exactly one element of index.html, and that element has an id", () => {
  // A template's content is inert: parsing the page does not load its stylesheet or run its script.
  const template = document.createElement("template");

  template.innerHTML = indexHtml;

  const roots = template.content.querySelectorAll(rootSelector);

  assert.strictEqual(roots.length, 1);
  // The runtime renders nothing into a container without an id (see boot.test.ts).
  assert.notStrictEqual(roots[0]?.id, "");
});
