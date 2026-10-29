import { click, expect, given, role, scene } from "foldkit/scene";
import { describe, test } from "vite-plus/test";

import { update, view } from "./main.ts";
import { collapsed, expanded } from "./testModels.ts";

describe("view", () => {
  test("renders the shell regions with the inspector expanded", () => {
    scene(
      { update, view },
      given(expanded),
      expect(role("heading", { name: "reebeat studio" })).toExist(),
      expect(role("region", { name: "Story graph" })).toExist(),
      expect(role("region", { name: "Preview" })).toExist(),
      expect(role("region", { name: "Timeline" })).toExist(),
      expect(role("complementary", { name: "Inspector" })).toExist(),
      expect(role("button", { name: "Hide inspector" })).toExist()
    );
  });

  test("clicking the toggle hides and shows the inspector", () => {
    scene(
      { update, view },
      given(expanded),
      click(role("button", { name: "Hide inspector" })),
      expect(role("complementary", { name: "Inspector" })).toBeAbsent(),
      expect(role("button", { name: "Show inspector" })).toExist(),
      click(role("button", { name: "Show inspector" })),
      expect(role("complementary", { name: "Inspector" })).toExist()
    );
  });

  test("a collapsed inspector starts without the inspector region", () => {
    scene(
      { update, view },
      given(collapsed),
      expect(role("complementary", { name: "Inspector" })).toBeAbsent()
    );
  });
});
