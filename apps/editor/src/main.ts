import { Button } from "@foldkit/ui";
import { Schema } from "effect";
import type { Runtime, Update } from "foldkit";
import type { Document, HtmlBuilder } from "foldkit/html";
import { defineMessageUnion } from "foldkit/message";
import { defineTaggedUnion } from "foldkit/schema";
import { modifyFields } from "foldkit/struct";

// MODEL

export const InspectorState = defineTaggedUnion({
  Collapsed: {},
  Expanded: {},
});

export type InspectorState = typeof InspectorState.Type;

export const Model = Schema.Struct({ inspector: InspectorState });

export type Model = typeof Model.Type;

// MESSAGE

export const Message = defineMessageUnion({ ClickedToggleInspector: {} });

export type Message = typeof Message.Type;

// INIT

export const init: Runtime.ApplicationInit<Model, Message> = () => ({
  model: { inspector: InspectorState.Expanded() },
});

// UPDATE

export const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    ClickedToggleInspector: () => ({
      model: modifyFields(model, {
        inspector: (inspector) =>
          InspectorState.match(inspector, {
            Collapsed: () => InspectorState.Expanded(),
            Expanded: () => InspectorState.Collapsed(),
          }),
      }),
    }),
  });

// VIEW

const panelStyle = "border border-gray-300 rounded p-4 text-gray-700";

const buttonStyle =
  "bg-black text-white hover:bg-gray-700 px-3 py-1 transition";

const panel = (
  name: string,
  description: string,
  extraStyle: string,
  h: HtmlBuilder<Message>
) =>
  h.section(
    [h.AriaLabel(name), h.Class(`${panelStyle} ${extraStyle}`)],
    [h.h2([h.Class("font-semibold")], [name]), h.p([], [description])]
  );

const inspectorPanel = (inspector: InspectorState, h: HtmlBuilder<Message>) =>
  InspectorState.match(inspector, {
    Collapsed: () => h.empty,
    Expanded: () =>
      h.aside(
        [h.AriaLabel("Inspector"), h.Class(`${panelStyle} w-64`)],
        [
          h.h2([h.Class("font-semibold")], ["Inspector"]),
          h.p([], ["The properties of the selected Element will appear here."]),
        ]
      ),
  });

const inspectorToggle = (inspector: InspectorState, h: HtmlBuilder<Message>) =>
  Button.view(
    {
      onClick: Message.ClickedToggleInspector(),
      toView: (attributes) =>
        h.button(
          [
            ...attributes.button,
            h.Class(buttonStyle),
            h.AriaExpanded(
              InspectorState.match(inspector, {
                Collapsed: () => false,
                Expanded: () => true,
              })
            ),
          ],
          [
            InspectorState.match(inspector, {
              Collapsed: () => "Show inspector",
              Expanded: () => "Hide inspector",
            }),
          ]
        ),
    },
    h
  );

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  body: h.div(
    [h.Class("min-h-screen flex flex-col gap-4 bg-white p-4")],
    [
      h.header(
        [h.Class("flex items-center justify-between")],
        [
          h.div(
            [],
            [
              h.h1([h.Class("text-2xl font-bold")], ["reebeat studio"]),
              h.p(
                [h.Class("text-gray-600")],
                [
                  "Placeholder shell: editing opens when the reebeat story IR is stable.",
                ]
              ),
            ]
          ),
          inspectorToggle(model.inspector, h),
        ]
      ),
      h.main(
        [h.Class("flex flex-1 gap-4")],
        [
          h.div(
            [h.Class("flex flex-1 flex-col gap-4")],
            [
              h.div(
                [h.Class("flex flex-1 gap-4")],
                [
                  panel(
                    "Story graph",
                    "The States and Beats of the story will appear here.",
                    "flex-1",
                    h
                  ),
                  panel("Preview", "The story will play here.", "flex-1", h),
                ]
              ),
              panel(
                "Timeline",
                "The compiled timeline will appear here.",
                "h-40",
                h
              ),
            ]
          ),
          inspectorPanel(model.inspector, h),
        ]
      ),
    ]
  ),
  title: "reebeat studio",
});
