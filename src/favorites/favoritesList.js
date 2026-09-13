/**
 * The list of file names you want marked as favourite, and the rule that says
 * whether one photo is in it.
 *
 * The list arrives as a plain text file, one file name per line, such as the
 * `favorites.txt` a gallery export produces:
 *
 *     PXL_20260815_171046148.mp4
 *     IMG_4903.HEIC
 *     # a comment line is ignored
 *
 * This file holds no DOM code and no `chrome.*` call, so the whole matching rule
 * is unit tested with plain strings.
 */

/**
 * @typedef {object} FavoritesLookup
 * @property {number} size                        How many distinct names the list holds.
 * @property {readonly string[]} names            The names, normalized, in file order.
 * @property {(fileName: string) => boolean} has  True when this file name is in the list.
 */

/**
 * Lowercases the name and drops any folder part, so `Photos/IMG_1.HEIC` and
 * `img_1.heic` compare equal.
 *
 * Google Photos shows only the bare file name, but a list exported from a file
 * manager often carries a path, and a list written by hand often carries stray
 * spaces or a quote.
 * @param {string} rawName
 * @returns {string}
 */
export function normalizeFileName(rawName) {
  const parts = rawName
    .trim()
    .replace(/^["']|["']$/g, '')
    .split(/[\\/]/);
  return (parts[parts.length - 1] ?? '').trim().toLowerCase();
}

/**
 * Turns the text of the list file into the names it holds.
 *
 * Order is kept, because the report at the end of a run lists the names that the
 * album never showed, and a list in the user's own order is easier to check.
 * @param {string} fileText
 * @returns {string[]}
 */
export function parseFavoritesFile(fileText) {
  /** @type {Set<string>} */
  const seen = new Set();
  /** @type {string[]} */
  const names = [];

  for (const line of fileText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    const name = normalizeFileName(trimmed);
    if (name === '' || seen.has(name)) continue;

    seen.add(name);
    names.push(name);
  }

  return names;
}

/**
 * @param {readonly string[]} names  Already normalized, as `parseFavoritesFile` returns them.
 * @returns {FavoritesLookup}
 */
export function createFavoritesLookup(names) {
  const index = new Set(names);
  return {
    size: index.size,
    names: [...names],
    has: (fileName) => index.has(normalizeFileName(fileName)),
  };
}
