/**
 * Reads whether the photo currently open in the viewer is already a favourite,
 * and finds the control that changes it.
 *
 * Two signals, in this order of trust:
 *
 *  1. `aria-pressed` on the favourite control. It is a real true or false, and
 *     it works in every language.
 *  2. The name of the control. Google Photos renames the button between "add to
 *     favourites" and "remove from favourites", so the name alone answers the
 *     question when `aria-pressed` is absent.
 *
 * Everything here takes its DOM helpers as arguments, so the decision can be
 * unit tested with plain objects.
 */

import { CONTROL_SELECTOR, matchesAnyLabel, readControlName, readPressedState } from '../domControls.js';

/**
 * @typedef {'favorited' | 'not-favorited'} FavoriteState
 *
 * @typedef {object} ToolbarControl
 * @property {string} name              The accessible name, lowercased.
 * @property {boolean | null} pressed   `aria-pressed`, or null when the control does not report it.
 * @property {Element} element
 *
 * @typedef {object} FavoriteProbeDeps
 * @property {ParentNode} root
 * @property {readonly string[]} favoriteLabels    Names that mean "not a favourite yet".
 * @property {readonly string[]} unfavoriteLabels  Names that mean "already a favourite".
 * @property {(element: Element) => boolean} isVisible
 * @property {(element: Element) => boolean} isInToolbar
 * @property {() => boolean} [isBlocked]  True while something covers the viewer, such as a dialog.
 */

/**
 * @param {FavoriteProbeDeps} deps
 * @returns {ToolbarControl[]}
 */
export function collectToolbarControls({ root, isVisible, isInToolbar }) {
  /** @type {ToolbarControl[]} */
  const controls = [];
  for (const element of root.querySelectorAll(CONTROL_SELECTOR)) {
    if (!isVisible(element) || !isInToolbar(element)) continue;
    const name = readControlName(element);
    if (name === '') continue;
    controls.push({ name, pressed: readPressedState(element), element });
  }
  return controls;
}

/**
 * The control that toggles the favourite state, or null when the toolbar shows none.
 * @param {readonly ToolbarControl[]} controls
 * @param {readonly string[]} favoriteLabels
 * @param {readonly string[]} unfavoriteLabels
 * @returns {ToolbarControl | null}
 */
export function findFavoriteControl(controls, favoriteLabels, unfavoriteLabels) {
  for (const control of controls) {
    if (matchesAnyLabel(control.name, favoriteLabels)) return control;
    if (matchesAnyLabel(control.name, unfavoriteLabels)) return control;
  }
  return null;
}

/**
 * Turns the toolbar into a verdict.
 *
 * Returns `null` for "cannot tell yet". That happens while the toolbar is still
 * drawing, and it matters: a missing control looks exactly like a favourite
 * photo, so a guess here would skip photos the user asked for, or worse, click
 * a control that belongs to the previous photo.
 *
 * @param {readonly ToolbarControl[]} controls
 * @param {readonly string[]} favoriteLabels
 * @param {readonly string[]} unfavoriteLabels
 * @returns {FavoriteState | null}
 */
export function classifyFavoriteState(controls, favoriteLabels, unfavoriteLabels) {
  const control = findFavoriteControl(controls, favoriteLabels, unfavoriteLabels);
  if (control === null) return null;

  // `aria-pressed` beats the name, because Google Photos writes the name in the
  // user's language and can rename it, while true and false never change.
  if (control.pressed !== null) return control.pressed ? 'favorited' : 'not-favorited';

  return matchesAnyLabel(control.name, unfavoriteLabels) ? 'favorited' : 'not-favorited';
}

/**
 * @param {FavoriteProbeDeps} deps
 * @returns {FavoriteState | null}
 */
export function probeFavoriteState(deps) {
  // A dialog such as "Edit date/time" covers the viewer toolbar. Any reading
  // taken while one is open belongs to the dialog, not to the photo.
  if (deps.isBlocked?.() === true) return null;
  return classifyFavoriteState(collectToolbarControls(deps), deps.favoriteLabels, deps.unfavoriteLabels);
}

/** Attributes that only carry Google's own obfuscated bookkeeping. */
const NOISE_ATTRIBUTES = ['class', 'style', 'jsaction', 'jsname', 'jscontroller', 'jsshadow', 'jsslot'];

/** Longest attribute value the diagnostics keep. */
const MAX_ATTRIBUTE_VALUE_LENGTH = 80;

/**
 * Dumps every meaningful attribute of the favourite control.
 *
 * This answers the one question the extension cannot answer on its own: does
 * Google Photos report the favourite state at all? If the control carries no
 * `aria-pressed` and keeps the same name whether or not the photo is a
 * favourite, then nothing on the page separates the two, and a run must not
 * click. Open a photo you already starred, read this, and compare.
 *
 * @param {FavoriteProbeDeps} deps
 * @returns {Record<string, string> | null}
 */
export function describeFavoriteControl(deps) {
  const control = findFavoriteControl(collectToolbarControls(deps), deps.favoriteLabels, deps.unfavoriteLabels);
  if (control === null) return null;

  /** @type {Record<string, string>} */
  const attributes = { tagName: control.element.tagName.toLowerCase() };
  for (const attribute of control.element.attributes) {
    if (NOISE_ATTRIBUTES.includes(attribute.name)) continue;
    attributes[attribute.name] = attribute.value.slice(0, MAX_ATTRIBUTE_VALUE_LENGTH);
  }
  return attributes;
}

/**
 * Clicks the favourite control of the photo on screen.
 *
 * It never clicks a control it cannot name, and it never clicks a control that
 * already reads as a favourite, so a run can only add favourites and can never
 * remove one.
 * @param {FavoriteProbeDeps} deps
 * @returns {boolean} False when the toolbar offers no control to click.
 */
export function clickFavoriteControl(deps) {
  if (deps.isBlocked?.() === true) return false;

  const controls = collectToolbarControls(deps);
  const control = findFavoriteControl(controls, deps.favoriteLabels, deps.unfavoriteLabels);
  if (control === null) return false;
  if (classifyFavoriteState(controls, deps.favoriteLabels, deps.unfavoriteLabels) !== 'not-favorited') return false;

  /** @type {HTMLElement} */ (control.element).click();
  return true;
}
