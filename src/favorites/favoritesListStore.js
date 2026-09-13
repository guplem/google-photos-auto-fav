/**
 * Keeps the loaded list of file names in `chrome.storage.local`, so you choose
 * the file once and every Google Photos tab uses it until you replace it.
 *
 * `local`, not `sync`: a list of a few thousand names is far past the per-item
 * quota of `sync`, and the list belongs to this computer anyway.
 *
 * The storage area is passed in instead of read from `chrome` directly, so the
 * normalizer in this file can be unit tested without a browser.
 */

export const FAVORITES_LIST_STORAGE_KEY = 'favoritesList:v1';

/**
 * @typedef {object} FavoritesListRecord
 * @property {string[]} names      The file names, normalized, in file order.
 * @property {string} sourceName   The name of the file the user chose, for the panel to show.
 * @property {number} loadedAt     Epoch milliseconds.
 */

/** @returns {FavoritesListRecord} */
export function createEmptyListRecord() {
  return { names: [], sourceName: '', loadedAt: 0 };
}

/**
 * Drops unknown keys and repairs wrong values, because storage can hold data
 * written by an older version of the extension.
 * @param {unknown} stored
 * @returns {FavoritesListRecord}
 */
export function normalizeListRecord(stored) {
  if (stored === null || typeof stored !== 'object') return createEmptyListRecord();
  const raw = /** @type {Record<string, unknown>} */ (stored);

  const names = Array.isArray(raw.names) ? raw.names.filter((name) => typeof name === 'string' && name !== '') : [];
  const sourceName = typeof raw.sourceName === 'string' ? raw.sourceName : '';
  const loadedAt = typeof raw.loadedAt === 'number' && Number.isFinite(raw.loadedAt) ? raw.loadedAt : 0;

  return { names, sourceName, loadedAt };
}

/**
 * @param {chrome.storage.StorageArea} storageArea
 */
export function createFavoritesListStore(storageArea) {
  return {
    /** @returns {Promise<FavoritesListRecord>} */
    async read() {
      const stored = await storageArea.get(FAVORITES_LIST_STORAGE_KEY);
      return normalizeListRecord(stored[FAVORITES_LIST_STORAGE_KEY]);
    },

    /**
     * @param {string[]} names
     * @param {string} sourceName
     * @returns {Promise<FavoritesListRecord>}
     */
    async write(names, sourceName) {
      const record = normalizeListRecord({ names, sourceName, loadedAt: Date.now() });
      await storageArea.set({ [FAVORITES_LIST_STORAGE_KEY]: record });
      return record;
    },

    /** @returns {Promise<void>} */
    async clear() {
      await storageArea.remove(FAVORITES_LIST_STORAGE_KEY);
    },
  };
}
