/**
 * All user settings, their defaults, and the reading and writing helpers.
 *
 * The storage area is passed in instead of read from `chrome` directly, so the
 * pure logic in this file can be unit tested without a browser.
 */

/**
 * @typedef {object} ExtensionSettings
 * @property {string[]} favoriteLabels    Control names that mean "not a favourite yet".
 * @property {string[]} unfavoriteLabels  Control names that mean "already a favourite".
 * @property {string[]} infoLabels        Control names that open the info panel.
 * @property {number} pollMs              How often to read the page.
 * @property {number} minDwellMs          Ignore readings taken this soon after a photo opens.
 * @property {number} confirmMs           How long one reading must hold before we believe it.
 * @property {number} timeoutMs           Give up on one photo after this long.
 * @property {number} clickConfirmMs      How long to wait for a click to turn the photo into a favourite.
 * @property {boolean} dryRun             Report what would happen and click nothing.
 */

/** @type {Readonly<ExtensionSettings>} */
export const DEFAULT_SETTINGS = Object.freeze({
  favoriteLabels: [
    'favorite',
    'favourite',
    'add to favorites',
    'add to favourites',
    'mark as favorite',
    'mark as favourite',
    'favorito',
    'favorita',
    'añadir a favoritos',
    'anadir a favoritos',
    'agregar a favoritos',
    'marcar como favorito',
    'preferit',
    'preferits',
    'afegeix a preferits',
    'afegir a preferits',
    'marca com a preferit',
  ],
  unfavoriteLabels: [
    'unfavorite',
    'unfavourite',
    'remove from favorites',
    'remove from favourites',
    'quitar de favoritos',
    'eliminar de favoritos',
    'quitar como favorito',
    'desmarcar como favorito',
    'treu de preferits',
    'elimina dels preferits',
    'desmarca com a preferit',
  ],
  infoLabels: ['info', 'information', 'información', 'informacion', 'informació', 'informacio', 'open info', 'show info'],
  pollMs: 40,
  minDwellMs: 200,
  confirmMs: 250,
  timeoutMs: 8000,
  clickConfirmMs: 4000,
  dryRun: false,
});

export const SETTINGS_STORAGE_KEY = 'settings:v1';

/**
 * Drops unknown keys and replaces wrong or missing values with the default.
 * Storage can hold anything, including settings written by an older version.
 * @param {unknown} stored
 * @returns {ExtensionSettings}
 */
export function normalizeSettings(stored) {
  const raw = stored !== null && typeof stored === 'object' ? /** @type {Record<string, unknown>} */ (stored) : {};

  /**
   * @param {keyof ExtensionSettings} key
   * @returns {boolean}
   */
  const readBoolean = (key) =>
    typeof raw[key] === 'boolean' ? /** @type {boolean} */ (raw[key]) : /** @type {boolean} */ (DEFAULT_SETTINGS[key]);

  /**
   * @param {keyof ExtensionSettings} key
   * @param {number} minimum
   * @param {number} maximum
   * @returns {number}
   */
  const readNumber = (key, minimum, maximum) => {
    const value = raw[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) return /** @type {number} */ (DEFAULT_SETTINGS[key]);
    return Math.min(Math.max(Math.round(value), minimum), maximum);
  };

  /**
   * @param {keyof ExtensionSettings} key
   * @returns {string[]}
   */
  const readLabels = (key) => {
    const value = raw[key];
    if (!Array.isArray(value)) return [.../** @type {string[]} */ (DEFAULT_SETTINGS[key])];
    const labels = value
      .filter((entry) => typeof entry === 'string')
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean);
    return labels.length > 0 ? labels : [.../** @type {string[]} */ (DEFAULT_SETTINGS[key])];
  };

  return {
    favoriteLabels: readLabels('favoriteLabels'),
    unfavoriteLabels: readLabels('unfavoriteLabels'),
    infoLabels: readLabels('infoLabels'),
    pollMs: readNumber('pollMs', 20, 1000),
    minDwellMs: readNumber('minDwellMs', 0, 5000),
    confirmMs: readNumber('confirmMs', 50, 5000),
    timeoutMs: readNumber('timeoutMs', 1000, 60000),
    clickConfirmMs: readNumber('clickConfirmMs', 500, 30000),
    dryRun: readBoolean('dryRun'),
  };
}

/**
 * @param {chrome.storage.StorageArea} storageArea
 * @returns {Promise<ExtensionSettings>}
 */
export async function loadSettings(storageArea) {
  const stored = await storageArea.get(SETTINGS_STORAGE_KEY);
  return normalizeSettings(stored[SETTINGS_STORAGE_KEY]);
}

/**
 * @param {chrome.storage.StorageArea} storageArea
 * @param {Partial<ExtensionSettings>} changes
 * @returns {Promise<ExtensionSettings>}
 */
export async function saveSettings(storageArea, changes) {
  const current = await loadSettings(storageArea);
  const next = normalizeSettings({ ...current, ...changes });
  await storageArea.set({ [SETTINGS_STORAGE_KEY]: next });
  return next;
}
