import { Runtime } from "foldkit";

import { Message, Model, init, update, view } from "./main.ts";

// The element of `index.html` the editor renders into; `entry.ts` finds it with this selector and a test holds the
// selector to the page.
export const rootSelector = "#root";

export const editorApplication = (container: HTMLElement | null) =>
  Runtime.makeApplication({
    Model,
    container,
    devTools: { Message },
    init,
    update,
    view,
  });
