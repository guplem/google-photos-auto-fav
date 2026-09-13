/**
 * Entry point of the page half of the extension. Runs in the isolated world, so
 * it can use `chrome.*` APIs and can read the DOM, but cannot see the page's own
 * JavaScript variables.
 *
 * Responsibilities, in order:
 *   1. Load the settings and the list of file names.
 *   2. Follow the single-page-app navigation and keep track of which album is open.
 *   3. Walk the album and mark the photos whose file name is in the list.
 *   4. Draw the control panel.
 */

import { DEFAULT_SETTINGS, loadSettings, saveSettings } from './settings/extensionSettings.js';
import { isAlbumContext, readGooglePhotosLocation, findGridPhotoLinks } from './googlePhotosPage.js';
import { createDomHelpers } from './domControls.js';
import { createFavoritesListStore, createEmptyListRecord } from './favorites/favoritesListStore.js';
import { createFavoritesLookup, parseFavoritesFile } from './favorites/favoritesList.js';
import {
  clickFavoriteControl,
  collectToolbarControls,
  describeFavoriteControl,
  probeFavoriteState,
} from './favorites/favoriteProbe.js';
import { collectVisibleFileNames, readCurrentFileName } from './favorites/photoFileNameReader.js';
import { createPhotoViewerNavigator } from './favorites/photoViewerNavigator.js';
import { runAlbumFavoriting } from './favorites/albumFavoritingRun.js';
import { createControlPanel } from './controlPanel/controlPanelController.js';
import { buildRunReport } from './runReport.js';

/** How often we check whether the single-page app changed the address bar. */
const LOCATION_POLL_MS = 300;

/** How long the virtualised album grid needs to redraw after a scroll, in milliseconds. */
const GRID_REDRAW_WAIT_MS = 500;

/** How long to let the viewer settle after it opens, before the walk starts reading. */
const VIEWER_OPEN_WAIT_MS = 800;

/**
 * @param {number} milliseconds
 * @returns {Promise<void>}
 */
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function start() {
  const listStore = createFavoritesListStore(chrome.storage.local);

  /** @type {import('./settings/extensionSettings.js').ExtensionSettings} */
  let settings = DEFAULT_SETTINGS;
  /** @type {import('./favorites/favoritesListStore.js').FavoritesListRecord} */
  let listRecord = createEmptyListRecord();
  /** @type {import('./favorites/favoritesList.js').FavoritesLookup} */
  let lookup = createFavoritesLookup([]);

  let running = false;
  let stopRequested = false;
  let lastHref = '';
  /** @type {import('./favorites/albumFavoritingRun.js').RunOutcome | null} */
  let lastRunOutcome = null;
  /** @type {import('./favorites/albumFavoritingRun.js').PhotoResult[]} */
  let lastRunResults = [];

  // The navigator reads the info labels once, so it is rebuilt whenever the
  // settings change.
  let viewerNavigator = createPhotoViewerNavigator(window, settings.infoLabels);

  /** @returns {import('./favorites/favoriteProbe.js').FavoriteProbeDeps} */
  function buildFavoriteProbeDeps() {
    const helpers = createDomHelpers(window);
    return {
      root: document,
      favoriteLabels: settings.favoriteLabels,
      unfavoriteLabels: settings.unfavoriteLabels,
      isVisible: helpers.isVisible,
      isInToolbar: helpers.isInToolbar,
      isBlocked: () => viewerNavigator.isDialogOpen(),
    };
  }

  /** @returns {import('./favorites/photoFileNameReader.js').FileNameReaderDeps} */
  function buildFileNameReaderDeps() {
    return { root: document, isVisible: createDomHelpers(window).isVisible };
  }

  /** @returns {Promise<string>} */
  async function buildReport() {
    const report = buildRunReport({
      extensionVersion: chrome.runtime.getManifest().version,
      url: location.href,
      pageLocation: readGooglePhotosLocation(location.href),
      gridPhotoLinks: findGridPhotoLinks(document).length,
      listNames: listRecord.names,
      results: lastRunResults,
      lastRunOutcome,
      toolbarControlNames: collectToolbarControls(buildFavoriteProbeDeps()).map((control) => control.name),
      visibleFileNames: collectVisibleFileNames(buildFileNameReaderDeps()),
      favoriteState: probeFavoriteState(buildFavoriteProbeDeps()),
      favoriteControl: describeFavoriteControl(buildFavoriteProbeDeps()),
      dialogOpen: viewerNavigator.isDialogOpen(),
      nextControlState: viewerNavigator.readNextControlState(),
      viewport: { width: window.innerWidth, height: window.innerHeight },
    });
    return JSON.stringify(report, null, 2);
  }

  const panel = createControlPanel({
    document,
    onListFileChosen: (file) => void loadListFile(file),
    onDryRunChanged: (dryRun) => void applyDryRun(dryRun),
    onRunStart: () => void runOverAlbum(),
    onRunStop: () => {
      stopRequested = true;
      panel.setMessage('Stopping after the current photo.');
    },
    onOpenOptions: () => void chrome.runtime.sendMessage({ type: 'open-options' }),
    onBuildReport: buildReport,
  });

  /**
   * @param {File} file
   * @returns {Promise<void>}
   */
  async function loadListFile(file) {
    try {
      const names = parseFavoritesFile(await file.text());
      if (names.length === 0) {
        panel.setMessage('That file holds no file names. Put one name per line.');
        return;
      }
      listRecord = await listStore.write(names, file.name);
      lookup = createFavoritesLookup(listRecord.names);
      panel.setListSummary(listRecord);
      panel.setMessage(`Loaded ${names.length} names. Open the album and press Start.`);
    } catch (error) {
      console.error('[auto Fav] could not read the list file', error);
      panel.setMessage('Could not read that file.');
    }
  }

  /**
   * @param {boolean} dryRun
   * @returns {Promise<void>}
   */
  async function applyDryRun(dryRun) {
    settings = await saveSettings(chrome.storage.sync, { dryRun });
    panel.setMessage(dryRun ? 'Dry run on. A run will click nothing.' : 'Dry run off. A run will mark favourites.');
  }

  /**
   * @param {import('./favorites/albumFavoritingRun.js').RunOutcome} outcome
   * @returns {string}
   */
  function describeOutcome(outcome) {
    const marked = settings.dryRun ? `${outcome.wouldFavorite} would be marked` : `${outcome.favorited} marked`;
    const notes = [
      `${outcome.alreadyFavorited} already favourite`,
      outcome.unreadable > 0 ? `${outcome.unreadable} could not be read` : '',
      outcome.clickFailed > 0 ? `${outcome.clickFailed} did not take the click` : '',
    ].filter((note) => note !== '');

    const tail = `${marked}, ${notes.join(', ')}. Press Copy report for the details.`;

    if (outcome.reason === 'stopped') return `Stopped after ${outcome.visited} photos. ${tail}`;
    if (outcome.reason === 'no-photo-open') return 'Could not open the viewer.';
    if (outcome.reason === 'loop-detected') return `The viewer went back to a photo it already saw. ${tail}`;
    if (outcome.reason === 'stuck') {
      return (
        `Stopped after ${outcome.visited} photos: no way to reach the next one. ${tail} ` +
        `If that is the whole album, the run is complete. If not, press Start again to carry on from here.`
      );
    }
    return `Done. Passed ${outcome.visited} photos. ${tail}`;
  }

  /** @returns {Promise<void>} */
  async function runOverAlbum() {
    if (running) return;

    if (lookup.size === 0) {
      panel.setMessage('Choose the list file first.');
      return;
    }

    const albumKey = readGooglePhotosLocation(location.href).albumKey;
    if (albumKey === null) {
      panel.setMessage('Open an album first.');
      return;
    }

    running = true;
    stopRequested = false;
    lastRunResults = [];
    panel.setRunState('running');
    panel.setMessage('Starting.');

    try {
      // A run started with a photo already open begins there, so the user can
      // pick the starting point by hand.
      if (readGooglePhotosLocation(location.href).photoKey === null) {
        if (!(await viewerNavigator.openFirstPhoto(GRID_REDRAW_WAIT_MS))) {
          panel.setMessage('No photos found on this page.');
          return;
        }
        await wait(VIEWER_OPEN_WAIT_MS);
      }

      // The file name only exists in the info panel, so open it before the walk
      // starts. The walk asks again whenever a name is missing.
      viewerNavigator.requestInfoPanel(0);
      await wait(VIEWER_OPEN_WAIT_MS);

      const startedAt = Date.now();

      const outcome = await runAlbumFavoriting({
        readCurrentPhotoKey: () => readGooglePhotosLocation(location.href).photoKey,
        readFileName: () => readCurrentFileName(buildFileNameReaderDeps()),
        probeFavoriteState: () => probeFavoriteState(buildFavoriteProbeDeps()),
        clickFavorite: () => clickFavoriteControl(buildFavoriteProbeDeps()),
        requestInfoPanel: (attempt) => viewerNavigator.requestInfoPanel(attempt),
        readNextControlState: () => viewerNavigator.readNextControlState(),
        requestNextPhoto: (attempt) => viewerNavigator.requestNextPhoto(attempt),
        keepPageAwake: () => viewerNavigator.keepChromeAwake(),
        wait,
        now: () => Date.now(),
        isWanted: (fileName) => lookup.has(fileName),
        onResult: (result) => lastRunResults.push(result),
        onProgress: (counts) => {
          const perPhoto = Math.round((Date.now() - startedAt) / counts.visited);
          const marked = settings.dryRun ? `${counts.wouldFavorite} to mark` : `${counts.favorited} marked`;
          panel.setMessage(
            `Passed ${counts.visited}: ${marked}, ${counts.alreadyFavorited} already favourite, ` +
              `${counts.unreadable} unreadable. ${perPhoto}ms each.`,
          );
        },
        shouldStop: () => stopRequested,
        pollMs: settings.pollMs,
        minDwellMs: settings.minDwellMs,
        confirmMs: settings.confirmMs,
        timeoutMs: settings.timeoutMs,
        clickConfirmMs: settings.clickConfirmMs,
        dryRun: settings.dryRun,
      });

      lastRunOutcome = outcome;
      panel.setMessage(describeOutcome(outcome));
      if (outcome.reason === 'end-of-album') viewerNavigator.closeViewer();
    } catch (error) {
      console.error('[auto Fav] run failed', error);
      panel.setMessage('The run failed. See the browser console.');
    } finally {
      running = false;
      panel.setRunState('idle');
    }
  }

  /** @returns {Promise<void>} */
  async function onLocationChanged() {
    if (!isAlbumContext(readGooglePhotosLocation(location.href))) {
      if (!running) panel.unmount();
      return;
    }
    panel.mount();
  }

  /**
   * Google Photos is a single-page app: it rewrites the address bar without
   * loading a new page. Polling catches every one of those changes, including
   * the ones that fire no event.
   */
  function watchLocation() {
    const check = () => {
      if (location.href === lastHref) return;
      lastHref = location.href;
      void onLocationChanged();
    };
    window.addEventListener('popstate', check);
    setInterval(check, LOCATION_POLL_MS);
    check();
  }

  settings = await loadSettings(chrome.storage.sync);
  viewerNavigator = createPhotoViewerNavigator(window, settings.infoLabels);
  listRecord = await listStore.read();
  lookup = createFavoritesLookup(listRecord.names);

  panel.setListSummary(listRecord);
  panel.setDryRun(settings.dryRun);

  chrome.storage.onChanged.addListener((_changes, areaName) => {
    if (areaName !== 'sync') return;
    void loadSettings(chrome.storage.sync).then((next) => {
      settings = next;
      viewerNavigator = createPhotoViewerNavigator(window, next.infoLabels);
      panel.setDryRun(next.dryRun);
    });
  });

  watchLocation();
}
