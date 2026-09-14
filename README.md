# Google Photos auto Fav

A Chrome extension for the Google Photos website. You give it a text file that lists file names. It then walks an album, and marks every photo whose file name is in that file as a **favourite**.

It exists because Google Photos has no way to favourite photos in bulk. If you picked your keepers somewhere else, for example in a local gallery, the only way to carry that choice into Google Photos is to open every photo and press the star. This extension does that for you.

## How it works, in one paragraph

Google Photos shows the file name of a photo only in the **info panel**, the sidebar that the `i` key opens. So the extension opens that panel, opens the first photo of the album, and then steps through the album with the right arrow key. On each photo it reads the file name from the panel, checks it against your list, and presses the favourite button when the name matches. It reads the page the same way a person does, with no Google API and no network request of its own.

## Install

The extension is not on the Chrome Web Store. Load it from this folder.

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode**, at the top right.
4. Click **Load unpacked**.
5. Select the folder that holds `manifest.json`.

Chrome keeps the extension until you remove it. To update it, pull the new code and click the reload arrow on the extension card.

## The list file

A plain text file, one file name per line:

```
PXL_20260815_171046148.mp4
IMG_4903.HEIC
PXL_20260816_102200375.MP.jpg
# a line that starts with # is a comment
```

Rules:

- Upper and lower case do not matter. `IMG_1.HEIC` and `img_1.heic` are the same name.
- A folder in front of the name is dropped, so a list exported from a file manager works too.
- Blank lines and lines that start with `#` are ignored.
- A name that appears twice counts once.

The extension keeps the list until you replace it, so you choose the file once.

## Use

1. Open the album in Google Photos.
2. Find the **auto Fav** panel at the bottom left. Click it to open.
3. Click **Choose list file** and pick your text file. The panel reports how many names it read.
4. Turn on **Dry run** for the first pass. See the next section.
5. Click **Start**.

The extension scrolls the grid back to the top, opens the first photo, opens the info panel, and steps through the album. The panel shows the count and the time per photo. Click **Stop** at any time. Everything it already marked stays marked.

You can also open one photo first and then press **Start**. The run then begins at that photo, which lets you choose the starting point yourself.

A run takes a few minutes for a large album, because it must open every photo.

### Always do a dry run first

**Dry run** walks the whole album and reports what it would mark, and clicks nothing. Use it to confirm two things before the real run:

- The count of "would mark" is close to the count of names in your list.
- The report lists few names under `list.notSeenInAlbum`.

If both look wrong, the extension is probably not reading the file names. Go to **Troubleshooting** below rather than running it for real.

### The report

Click **Copy report** and paste the result into a text editor. It answers what the panel cannot:

| Field in the report            | What it tells you                                                                              |
| ------------------------------ | ---------------------------------------------------------------------------------------------- |
| `photos.favorited`             | The photos this run marked.                                                                    |
| `photos.wouldFavorite`         | The photos a dry run would have marked.                                                        |
| `photos.alreadyFavorited`      | Photos in your list that were favourites already.                                              |
| `photos.unreadable`            | Photos whose file name never settled. The run skipped them. Mark these by hand.                |
| `photos.clickFailed`           | The run pressed the button and Google Photos did not change the photo.                         |
| `list.notSeenInAlbum`          | Names in your list that the album never showed. A long list here means the run ended early.    |
| `page_now.toolbarControlNames` | The button names the extension can see right now. You need this for the troubleshooting below. |
| `page_now.favoriteControl`     | Every attribute of the favourite button. See "Check that the page reports the star" below.     |

The report holds file names, because file names are the whole point of this extension. Do not paste it in public if those names matter to you.

## Safety

The extension can only **add** a favourite. It never removes one.

- It clicks a control only after it matches a name you can see in the options page. It never clicks a control it cannot name.
- It clicks only when the photo reads as "not a favourite yet". A photo that already is one is left alone.
- It clicks only when it is sure which photo is on screen. Right after the viewer moves, the page still shows the previous photo's file name for a moment. The extension waits for the name to change and to hold still before it acts. When that never happens inside the timeout, it **skips** the photo and lists it under `photos.unreadable`.

That last rule is the important one. A skipped photo costs you one manual star. A wrong click would put a star on a photo you did not choose, and nothing on screen would show the mistake. The timing always chooses the skip.

## Options

Click the extension icon in the Chrome toolbar, or click **Options** in the panel.

| Setting                              | What it does                                                                 |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| Dry run                              | Report what would change and click nothing.                                  |
| Read the page every (ms)             | How often the extension looks at the page.                                   |
| Ignore the first (ms) of each photo  | Skips the moment when the panel still shows the previous photo.              |
| One reading must hold for (ms)       | How long one file name must stay on screen before the extension believes it. |
| Give up on one photo after (ms)      | After this, the photo is skipped and reported as unreadable.                 |
| Wait for a click to take effect (ms) | How long to wait for Google Photos to confirm the new favourite.             |
| Button names                         | The words the extension looks for. See the troubleshooting below.            |

Raise the three middle numbers on a slow connection. Photos reported as unreadable are the sign that they are too low.

### Check that the page reports the star

Do this once, before your first real run. The extension must be able to tell a starred photo from an unstarred one, or it would click on both and remove the star from the ones you already had.

1. Open a photo you have **already** starred. Press **Copy report** and keep `page_now.favoriteControl` and `page_now.favoriteState`.
2. Open a photo you have **not** starred. Press **Copy report** again.
3. Compare the two.

`favoriteState` must read `favorited` for the first and `not-favorited` for the second. If both read the same, or if nothing in `favoriteControl` differs between them, the page does not report the state. Stop, and open an issue with both reports: the extension needs a new signal before it is safe to run.

## Troubleshooting

### Every photo is reported as unreadable

The extension could not read the file name, which means the info panel is not open or not visible.

1. Open a photo in the album and press `i`. The info panel must appear, and it must show the file name.
2. If pressing `i` does nothing, find the **Info** button in the toolbar and note its exact name.
3. Open the options page and put that name in **Names of the button that opens the info panel**, one per line.

The extension keeps the panel open for the whole run, so the panel must stay open when you move between photos by hand.

### Nothing is marked, but the names are read

The extension cannot find the favourite button. Google Photos writes that button's name in your own language and can rename it at any time.

1. Open a photo in the album.
2. Open the panel and click **Copy report**.
3. Look at `page_now.toolbarControlNames`. That is the list of names the extension found.
4. Copy the name that means "add to favourites" into the **Names that mean "not a favourite yet"** box on the options page, one per line. Do the same for the name that means "remove from favourites".

Keep the two boxes apart. The extension matches a name exactly, never by "contains", because "add to favourites" and "remove from favourites" share a word and mean opposite things.

### The run says "no way to reach the next one"

The run moves forward with the right arrow key, and then with a button whose name contains a word for "next". It never clicks a button it cannot name. When neither way works, the run stops instead of guessing.

That message covers two different situations, and the count tells you which one you have.

- **The run finished the album.** Google Photos keeps the viewer open on the last photo, so "cannot go further" is exactly what the end of an album looks like. If the count matches the album, you are done.
- **The run stalled early.** If the count is well short of the album, the album had not loaded that far yet. Press **Start** again. It carries on from the photo on screen. Repeat until the count stops growing.

### A few photos are reported as unreadable

Two causes:

- **The page is slower than the timings.** Raise **One reading must hold for** and **Give up on one photo after** in the options.
- **Two photos in a row have the same file name.** The extension protects itself from a stale reading by waiting for the file name to change, so a genuine repeat looks the same as a panel that has not redrawn. It skips the second one. Mark it by hand.

### My list has 1000 names but only 200 were marked

Read `list.notSeenInAlbum` in the report. Those names are the ones the album never showed. Either the run ended early, or the album does not hold every file in your list.

## Privacy

Everything stays in your browser.

- The extension runs only on `https://photos.google.com`.
- The list of file names lives in Chrome's local extension storage, on this computer.
- Settings live in Chrome's sync storage, so they follow your Chrome profile.
- The extension sends no network requests of its own and contacts no server.

## Limits

- Google Photos changes its layout without notice. When it does, the button names need updating in the options page.
- The extension reads the file name from the info panel. If Google ever stops showing it there, this approach stops working.
- The official Google Photos API cannot set a favourite, and since 2025 it cannot list your library either. That is why the extension reads the page instead.
- A run must keep the tab open and the window on screen. Google Photos stops drawing a background tab, and the extension cannot read a page that is not drawn.

## Develop

```bash
npm install
npm run check
```

`npm run check` runs the three checks in order: Prettier, the TypeScript type checker, and the unit tests.

The code is plain JavaScript with JSDoc types, so there is no build step: the folder you edit is the folder Chrome loads. Edit a file, press the reload arrow on the extension card, then reload the Google Photos tab.

To redraw the icons, run:

```bash
powershell -ExecutionPolicy Bypass -File scripts/makeIcons.ps1
```

## See also

[google-photos-auto-date](https://github.com/guplem/google-photos-auto-date) is the same idea for timestamps: give it a list of corrections and it walks an album fixing the date, the time and the timezone of every photo you name.

## Credits

The structure, the DOM rules, and the walk over an album come from [google-photos-compare-and-save](https://github.com/guplem/google-photos-compare-and-save).

## Licence

MIT. See `LICENSE`.
