import { Runtime } from "foldkit";

import { Message, Model, init, update, view } from "./main.ts";

export const editorApplication = (container: HTMLElement | null) =>
  Runtime.makeApplication({
    Model,
    container,
    devTools: { Message },
    init,
    update,
    view,
  });
