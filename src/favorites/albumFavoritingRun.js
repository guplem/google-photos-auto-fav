/**
 * Walks an album one photo at a time. For every photo whose file name is in your
 * list, it presses the favourite control.
 *
 * This file holds no DOM code. Every browser action arrives as a function, which
 * keeps the walk testable and keeps the fragile selectors in the adapters.
 *
 * ## The one rule that matters: never act on a stale reading
 *
 * The address bar changes the moment Google Photos accepts the arrow key, but
 * the info panel and the toolbar redraw a little later. So right after a move,
 * the page still shows the **previous** photo's file name and the previous
 * photo's favourite state. A click made then would favourite the wrong photo,
 * and nothing on screen would show the mistake.
 *
 * Three guards prevent it, and all three must pass before a click:
 *
 *  1. The file name must differ from the last one we accepted.
 *  2. The same file name must hold for `confirmMs` without changing.
 *  3. At least `minDwellMs` must have passed since the photo opened.
 *
 * When the guards do not pass inside `timeoutMs`, the photo is reported as
 * `unreadable` and the walk moves on. An unread photo costs the user one manual
 * favourite. A wrong click costs them a favourite on a photo they did not pick,
 * which is much harder to find and undo. The timing always chooses the first.
 *
 * A side effect of guard 1: two photos in a row with the same file name are both
 * reported `unreadable`. That is rare in one album, and it is the safe outcome.
 */

/**
 * @typedef {import('./favoriteProbe.js').FavoriteState} FavoriteState
 *
 * @typedef {'favorited' | 'would-favorite' | 'already-favorited' | 'not-in-list' | 'unreadable' | 'click-failed'} PhotoAction
 *
 * @typedef {object} PhotoResult
 * @property {string} photoKey
 * @property {string | null} fileName
 * @property {PhotoAction} action
 *
 * @typedef {object} RunCounts
 * @property {number} visited            Photos the walk reached.
 * @property {number} favorited          Photos this run marked as favourite.
 * @property {number} wouldFavorite      Photos a dry run would have marked.
 * @property {number} alreadyFavorited   Photos in the list that were favourites already.
 * @property {number} notInList          Photos whose file name is not in the list.
 * @property {number} unreadable         Photos whose file name or state never settled.
 * @property {number} clickFailed        Photos where the click did not take effect.
 *
 * @typedef {'end-of-album' | 'stopped' | 'loop-detected' | 'no-photo-open' | 'stuck'} RunStopReason
 *
 * @typedef {object} RunOutcomeExtras
 * @property {RunStopReason} reason
 * @property {'enabled' | 'disabled' | 'missing' | null} nextControlState  The next control when the walk ended.
 *
 * @typedef {RunCounts & RunOutcomeExtras} RunOutcome
 *
 * @typedef {object} AlbumFavoritingRunDeps
 * @property {() => string | null} readCurrentPhotoKey  Photo id currently in the address bar.
 * @property {() => string | null} readFileName  The file name on screen; null means "cannot tell yet".
 * @property {() => FavoriteState | null} probeFavoriteState  The toolbar verdict; null means "cannot tell yet".
 * @property {() => boolean} clickFavorite  Press the favourite control. False when the toolbar offers none.
 * @property {(attempt: number) => void} requestInfoPanel  Ask Google Photos to show the info panel, one method per attempt number.
 * @property {() => 'enabled' | 'disabled' | 'missing'} readNextControlState
 * @property {(attempt: number) => Promise<void>} requestNextPhoto  Ask the page to move on, one method per attempt number.
 * @property {() => void} keepPageAwake  Make the page show its viewer chrome again.
 * @property {(milliseconds: number) => Promise<void>} wait
 * @property {() => number} now
 * @property {(fileName: string) => boolean} isWanted  True when this file name is in the list.
 * @property {(result: PhotoResult) => void} onResult
 * @property {(counts: RunCounts) => void} onProgress
 * @property {() => boolean} shouldStop
 * @property {number} pollMs        How often to read the page.
 * @property {number} minDwellMs    Ignore readings taken this soon after a photo opens.
 * @property {number} confirmMs     How long one reading must hold before we believe it.
 * @property {number} timeoutMs     Give up on one photo after this long.
 * @property {number} clickConfirmMs  How long to wait for a click to turn the photo into a favourite.
 * @property {boolean} dryRun       Report what would happen and click nothing.
 */

/**
 * How long we wait for the address bar to show the next photo, per attempt.
 *
 * The list is also the attempt count, and it backs off on purpose. The address
 * bar usually updates as soon as the app accepts the key, so the first window is
 * short and the common case stays fast. A window only grows when the album has
 * not loaded the next page yet, and Google Photos loads an album in pages.
 */
const ADVANCE_ATTEMPT_TIMEOUTS_MS = [1200, 2500, 2500, 5000];

/**
 * The shortest time one photo may take, in milliseconds.
 *
 * Google Photos loads an album in pages. Without a floor the walk steps through
 * photos far faster than a person, arrives past the loaded edge, and then
 * reports a stall it caused itself.
 */
export const MIN_PHOTO_INTERVAL_MS = 120;

/** How often we look at the address bar while waiting for the next photo. */
const ADVANCE_POLL_MS = 25;

/**
 * How often to ask for the info panel while the file name is missing.
 *
 * The panel is a toggle, so asking on every poll would open and close it in a
 * loop. One request, then a pause long enough for the panel to draw.
 */
const INFO_PANEL_RETRY_MS = 1200;

/**
 * @param {AlbumFavoritingRunDeps} deps
 * @returns {Promise<RunOutcome>}
 */
export async function runAlbumFavoriting(deps) {
  const { readCurrentPhotoKey, readFileName, probeFavoriteState, clickFavorite, requestNextPhoto, wait, now } = deps;

  /** @type {Set<string>} */
  const visited = new Set();

  /** @type {RunCounts} */
  const counts = {
    visited: 0,
    favorited: 0,
    wouldFavorite: 0,
    alreadyFavorited: 0,
    notInList: 0,
    unreadable: 0,
    clickFailed: 0,
  };

  /** The last file name we trusted. Guard 1 compares against it. See the note at the top. */
  let lastAcceptedFileName = /** @type {string | null} */ (null);

  /** Counts every info-panel request of the whole run, so the two methods alternate. */
  let infoPanelAttempt = 0;

  /**
   * Reads the file name until it is trustworthy.
   *
   * @param {number} arrivedAt
   * @param {number} deadline
   * @returns {Promise<string | null>}
   */
  async function readSettledFileName(arrivedAt, deadline) {
    /** @type {string | null} */
    let candidate = null;
    /** @type {number} */
    let candidateSince = 0;
    // Negative infinity, not zero: the first miss must ask at once. Zero delays
    // the first request by the whole retry gap whenever the clock starts near it.
    let lastInfoPanelRequestAt = Number.NEGATIVE_INFINITY;

    while (now() < deadline) {
      await wait(deps.pollMs);
      const current = readFileName();

      if (current === null) {
        // Either the info panel is closed, or Google Photos hid the viewer
        // chrome because the pointer stopped. Fix both, then read again.
        deps.keepPageAwake();
        if (now() - lastInfoPanelRequestAt >= INFO_PANEL_RETRY_MS) {
          lastInfoPanelRequestAt = now();
          deps.requestInfoPanel(infoPanelAttempt);
          infoPanelAttempt += 1;
        }
        candidate = null;
        continue;
      }

      // Guard 1: the panel still shows the photo we just left.
      if (current === lastAcceptedFileName) {
        candidate = null;
        continue;
      }

      if (current !== candidate) {
        candidate = current;
        candidateSince = now();
        continue;
      }

      // Guards 2 and 3.
      if (now() - candidateSince >= deps.confirmMs && now() - arrivedAt >= deps.minDwellMs) return candidate;
    }

    return null;
  }

  /**
   * Reads the favourite state until it is trustworthy.
   *
   * The toolbar carries no photo identity, so the only protection against a
   * stale reading is time: the same answer must hold for `confirmMs`, and the
   * file name above has already waited out its own guards.
   *
   * @param {number} deadline
   * @returns {Promise<FavoriteState | null>}
   */
  async function readSettledFavoriteState(deadline) {
    /** @type {FavoriteState | null} */
    let candidate = null;
    /** @type {number} */
    let candidateSince = 0;

    while (now() < deadline) {
      const current = probeFavoriteState();

      if (current === null) {
        deps.keepPageAwake();
        candidate = null;
      } else if (current !== candidate) {
        candidate = current;
        candidateSince = now();
      } else if (now() - candidateSince >= deps.confirmMs) {
        return candidate;
      }

      await wait(deps.pollMs);
    }

    return null;
  }

  /**
   * Presses the favourite control and waits for the page to confirm the change.
   * @param {number} deadline
   * @returns {Promise<boolean>}
   */
  async function favoriteCurrentPhoto(deadline) {
    deps.keepPageAwake();
    if (!clickFavorite()) return false;

    while (now() < deadline) {
      await wait(deps.pollMs);
      if (probeFavoriteState() === 'favorited') return true;
    }
    return false;
  }

  /**
   * Decides and performs what happens to the photo on screen.
   * @param {string} photoKey
   * @returns {Promise<PhotoResult>}
   */
  async function handleCurrentPhoto(photoKey) {
    const arrivedAt = now();
    const deadline = arrivedAt + deps.timeoutMs;

    const fileName = await readSettledFileName(arrivedAt, deadline);
    if (fileName === null) return { photoKey, fileName: null, action: 'unreadable' };

    lastAcceptedFileName = fileName;
    if (!deps.isWanted(fileName)) return { photoKey, fileName, action: 'not-in-list' };

    const state = await readSettledFavoriteState(deadline);
    if (state === null) return { photoKey, fileName, action: 'unreadable' };
    if (state === 'favorited') return { photoKey, fileName, action: 'already-favorited' };
    if (deps.dryRun) return { photoKey, fileName, action: 'would-favorite' };

    const clicked = await favoriteCurrentPhoto(now() + deps.clickConfirmMs);
    return { photoKey, fileName, action: clicked ? 'favorited' : 'click-failed' };
  }

  /**
   * Moves to the next photo, trying each available method in turn.
   * @param {string} currentPhotoKey
   * @returns {Promise<string | null>} The new photo id, or null when nothing worked.
   */
  async function advancePastPhoto(currentPhotoKey) {
    for (const [attempt, attemptTimeoutMs] of ADVANCE_ATTEMPT_TIMEOUTS_MS.entries()) {
      // The next control is part of the chrome that hides with the pointer.
      deps.keepPageAwake();
      await requestNextPhoto(attempt);

      const attemptDeadline = now() + attemptTimeoutMs;
      while (now() < attemptDeadline) {
        await wait(ADVANCE_POLL_MS);
        const key = readCurrentPhotoKey();
        if (key === null) return null;
        if (key !== currentPhotoKey) return key;
      }
    }
    return null;
  }

  /**
   * @param {RunStopReason} reason
   * @returns {RunOutcome}
   */
  const outcome = (reason) => ({
    ...counts,
    reason,
    // Only meaningful when the walk could not continue, but it is cheap and it
    // is exactly what a stall report needs.
    nextControlState: reason === 'stuck' || reason === 'end-of-album' ? deps.readNextControlState() : null,
  });

  /** @param {PhotoAction} action */
  function countAction(action) {
    if (action === 'favorited') counts.favorited += 1;
    else if (action === 'would-favorite') counts.wouldFavorite += 1;
    else if (action === 'already-favorited') counts.alreadyFavorited += 1;
    else if (action === 'not-in-list') counts.notInList += 1;
    else if (action === 'click-failed') counts.clickFailed += 1;
    else counts.unreadable += 1;
  }

  let photoKey = readCurrentPhotoKey();
  if (photoKey === null) return outcome('no-photo-open');

  for (;;) {
    if (visited.has(photoKey)) return outcome('loop-detected');
    visited.add(photoKey);

    const photoStartedAt = now();
    const result = await handleCurrentPhoto(photoKey);

    counts.visited = visited.size;
    countAction(result.action);
    deps.onResult(result);
    deps.onProgress({ ...counts });

    if (deps.shouldStop()) return outcome('stopped');

    // Hold the floor, counting whatever this photo already spent. See MIN_PHOTO_INTERVAL_MS.
    const spentOnPhoto = now() - photoStartedAt;
    if (spentOnPhoto < MIN_PHOTO_INTERVAL_MS) await wait(MIN_PHOTO_INTERVAL_MS - spentOnPhoto);

    const nextPhotoKey = await advancePastPhoto(photoKey);
    if (nextPhotoKey === null) {
      // The viewer closed, so there is nothing left to read.
      if (readCurrentPhotoKey() === null) return outcome('end-of-album');

      // The viewer is still open on the same photo. Google Photos does exactly
      // that on the last photo of an album, so "cannot advance" is not proof of
      // a stall. Only a next control that is present and disabled proves the
      // album ended. Anything else stays `stuck`, because a run that claims to
      // be complete without that proof leaves the user believing every photo in
      // the list was handled.
      return outcome(deps.readNextControlState() === 'disabled' ? 'end-of-album' : 'stuck');
    }
    photoKey = nextPhotoKey;
  }
}
