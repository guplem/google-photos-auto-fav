/**
 * Reads the file name of the photo currently open in the viewer.
 *
 * Google Photos never shows the file name in the viewer itself. It shows it in
 * the info panel, the sidebar that the `i` key opens. So a run opens that panel
 * once and then reads the name from it for every photo.
 *
 * There is no stable element to point at, so the search is by shape: find the
 * visible pieces of text that look like a media file name. That is a narrow
 * shape ("something dot a known media extension"), and nothing else in the
 * viewer has it.
 *
 * The answer is `null` whenever the page shows zero names, or more than one
 * different name. `null` means "cannot tell yet", never "no name". The caller
 * skips the photo rather than act on a name that may belong to another photo.
 */

/** Extensions Google Photos can hold. Anything else is not a media file name. */
const MEDIA_EXTENSIONS = [
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'bmp',
  'tif',
  'tiff',
  'heic',
  'heif',
  'avif',
  'dng',
  'raw',
  'cr2',
  'cr3',
  'nef',
  'arw',
  'orf',
  'rw2',
  'mp4',
  'mov',
  'm4v',
  'avi',
  'mkv',
  'webm',
  'mts',
  'm2ts',
  '3gp',
  'mpg',
  'mpeg',
  'wmv',
];

/**
 * A whole string that is one media file name, such as `PXL_20260816_102200375.MP.jpg`.
 *
 * The name part allows dots, so the `.MP.jpg` that a Pixel motion photo uses
 * still matches. It forbids slashes and whitespace runs, which is what keeps a
 * sentence that happens to end in ".mov" out of the results.
 */
export const MEDIA_FILE_NAME_PATTERN = new RegExp(`^[^\\s\\\\/]{1,120}\\.(?:${MEDIA_EXTENSIONS.join('|')})$`, 'i');

/**
 * @param {string} text
 * @returns {boolean}
 */
export function isMediaFileName(text) {
  return MEDIA_FILE_NAME_PATTERN.test(text.trim());
}

/**
 * @typedef {object} FileNameReaderDeps
 * @property {ParentNode} root
 * @property {(element: Element) => boolean} isVisible
 */

/**
 * Every distinct media file name the page shows right now.
 *
 * Only leaf elements are read. A parent repeats the text of its children, so
 * reading parents too would return the same name many times and would also pull
 * in the surrounding sentence.
 * @param {FileNameReaderDeps} deps
 * @returns {string[]}
 */
export function collectVisibleFileNames({ root, isVisible }) {
  /** @type {Set<string>} */
  const names = new Set();

  for (const element of root.querySelectorAll('*')) {
    if (element.childElementCount > 0) continue;
    if (!isVisible(element)) continue;

    const text = (element.textContent ?? '').trim();
    if (isMediaFileName(text)) names.add(text);

    // Google Photos sometimes puts the name only in the accessible label, for
    // example on the thumbnail of the photo the info panel describes.
    const ariaLabel = (element.getAttribute('aria-label') ?? '').trim();
    if (isMediaFileName(ariaLabel)) names.add(ariaLabel);
  }

  return [...names];
}

/**
 * Turns the names found on screen into one answer.
 *
 * Two different names mean the info panel is between photos, or that something
 * else on the page also shows a file name. Neither is safe to act on.
 * @param {readonly string[]} visibleFileNames
 * @returns {string | null}
 */
export function classifyFileName(visibleFileNames) {
  return visibleFileNames.length === 1 ? /** @type {string} */ (visibleFileNames[0]) : null;
}

/**
 * @param {FileNameReaderDeps} deps
 * @returns {string | null}
 */
export function readCurrentFileName(deps) {
  return classifyFileName(collectVisibleFileNames(deps));
}
