import test from 'node:test';
import assert from 'node:assert/strict';

import { runAlbumFavoriting } from '../src/favorites/albumFavoritingRun.js';

/**
 * @typedef {object} FakePhoto
 * @property {string} key
 * @property {string} fileName
 * @property {boolean} [favorited]
 */

/**
 * A whole album in memory, with a virtual clock.
 *
 * `staleMs` is the point of this fake. For that long after each move it answers
 * with the **previous** photo's file name and favourite state, which is exactly
 * what the real page does while it redraws. A run that acts on those readings
 * marks the wrong photo, so every test here runs with it switched on.
 *
 * @param {FakePhoto[]} photos
 * @param {{ staleMs?: number, infoPanelOpens?: boolean }} [options]
 */
function createFakeAlbum(photos, { staleMs = 0, infoPanelOpens = true } = {}) {
  let now = 0;
  let index = 0;
  let arrivedAt = 0;
  let infoPanelOpen = false;

  /** @type {string[]} */
  const clickedKeys = [];
  /** @type {number[]} */
  const infoPanelAttempts = [];

  const current = () => /** @type {FakePhoto} */ (photos[index]);
  const previous = () => (index === 0 ? null : /** @type {FakePhoto} */ (photos[index - 1]));
  const isStale = () => now - arrivedAt < staleMs;
  /** @returns {FakePhoto | null} */
  const shown = () => (isStale() ? previous() : current());

  return {
    get clickedKeys() {
      return clickedKeys;
    },
    get photos() {
      return photos;
    },
    get infoPanelAttempts() {
      return infoPanelAttempts;
    },

    /** @type {Partial<import('../src/favorites/albumFavoritingRun.js').AlbumFavoritingRunDeps>} */
    deps: {
      readCurrentPhotoKey: () => current().key,
      readFileName: () => {
        if (!infoPanelOpen) return null;
        return shown()?.fileName ?? null;
      },
      probeFavoriteState: () => {
        const photo = shown();
        if (photo === null) return null;
        return photo.favorited === true ? 'favorited' : 'not-favorited';
      },
      clickFavorite: () => {
        const photo = shown();
        if (photo === null) return false;
        clickedKeys.push(photo.key);
        photo.favorited = true;
        return true;
      },
      requestInfoPanel: (/** @type {number} */ attempt) => {
        infoPanelAttempts.push(attempt);
        if (infoPanelOpens) infoPanelOpen = true;
      },
      readNextControlState: () => (index < photos.length - 1 ? 'enabled' : 'disabled'),
      requestNextPhoto: async () => {
        if (index >= photos.length - 1) return;
        index += 1;
        arrivedAt = now;
      },
      keepPageAwake: () => {},
      wait: async (milliseconds) => {
        now += milliseconds;
      },
      now: () => now,
    },
  };
}

/**
 * @param {ReturnType<typeof createFakeAlbum>} album
 * @param {Partial<import('../src/favorites/albumFavoritingRun.js').AlbumFavoritingRunDeps>} overrides
 */
function run(album, overrides = {}) {
  /** @type {import('../src/favorites/albumFavoritingRun.js').PhotoResult[]} */
  const results = [];
  return runAlbumFavoriting(
    /** @type {any} */ ({
      ...album.deps,
      isWanted: () => true,
      onResult: (/** @type {any} */ result) => results.push(result),
      onProgress: () => {},
      shouldStop: () => false,
      pollMs: 10,
      minDwellMs: 20,
      confirmMs: 20,
      timeoutMs: 2000,
      clickConfirmMs: 200,
      dryRun: false,
      ...overrides,
    }),
  ).then((outcome) => ({ outcome, results }));
}

test('marks only the photos whose file name is in the list', async () => {
  const album = createFakeAlbum([
    { key: 'a', fileName: 'IMG_1.HEIC' },
    { key: 'b', fileName: 'IMG_2.HEIC' },
    { key: 'c', fileName: 'IMG_3.HEIC' },
  ]);

  const wanted = new Set(['IMG_1.HEIC', 'IMG_3.HEIC']);
  const { outcome } = await run(album, { isWanted: (/** @type {string} */ name) => wanted.has(name) });

  assert.deepEqual(album.clickedKeys, ['a', 'c']);
  assert.equal(outcome.reason, 'end-of-album');
  assert.equal(outcome.visited, 3);
  assert.equal(outcome.favorited, 2);
  assert.equal(outcome.notInList, 1);
});

test('a stale info panel never marks the photo the viewer just left', async () => {
  // Without the guards, photo "b" would be read as "IMG_1.HEIC", and the run
  // would press favourite on "b" because "IMG_1.HEIC" is in the list.
  const album = createFakeAlbum(
    [
      { key: 'a', fileName: 'IMG_1.HEIC' },
      { key: 'b', fileName: 'IMG_2.HEIC' },
      { key: 'c', fileName: 'IMG_3.HEIC' },
    ],
    { staleMs: 400 },
  );

  const wanted = new Set(['IMG_1.HEIC']);
  const { results } = await run(album, { isWanted: (/** @type {string} */ name) => wanted.has(name) });

  assert.deepEqual(album.clickedKeys, ['a']);
  assert.deepEqual(
    results.map((result) => result.fileName),
    ['IMG_1.HEIC', 'IMG_2.HEIC', 'IMG_3.HEIC'],
  );
});

test('leaves a photo that is already a favourite alone', async () => {
  const album = createFakeAlbum([{ key: 'a', fileName: 'IMG_1.HEIC', favorited: true }]);

  const { outcome } = await run(album);

  assert.deepEqual(album.clickedKeys, []);
  assert.equal(outcome.alreadyFavorited, 1);
  assert.equal(outcome.favorited, 0);
});

test('a dry run reports what it would do and clicks nothing', async () => {
  const album = createFakeAlbum([
    { key: 'a', fileName: 'IMG_1.HEIC' },
    { key: 'b', fileName: 'IMG_2.HEIC' },
  ]);

  const { outcome } = await run(album, { dryRun: true });

  assert.deepEqual(album.clickedKeys, []);
  assert.equal(outcome.wouldFavorite, 2);
  assert.equal(outcome.favorited, 0);
});

test('skips the photo and clicks nothing when the info panel never opens', async () => {
  const album = createFakeAlbum([{ key: 'a', fileName: 'IMG_1.HEIC' }], { infoPanelOpens: false });

  const { outcome } = await run(album);

  assert.deepEqual(album.clickedKeys, []);
  assert.equal(outcome.unreadable, 1);
});

test('numbers the info-panel requests, so the key and the button alternate', async () => {
  // The panel is a toggle. Sending the key and clicking the button in one go
  // opens it and closes it again, so the two must take turns.
  const album = createFakeAlbum([{ key: 'a', fileName: 'IMG_1.HEIC' }], { infoPanelOpens: false });

  await run(album);

  assert.ok(album.infoPanelAttempts.length >= 2, 'the run must ask more than once');
  assert.deepEqual(album.infoPanelAttempts.slice(0, 2), [0, 1]);
});

test('two photos in a row with the same file name leave the second unread', async () => {
  // The guard against a stale reading is "the name must change", so a genuine
  // repeat looks the same as a panel that has not redrawn. Skipping is the safe
  // half of that trade, and the report names the photo.
  const album = createFakeAlbum([
    { key: 'a', fileName: 'IMG_1.HEIC' },
    { key: 'b', fileName: 'IMG_1.HEIC' },
  ]);

  const { outcome } = await run(album);

  assert.deepEqual(album.clickedKeys, ['a']);
  assert.equal(outcome.unreadable, 1);
});

test('stops when the user presses Stop, and keeps what it already did', async () => {
  const album = createFakeAlbum([
    { key: 'a', fileName: 'IMG_1.HEIC' },
    { key: 'b', fileName: 'IMG_2.HEIC' },
  ]);

  const { outcome } = await run(album, { shouldStop: () => true });

  assert.equal(outcome.reason, 'stopped');
  assert.equal(outcome.visited, 1);
  assert.deepEqual(album.clickedKeys, ['a']);
});

test('reports "no-photo-open" when the viewer is not open', async () => {
  const album = createFakeAlbum([{ key: 'a', fileName: 'IMG_1.HEIC' }]);

  const { outcome } = await run(album, { readCurrentPhotoKey: () => null });

  assert.equal(outcome.reason, 'no-photo-open');
});

test('reports "stuck" when it cannot advance and the next control is still enabled', async () => {
  // A run that calls this "done" would leave the user believing every photo in
  // the list was handled, when the album had simply not loaded that far.
  const album = createFakeAlbum([
    { key: 'a', fileName: 'IMG_1.HEIC' },
    { key: 'b', fileName: 'IMG_2.HEIC' },
  ]);

  const { outcome } = await run(album, {
    requestNextPhoto: async () => {},
    readNextControlState: () => 'enabled',
  });

  assert.equal(outcome.reason, 'stuck');
  assert.equal(outcome.nextControlState, 'enabled');
});

test('reports "loop-detected" when the viewer returns to a photo it already saw', async () => {
  const keys = ['a', 'b', 'a'];
  let step = 0;
  const album = createFakeAlbum([
    { key: 'a', fileName: 'IMG_1.HEIC' },
    { key: 'b', fileName: 'IMG_2.HEIC' },
    { key: 'c', fileName: 'IMG_3.HEIC' },
  ]);

  const { outcome } = await run(album, {
    readCurrentPhotoKey: () => keys[Math.min(step, keys.length - 1)] ?? null,
    requestNextPhoto: async () => {
      step += 1;
    },
  });

  assert.equal(outcome.reason, 'loop-detected');
});
