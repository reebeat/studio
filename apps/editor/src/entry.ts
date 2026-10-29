import { Runtime } from "foldkit";

import { editorApplication, rootSelector } from "./application.ts";

Runtime.run(editorApplication(document.querySelector(rootSelector)));
