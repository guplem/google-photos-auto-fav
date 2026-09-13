/**
 * The one place that turns a DOM element into the name a screen reader would
 * announce, plus the visibility helpers every other file reuses.
 *
 * Why accessible names: Google Photos ships obfuscated class names such as
 * `QxNbxb` that change with every release. An `aria-label` cannot change as
 * freely, because the site needs it for screen readers.
 */

/** Longest text we accept as a button name. Anything longer is a container, not a control. */
const MAX_CONTROL_NAME_LENGTH = 40;

/** Only controls in the top slice of the window count as toolbar controls. */
export const DEFAULT_TOOLBAR_TOP_FRACTION = 0.25;

export const CONTROL_SELECTOR = 'button, [role="button"], [role="checkbox"], [role="switch"]';

/**
 * Lowercases and collapses whitespace, so " Favourite  " and "favourite" compare equal.
 * @param {string | null | undefined} text
 * @returns {string}
 */
export function normalizeLabel(text) {
  return (text ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * The name a screen reader would announce for this control.
 * @param {Element} element
 * @returns {string}
 */
export function readControlName(element) {
  const ariaLabel = normalizeLabel(element.getAttribute('aria-label'));
  if (ariaLabel !== '') return ariaLabel;

  const title = normalizeLabel(element.getAttribute('title'));
  if (title !== '') return title;

  const text = normalizeLabel(element.textContent);
  return text.length <= MAX_CONTROL_NAME_LENGTH ? text : '';
}

/**
 * Exact match, not "contains". "add to favourites" and "remove from favourites"
 * both contain the word "favourites" but mean opposite things, so a loose match
 * would read the wrong answer and could unfavourite a photo.
 * @param {string} name
 * @param {readonly string[]} labels
 * @returns {boolean}
 */
export function matchesAnyLabel(name, labels) {
  return name !== '' && labels.includes(name);
}

/**
 * Reads `aria-pressed` as a three-state answer: pressed, not pressed, or the
 * control does not report it at all.
 * @param {Element} element
 * @returns {boolean | null}
 */
export function readPressedState(element) {
  const pressed = element.getAttribute('aria-pressed') ?? element.getAttribute('aria-checked');
  if (pressed === 'true') return true;
  if (pressed === 'false') return false;
  return null;
}

/**
 * Builds the DOM helpers the probes need from a real window.
 * @param {Window} view
 * @param {number} toolbarTopFraction
 */
export function createDomHelpers(view, toolbarTopFraction = DEFAULT_TOOLBAR_TOP_FRACTION) {
  return {
    /** @param {Element} element */
    isVisible(element) {
      const box = element.getBoundingClientRect();
      if (box.width <= 0 || box.height <= 0) return false;
      const style = view.getComputedStyle(element);
      return style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0';
    },

    /**
     * The toolbar sits across the top of the viewer. Limiting the search to that
     * strip keeps a favourite control inside some other dialog from being counted.
     * @param {Element} element
     */
    isInToolbar(element) {
      return element.getBoundingClientRect().top < view.innerHeight * toolbarTopFraction;
    },
  };
}
