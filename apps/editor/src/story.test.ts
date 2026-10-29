import { Command, given, message, model, story } from "foldkit/story";
import { describe, expect, test } from "vite-plus/test";

import { InspectorState, Message, update } from "./main.ts";
import { collapsed, expanded } from "./testModels.ts";

describe("update", () => {
  test("ClickedToggleInspector collapses an expanded inspector and runs no Command", () => {
    story(
      update,
      given(expanded),
      message(Message.ClickedToggleInspector()),
      Command.expectNone(),
      model((next) => {
        expect(next.inspector).toStrictEqual(InspectorState.Collapsed());
      })
    );
  });

  test("ClickedToggleInspector expands a collapsed inspector", () => {
    story(
      update,
      given(collapsed),
      message(Message.ClickedToggleInspector()),
      model((next) => {
        expect(next.inspector).toStrictEqual(InspectorState.Expanded());
      })
    );
  });

  test("two toggles return to the starting state", () => {
    story(
      update,
      given(expanded),
      message(Message.ClickedToggleInspector()),
      message(Message.ClickedToggleInspector()),
      model((next) => {
        expect(next).toStrictEqual(expanded);
      })
    );
  });
});
