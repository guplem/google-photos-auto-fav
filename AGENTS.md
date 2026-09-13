# Google Photos auto Fav

A Manifest V3 Chrome extension that marks photos as favourite on `https://photos.google.com`. The user supplies a text file of file names; the extension walks an album and presses the favourite button on every photo whose name is in that file. There is no build step, so the repository folder is the folder Chrome loads. Install, use, and troubleshooting: `README.md`.

## Commands

| Task                  | Command                                                          | Notes                                                        |
| --------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------ |
| Install dependencies  | `npm install`                                                    | Run this once per clone.                                     |
| Run every check       | `npm run check`                                                  | Format check, then type check, then tests.                   |
| Format the whole repo | `npm run format`                                                 | Prettier.                                                    |
| Type check            | `npm run typecheck`                                              | `tsc --noEmit` over the JSDoc types. Success prints nothing. |
| Run the tests         | `npm test`                                                       | `node --test`. It finds `test/*.test.js` on its own.         |
| Redraw the icons      | `powershell -ExecutionPolicy Bypass -File scripts/makeIcons.ps1` | Windows only. Run it only when the artwork changes.          |

## Architecture

The extension runs in two places.

| Place          | File                                                                 | Can use `chrome.*` |
| -------------- | -------------------------------------------------------------------- | ------------------ |
| Isolated world | `src/bootstrap/isolatedWorldBootstrap.js` and all of `src/` below it | Yes                |
| Service worker | `src/background/serviceWorker.js`                                    | Yes                |

A content script listed in `manifest.json` cannot be an ES module. `isolatedWorldBootstrap.js` is a classic script whose only job is `import(chrome.runtime.getURL('src/contentEntry.js'))`. Every other file therefore uses plain `import` and stays unit testable under Node. Any new file under `src/` is reachable only because `web_accessible_resources` lists `src/*`. Keep that entry.

### File map

| File                                         | Holds                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------- |
| `src/contentEntry.js`                        | Wiring only. Settings, routing, run orchestration, the list file reader.  |
| `src/googlePhotosPage.js`                    | URL parsing and the grid link selector. **All URL knowledge lives here.** |
| `src/domControls.js`                         | Accessible-name reading and the visibility helpers. Shared by the probes. |
| `src/settings/extensionSettings.js`          | Defaults and `normalizeSettings`.                                         |
| `src/favorites/favoritesList.js`             | Parses the list file and answers "is this name in the list".              |
| `src/favorites/favoritesListStore.js`        | The list in `chrome.storage.local`.                                       |
| `src/favorites/photoFileNameReader.js`       | Finds the file name on screen. Decides "one name" against "cannot tell".  |
| `src/favorites/favoriteProbe.js`             | Reads the favourite state and clicks the control.                         |
| `src/favorites/photoViewerNavigator.js`      | Moves the viewer and opens the info panel. **All navigation DOM here.**   |
| `src/favorites/albumFavoritingRun.js`        | The walk over the album. Pure logic, no DOM.                              |
| `src/controlPanel/controlPanelController.js` | The in-page panel.                                                        |
| `src/runReport.js`                           | The clipboard report.                                                     |
| `options/optionsPage.*`                      | The settings page.                                                        |

## Rules

- **Never match a Google class name.** Google Photos ships obfuscated class names (`QxNbxb`, `mTvPtb`) that change with every release. Match the URL, a link target (`a[href*="/photo/"]`), or an accessible name (`aria-label`, `title`, short `textContent`) instead. Use position on screen only to narrow a set already matched by name.
- **Never click a control you cannot name.** A click target must match a known word first. When nothing matches, stop and report `stuck`.
- **A run may only add a favourite, never remove one.** `clickFavoriteControl` clicks only when the state reads `not-favorited`. Do not add an "unfavourite" path: an accidental removal is invisible to the user and cannot be found again.
- **Never act on a reading that may be stale.** This is the core safety rule and `albumFavoritingRun.js` documents it at the top. After a move, the info panel and the toolbar still describe the **previous** photo. Three guards must pass before a click: the file name differs from the last accepted one, it holds for `confirmMs`, and `minDwellMs` has passed. When they do not pass, report `unreadable` and move on. A skipped photo costs one manual star; a wrong click puts a star on a photo the user never chose and leaves no trace.
- **Treat "cannot tell yet" as its own answer.** `classifyFileName` and `classifyFavoriteState` both return `null` when the page is not readable. Never collapse `null` into a state.
- **Two different file names on screen means `null`, never "pick one".** That happens while the info panel is between photos.
- **Match a button name exactly, never by "contains".** "add to favourites" and "remove from favourites" share a word and mean opposite things.
- **Keep DOM code out of the logic.** `albumFavoritingRun.js` receives every browser action as a function, which is why its whole loop is unit tested with no browser. Put each fragile DOM call in a small adapter, keep the decision in a pure function, and test the pure function.
- **Validate everything that comes out of storage.** `normalizeSettings` and `normalizeListRecord` drop unknown keys and repair wrong values, because storage can hold data written by an older version. Extend those functions when you add a field, and add a test.
- **Use the two storage areas as they are set.** Settings go in `chrome.storage.sync`; the list of file names goes in `chrome.storage.local`, because a list of a few thousand names is far past the per-item quota of `sync`.
- **Add a setting in four places**: `DEFAULT_SETTINGS`, `normalizeSettings`, `options/optionsPage.html`, and `options/optionsPage.js`. A setting that misses one place resets itself with no error.

## Gotchas

- **Google Photos never shows the file name in the viewer.** It shows it only in the info panel, which the `i` key opens. A run opens that panel first and asks again whenever the name is missing. The panel is a **toggle**, so `requestInfoPanel` must run only while the name is missing, and `INFO_PANEL_RETRY_MS` spaces the requests. Calling it on every poll opens and closes the panel in a loop.
- **There is no stable element that holds the file name.** `photoFileNameReader.js` finds it by shape: a whole string that is one media file name. The pattern forbids whitespace and slashes on purpose, so a caption that ends in ".mov" never matches. Read leaf elements only (`childElementCount === 0`), or every ancestor repeats the same name.
- **Google Photos hides the viewer chrome while the pointer stays still.** A run never moves the real pointer, so the toolbar and the next-photo control both fade out. `keepPageAwake` dispatches a `mousemove` with **changing** coordinates; a page that tracks the pointer ignores a move that lands twice on the same spot.
- **The grid is virtualised.** Document order is not album order: `querySelector('a[href*="/photo/"]')` returns whichever link was recycled last. `openFirstPhoto` scrolls the grid container to the top, waits for the redraw, then sorts the links by screen position.
- **`window.scrollTo` does not scroll the album grid.** Google Photos scrolls an inner container. Walk up from a grid link to the first ancestor whose `scrollHeight` exceeds its `clientHeight` and whose `overflow-y` is `auto` or `scroll`.
- **A fast loop outruns the album loading.** Google Photos loads an album in pages. Without `MIN_PHOTO_INTERVAL_MS` the walk arrives before the album has loaded that far, then reports a stall it caused itself.
- **The viewer stays open on the last photo of an album.** The arrow key simply does nothing there, so the photo id neither changes nor clears. "Cannot advance" is not proof of the end. Only a next-photo control that is present and **disabled** proves it; `readNextControlState` reports that. Never treat an ambiguous stop as a finished run.
- **A dialog poisons a reading.** `probeFavoriteState` returns `null` whenever `isBlocked()` reports an open dialog, and `requestNextPhoto` presses Escape before it acts.
- **Google Photos rewrites the address bar with no event.** `watchLocation()` polls every 300ms. A `popstate` listener alone misses most navigations.
- **`aria-pressed` beats the button name.** The name is translated and can be renamed; true and false cannot. `classifyFavoriteState` reads the name only when `aria-pressed` and `aria-checked` are both absent.
- **`node --test test/` fails on Node 24.** It treats the folder as a module. Run bare `node --test`, which is what `npm test` does.
- **Prettier uses `endOfLine: "auto"` on purpose.** This machine has `core.autocrlf=true`, so the working tree holds CRLF line endings. A pinned `endOfLine: "lf"` would fail the format check on every file while the content is correct.

## Test-Driven Development

Develop new behavior **test-first, red-green**. A bug fix starts with a test that reproduces the bug.

- **Testable, and always test-first:** URL parsing (`googlePhotosPage.js`), settings validation (`extensionSettings.js`), the storage record shape (`favoritesListStore.js`), the list parser and matcher (`favoritesList.js`), the two verdicts (`classifyFileName`, `classifyFavoriteState`), and the whole walk (`albumFavoritingRun.js`). The walk takes every browser action as an argument, so `test/albumFavoritingRun.test.js` drives it with a fake album and a virtual clock and finishes at once.
- **The fake album carries `staleMs`.** For that long after each move it answers with the previous photo's file name and state, exactly as the real page does. Every new test of the walk must keep that switched on, because it is the only thing that catches a guard regression.
- **Exempt, because a unit test would only re-state the code:** the thin DOM adapters (`photoViewerNavigator.js`, `controlPanelController.js`, `createDomHelpers`, `optionsPage.js`). Keep these thin: an adapter finds an element or clicks it, and it holds no decision.

When a bug appears in an exempt file, do not test the adapter. Move the decision that failed into a pure function, and test that.

## Documentation Organization

| Home        | Loaded         | Holds                                                                 |
| ----------- | -------------- | --------------------------------------------------------------------- |
| `AGENTS.md` | Every session  | The map: architecture, conventions, gotchas. (`CLAUDE.md` is a shim.) |
| `README.md` | Read by humans | What the project is, install, use, options, troubleshooting.          |

Both files are living: keep them true, and do not duplicate content between them.
