import { Runtime } from "foldkit";

import { Message, Model, init, update, view } from "./main.ts";

const application = Runtime.makeApplication({
  Model,
  container: document.querySelector("#root"),
  devTools: { Message },
  init,
  update,
  view,
});

Runtime.run(application);
