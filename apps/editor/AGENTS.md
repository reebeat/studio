# Agent Development Notes

This is a Foldkit app. Read [`FOLDKIT.md`](./FOLDKIT.md) before writing any code in this project. It covers the architecture, the APIs, and the conventions the project is built on.

Foldkit owns `FOLDKIT.md` and replaces it whole on upgrade. This file is yours. Anything you want an agent to know about this project goes below, where an upgrade won't touch it.

`FOLDKIT.md` reads the line below to decide whether it has already offered to vendor the Foldkit source. Leave it in place.

subtree_prompted: true

The subtree was not vendored: `repos/foldkit` is a large public repository and the installed `foldkit` package ships its `dist` with JSDoc, which is the contract here (see the repository's [`AGENTS.md`](../../AGENTS.md), "Foldkit and Effect versions"). Revisit when the editor grows Submodels.

## Project Notes

- The shell is a placeholder (spec 0000). Do not build editing features against the story IR yet: spec 0001 is blocked on reebeat specs 0004 and 0006.
- `src/main.ts` holds the pure definitions (Model, Message, init, update, view); `src/entry.ts` is the only module that boots the runtime. Tests are `src/story.test.ts` (drives `update`) and `src/scene.test.ts` (drives the view).
- The repository formats with Oxfmt (double quotes, semicolons) and lints with the Foldkit plugin; the generated files were reformatted, not hand-edited for style.
- Import `describe`, `test` and `expect` from `vite-plus/test`, not `vitest` (lint rule `vite-plus/prefer-vite-plus-imports`).
- `@foldkit/vite-plugin` is on in `vite.config.ts` (spec 0005): in `vp dev` it keeps the Model across the reload a saved file causes and opens the devtools relay.
