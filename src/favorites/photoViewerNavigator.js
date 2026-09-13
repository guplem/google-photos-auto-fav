/**
 * Drives the Google Photos viewer: opens the first photo of an album, opens the
 * info panel, and moves from one photo to the next.
 *
 * Safety rule for this file: never click a control we cannot name. A control
 * must match a known word before we click it. When nothing matches, the run
 * stops and says so, which is the safe outcome.
 */

import { CONTROL_SELECTOR, normalizeLabel } from '../domControls.js';

const DIALOG_SELECTOR = '[role="dialog"], [role="alertdialog"], dialog[open]';

/**
 * A "next" control sits past this share of the window width.
 *
 * Half, not four fifths. This run keeps the info panel open, and that panel
 * takes the right third of the window, so the next-photo chevron sits well left
 * of the true right edge. A stricter fraction rejected it and every run stopped
 * on its first photo with `stuck`.
 *
 * The name match is the real guard here. This test only breaks a tie, so it
 * picks the right-most control that already matched a word for "next".
 */
const RIGHT_EDGE_FRACTION = 0.5;

/** Words that mean "next photo", in the languages Google Photos is likely to use here. */
const NEXT_CONTROL_WORDS = [
  'next',
  'siguiente',
  'següent',
  'seguent',
  'seguinte',
  'suivant',
  'weiter',
  'nächste',
  'nachste',
  'avanti',
  'prossima',
];

/** Key codes for the few keys we send. Some handlers still read the old numeric fields. */
const KEY_CODES = { ArrowRight: 39, Escape: 27, i: 73 };

/**
 * @param {Window} view
 * @param {Element} element
 * @returns {boolean}
 */
function isVisible(view, element) {
  const box = element.getBoundingClientRect();
  if (box.width <= 0 || box.height <= 0) return false;
  const style = view.getComputedStyle(element);
  return style.visibility !== 'hidden' && style.display !== 'none';
}

/**
 * @param {Element} element
 * @returns {string}
 */
function readControlName(element) {
  return normalizeLabel(element.getAttribute('aria-label') ?? element.getAttribute('title') ?? element.textContent);
}

/**
 * Moves the pointer over the middle of the viewer.
 *
 * Google Photos renders the toolbar and the next-photo chevron only while the
 * pointer is over the photo. A run never moves the real pointer, so without this
 * nudge the probes read an empty toolbar and report a readable photo unreadable.
 * @param {Window} view
 * @param {number} step Increases on every call, so the pointer never lands twice on one spot.
 */
function nudgePointerOverViewer(view, step) {
  // The coordinates must change between calls. A page that tracks the pointer
  // ignores a mousemove that lands on the same spot, so a fixed point would stop
  // waking the chrome after the first call.
  const event = new MouseEvent('mousemove', {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: Math.round(view.innerWidth * 0.5) + (step % 2 === 0 ? 8 : -8),
    clientY: Math.round(view.innerHeight * 0.5) + (step % 4 < 2 ? 8 : -8),
  });
  view.document.dispatchEvent(event);
  view.document.body?.dispatchEvent(event);
}

/**
 * Takes the focus off any button before a key is sent, and returns the element
 * the key should go to.
 *
 * This matters more than it looks. The user starts a run by clicking our Start
 * button, so that button keeps the focus. Google Photos ignores an arrow key
 * whose target is a button, because a button has its own keyboard behaviour. The
 * run then could not advance at all and stopped on its first photo.
 * @param {Window} view
 * @returns {EventTarget}
 */
function takeFocusOffButtons(view) {
  const active = view.document.activeElement;
  if (active instanceof HTMLElement && (active.tagName === 'BUTTON' || active.getAttribute('role') === 'button')) {
    active.blur();
    return view.document.body ?? view.document;
  }
  return active ?? view.document.body ?? view.document;
}

/**
 * @param {Window} view
 * @param {string} type
 * @param {keyof typeof KEY_CODES} key
 */
function dispatchKey(view, type, key) {
  const event = new KeyboardEvent(type, {
    key,
    code: key === 'i' ? 'KeyI' : key,
    bubbles: true,
    cancelable: true,
    composed: true,
  });
  const numeric = KEY_CODES[key];
  Object.defineProperty(event, 'keyCode', { get: () => numeric });
  Object.defineProperty(event, 'which', { get: () => numeric });
  takeFocusOffButtons(view).dispatchEvent(event);
}

/**
 * Finds the element that actually scrolls the album grid. Google Photos scrolls
 * an inner container, so `window.scrollTo` alone does nothing.
 * @param {Window} view
 * @param {Element} start
 * @returns {Element | null}
 */
function findScrollingAncestor(view, start) {
  for (let element = start.parentElement; element !== null; element = element.parentElement) {
    if (element.scrollHeight <= element.clientHeight + 1) continue;
    const overflowY = view.getComputedStyle(element).overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll') return element;
  }
  return null;
}

/**
 * @param {Window} view
 * @param {readonly string[]} infoLabels Names of the control that opens the info panel.
 */
export function createPhotoViewerNavigator(view, infoLabels) {
  let wakeStep = 0;

  /**
   * @param {number} milliseconds
   * @returns {Promise<void>}
   */
  const wait = (milliseconds) => new Promise((resolve) => view.setTimeout(resolve, milliseconds));

  /** @returns {HTMLElement[]} */
  function findVisibleControls() {
    return Array.from(view.document.querySelectorAll(CONTROL_SELECTOR))
      .filter((control) => isVisible(view, control))
      .map((control) => /** @type {HTMLElement} */ (control));
  }

  /**
   * A control named like a "next" control.
   * @param {boolean} requireRightEdge Also demand that it sits on the right of the window.
   * @returns {HTMLElement | null}
   */
  function findNextControl(requireRightEdge) {
    /** @type {HTMLElement | null} */
    let rightMost = null;
    let rightMostCentre = Number.NEGATIVE_INFINITY;

    for (const control of findVisibleControls()) {
      const name = readControlName(control);
      if (name === '' || !NEXT_CONTROL_WORDS.some((word) => name.includes(word))) continue;
      if (!requireRightEdge) return control;

      const box = control.getBoundingClientRect();
      const centre = box.left + box.width / 2;
      if (centre < view.innerWidth * RIGHT_EDGE_FRACTION) continue;
      if (centre <= rightMostCentre) continue;

      rightMost = control;
      rightMostCentre = centre;
    }
    return rightMost;
  }

  return {
    /** Makes Google Photos show its viewer chrome again. */
    keepChromeAwake() {
      wakeStep += 1;
      nudgePointerOverViewer(view, wakeStep);
    },

    /**
     * Reports whether the viewer still offers a next photo.
     *
     * A finished album and a stall look the same otherwise: Google Photos keeps
     * the viewer open on the last photo, so the address bar never changes and
     * never clears. Only `disabled` is positive evidence of the end. `missing`
     * stays ambiguous on purpose, because a control can also be absent while the
     * page is still drawing.
     *
     * @returns {'enabled' | 'disabled' | 'missing'}
     */
    readNextControlState() {
      // The right-edge rule guards a click, not a read, so it does not apply here.
      const control = findNextControl(false);
      if (control === null) return 'missing';
      const disabled =
        control.getAttribute('aria-disabled') === 'true' ||
        control.hasAttribute('disabled') ||
        control.getAttribute('aria-hidden') === 'true';
      return disabled ? 'disabled' : 'enabled';
    },

    /** @returns {boolean} True while a modal dialog covers the viewer. */
    isDialogOpen() {
      return Array.from(view.document.querySelectorAll(DIALOG_SELECTOR)).some((dialog) => isVisible(view, dialog));
    },

    /** Closes whatever dialog is open, so the run never types into one. */
    closeDialog() {
      dispatchKey(view, 'keydown', 'Escape');
      dispatchKey(view, 'keyup', 'Escape');
    },

    /**
     * Asks Google Photos to show the info panel, which is the only place the
     * file name appears.
     *
     * Even attempts press the `i` key, the documented shortcut. Odd attempts
     * click the named control, for the case where a focused element swallows the
     * key.
     *
     * The two never run together. The panel is a **toggle**, and an earlier
     * version sent the key and then clicked the button in the same call: the key
     * opened the panel and the click closed it again, every time.
     *
     * The panel being a toggle is also why the caller must ask only while the
     * file name is missing, and must space the requests.
     * @param {number} attempt
     */
    requestInfoPanel(attempt) {
      this.keepChromeAwake();

      if (attempt % 2 === 0) {
        dispatchKey(view, 'keydown', 'i');
        dispatchKey(view, 'keyup', 'i');
        return;
      }

      for (const control of findVisibleControls()) {
        if (infoLabels.includes(readControlName(control))) {
          control.click();
          return;
        }
      }
    },

    /**
     * Opens the first photo of the album.
     *
     * The grid is virtualised, so the first `<a>` in the document is whichever
     * one Google Photos happened to reuse last, not the first photo. We scroll
     * the grid back to the top and then take the thumbnail that is highest on
     * screen, and leftmost among those.
     *
     * @param {number} renderWaitMs How long to let the grid redraw after scrolling.
     * @returns {Promise<boolean>} False when the page shows no thumbnails.
     */
    async openFirstPhoto(renderWaitMs) {
      const anyLink = view.document.querySelector('a[href*="/photo/"]');
      if (anyLink === null) return false;

      findScrollingAncestor(view, anyLink)?.scrollTo({ top: 0, behavior: 'instant' });
      view.scrollTo({ top: 0, behavior: 'instant' });
      await wait(renderWaitMs);

      const links = Array.from(view.document.querySelectorAll('a[href*="/photo/"]'))
        .filter((link) => isVisible(view, link))
        .map((link) => ({ link, box: link.getBoundingClientRect() }))
        // Reading order: top row first, then left to right. Rows are never
        // pixel-aligned, so compare the tops with a small tolerance.
        .sort((a, b) => (Math.abs(a.box.top - b.box.top) > 4 ? a.box.top - b.box.top : a.box.left - b.box.left));

      const first = links[0];
      if (first === undefined) return false;

      /** @type {HTMLElement} */ (first.link).click();
      return true;
    },

    /**
     * Asks the page to show the next photo.
     *
     * The right arrow key is the main way, and every attempt sends it. It is the
     * same key a person presses, it needs no control on screen, and it works
     * while the info panel covers the right of the window.
     *
     * Odd attempts also click the named next control afterwards. That is the
     * backup for the case where Google Photos refuses a synthetic key, and it
     * costs nothing when the key already worked: the caller stops as soon as the
     * photo id changes.
     * @param {number} attempt
     * @returns {Promise<void>}
     */
    async requestNextPhoto(attempt) {
      // A dialog swallows the arrow key and hides the toolbar, so clear it first.
      if (this.isDialogOpen()) {
        this.closeDialog();
        await wait(120);
      }

      this.keepChromeAwake();
      dispatchKey(view, 'keydown', 'ArrowRight');
      dispatchKey(view, 'keyup', 'ArrowRight');
      if (attempt % 2 === 0) return;

      await wait(150);
      findNextControl(true)?.click();
    },

    /** Leaves the viewer and goes back to the grid. */
    closeViewer() {
      dispatchKey(view, 'keydown', 'Escape');
      dispatchKey(view, 'keyup', 'Escape');
    },
  };
}

/** @typedef {ReturnType<typeof createPhotoViewerNavigator>} PhotoViewerNavigator */
