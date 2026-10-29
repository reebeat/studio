# The editor shell (spec 0000)

A placeholder by design: a heading, three regions, an Inspector aside and one button. It edits nothing and reads no story. These five entries are everything a person can do or see today; each says how to observe it and what counts as broken. A feature that is observable only in code (the pure `update`) is pinned by the Story and Scene tests in `apps/editor/src`, not here.

Read `README.md` first: preconditions, the evidence rules and how the entries are used. `<origin>` and `<run>` come from `scripts/launch.sh` (`state.env`).

### `shell-load`

Spec: 0000, 0005
Observes: spec 0000 "Not gated, observed once" (the built editor loads in a browser on Effect 4.1.0; Foldkit 0.170.0 since spec 0005); the boot test pins the same in happy-dom.

- **Observe.** `scripts/doctor.sh` prints `DOCTOR OK`. In a browser tab on `<origin>/` (wait for network idle): the title is `reebeat studio`; `tab.errors()` holds no entry; every request goes to `<origin>` and answers 2xx or 304, except a possible `/favicon.ico` (404: the app ships no favicon; a browser that cached the 404 does not ask again; a different 404 is broken). `tab.console()` is empty in preview; in `dev` it holds only `[vite]` debug lines (`connecting...`, `connected.`, one pair per page load).
- **Broken when.** The title differs, the page is blank (the doctor's `h1` check fails), an error or any other console entry appears (in `dev` especially a `[foldkit] No response from @foldkit/vite-plugin` warning: the plugin is not loaded), a request leaves the origin (the free journey needs no network), or an asset answers 4xx or 5xx.
- **Evidence.** `notes-browser-drive.json` (title, errors, console, requests), `serve.log`.

### `shell-dev-reload`

Spec: 0005

- **Observe.** Only in `dev` (`scripts/launch.sh dev`). `serve.log` holds `[foldkit:devTools] MCP relay listening at ws://127.0.0.1:` and, after the page loads, `runtime connected`. In a persistent tab (`persist: true`) set `window.__marker = "same-document"`, click `Hide inspector`, then change one visible string in `apps/editor/src/main.ts` with the edit tool (for example the Preview sentence) and restore it at the end. Within a few seconds the page text shows the new string, `window.__marker` is `null` (the plugin reloaded the document) and `aside[aria-label='Inspector']` is still absent with the button reading `Show inspector` (the Model was kept). Run `git diff -- apps/editor/src` at the end: it must be empty.
- **Broken when.** The text does not change, the Inspector comes back after the reload (the Model was not kept), a `No response from @foldkit/vite-plugin` warning appears, or the relay line is missing. Control: take `foldkit()` out of `apps/editor/vite.config.ts`; the server restarts, the warning appears and the Inspector is shown again after the same edit.
- **Evidence.** `notes-browser-drive.json` (the state before and after), `screenshots/`, `serve.log`.

### `shell-regions`

Spec: 0000

- **Observe.** `scripts/page.sh shell-desktop` writes `pages/shell-desktop.html` and `screenshots/shell-desktop.png`. The DOM has one `h1` `reebeat studio`, `section` regions named `Story graph`, `Preview` and `Timeline`, and an `aside` named `Inspector` (accessible names are `aria-label`s). Read the screenshot: each region shows its heading and its placeholder sentence (`The States and Beats of the story will appear here.`, `The story will play here.`, `The compiled timeline will appear here.`, `The properties of the selected Element will appear here.`), and the line `Placeholder shell: editing opens when the reebeat story IR is stable.` sits under the heading.
- **Broken when.** A region or an accessible name is missing or renamed, a region is empty, text is clipped, or the page shows a story (nothing reads the IR yet: a story on screen means unreviewed scope).
- **Evidence.** `pages/shell-desktop.html`, `screenshots/shell-desktop.png`.

### `shell-inspector-toggle`

Spec: 0000
Observes: spec 0000 F11 (the Story and Scene tests pin the toggle; this is the same behaviour in a real browser).

- **Observe.** In a browser tab (use `browser.open({ app: { tern: false }, ... })`; see `README.md`): initially the button reads `Hide inspector` with `aria-expanded="true"` and `aside[aria-label='Inspector']` exists. Click `role/button[name='Hide inspector']`: the aside is gone, the button reads `Show inspector`, `aria-expanded="false"`. Click `role/button[name='Show inspector']`: the aside is back and the button reads `Hide inspector`, `aria-expanded="true"`. Screenshot each state (`toggle-1-initial`, `toggle-2-hidden`, `toggle-3-shown`).
- **Broken when.** A click changes nothing, the aside and `aria-expanded` disagree, the label does not follow the state, or a click needs more than one try. A shell whose `update` ignores `ClickedToggleInspector` fails the first click (the control of the verification run in the PR of spec 0003).
- **Evidence.** The three screenshots and the state record in `notes-browser-drive.json`.

### `shell-layout`

Spec: 0000

- **Observe.** `scripts/page.sh shell-desktop` (1280x900) and `scripts/page.sh shell-phone --size 390x844`. In a tab at each width, `document.documentElement.scrollWidth` equals `innerWidth`, and every region's bounding box lies inside the viewport. Read both screenshots.
- **Broken when.** Horizontal overflow, a region outside the viewport, regions overlapping, or an unreadable heading. At `bdb3a01` the phone width is cramped (the three columns squeeze to 83, 91 and 191 px and the text wraps word by word) but nothing overflows; that is the expected state until a spec makes the shell responsive, so record it, do not file it as new.
- **Evidence.** `screenshots/shell-desktop.png`, `screenshots/shell-phone.png`, `notes-layout.json`.

### `shell-build`

Spec: 0000

- **Observe.** `scripts/launch.sh` (preview) runs `vp build` before it serves: `serve.log` ends the build with `built in` and no error, lists `dist/index.html`, one `.css` and one `.js` asset, and the server then answers (`DOCTOR OK`). Run `scripts/launch.sh dev` on a second run: the same doctor passes against `vp dev`.
- **Broken when.** The build fails (launch stops and says so: a failing build is the finding), the build prints a warning that is new for the head, or the dev server and the preview disagree on the document.
- **Evidence.** `serve.log` of each run, `meta.env` (mode).
