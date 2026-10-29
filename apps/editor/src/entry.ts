import { Runtime } from "foldkit";

import { editorApplication } from "./application.ts";

Runtime.run(editorApplication(document.querySelector("#root")));
