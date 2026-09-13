/**
 * Builds the report that the panel copies to the clipboard.
 *
 * The report answers the two questions a run cannot answer on screen. Which
 * photos did the run fail to read, and which names in your list did the album
 * never show. Without both, a user cannot tell a complete run from a partial one.
 *
 * It also carries what a bug report needs: the control names the toolbar showed,
 * so that a renamed Google Photos button can be fixed from the options page.
 *
 * The report contains file names, because file names are the whole signal here.
 * Do not paste it in public if the names matter to you.
 */

/**
 * @typedef {import('./favorites/albumFavoritingRun.js').PhotoResult} PhotoResult
 * @typedef {import('./favorites/albumFavoritingRun.js').RunOutcome} RunOutcome
 *
 * @typedef {object} RunReportInput
 * @property {string} extensionVersion
 * @property {string} url
 * @property {import('./googlePhotosPage.js').GooglePhotosLocation} pageLocation
 * @property {number} gridPhotoLinks
 * @property {readonly string[]} listNames         Every name in the loaded list.
 * @property {readonly PhotoResult[]} results      One entry per photo the run reached.
 * @property {RunOutcome | null} lastRunOutcome
 * @property {readonly string[]} toolbarControlNames
 * @property {readonly string[]} visibleFileNames
 * @property {'favorited' | 'not-favorited' | null} favoriteState
 * @property {boolean} dialogOpen
 * @property {'enabled' | 'disabled' | 'missing'} nextControlState
 * @property {{ width: number, height: number }} viewport
 */

/**
 * @param {RunReportInput} input
 */
export function buildRunReport(input) {
  /** @type {Set<string>} */
  const seenNames = new Set();
  for (const result of input.results) {
    if (result.fileName !== null) seenNames.add(result.fileName.toLowerCase());
  }

  /** @param {import('./favorites/albumFavoritingRun.js').PhotoAction} action */
  const fileNamesWithAction = (action) =>
    input.results.filter((result) => result.action === action).map((result) => result.fileName ?? '(name unreadable)');

  return {
    extensionVersion: input.extensionVersion,
    reportedAt: new Date().toISOString(),
    page: {
      url: input.url.replace(/\/(photo|album|share)\/[^/?#]+/g, '/$1/REDACTED'),
      kind: input.pageLocation.kind,
      gridPhotoLinks: input.gridPhotoLinks,
      viewport: input.viewport,
    },
    list: {
      size: input.listNames.length,
      // The names the album never showed. A long list here usually means the run
      // stopped early, or that this is not the album the list came from.
      notSeenInAlbum: input.listNames.filter((name) => !seenNames.has(name)),
    },
    lastRun: input.lastRunOutcome,
    photos: {
      favorited: fileNamesWithAction('favorited'),
      wouldFavorite: fileNamesWithAction('would-favorite'),
      alreadyFavorited: fileNamesWithAction('already-favorited'),
      unreadable: input.results.filter((result) => result.action === 'unreadable').map((result) => result.photoKey),
      clickFailed: fileNamesWithAction('click-failed'),
    },
    // What the extension can see on the page right now. Use this when Google
    // Photos renames a button and the run stops finding the favourite control.
    page_now: {
      toolbarControlNames: [...input.toolbarControlNames],
      visibleFileNames: [...input.visibleFileNames],
      favoriteState: input.favoriteState,
      dialogOpen: input.dialogOpen,
      nextControlState: input.nextControlState,
    },
  };
}
