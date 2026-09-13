import test from 'node:test';
import assert from 'node:assert/strict';

import { classifyFavoriteState, collectToolbarControls, findFavoriteControl } from '../src/favorites/favoriteProbe.js';

const FAVORITE_LABELS = ['favorite', 'add to favorites'];
const UNFAVORITE_LABELS = ['remove from favorites'];

/**
 * @param {string} name
 * @param {boolean | null} [pressed]
 * @returns {import('../src/favorites/favoriteProbe.js').ToolbarControl}
 */
function control(name, pressed = null) {
  return { name, pressed, element: /** @type {any} */ ({}) };
}

test('a control named "add to favorites" means the photo is not a favourite', () => {
  assert.equal(
    classifyFavoriteState([control('share'), control('add to favorites')], FAVORITE_LABELS, UNFAVORITE_LABELS),
    'not-favorited',
  );
});

test('a control named "remove from favorites" means the photo already is one', () => {
  assert.equal(classifyFavoriteState([control('remove from favorites')], FAVORITE_LABELS, UNFAVORITE_LABELS), 'favorited');
});

test('aria-pressed beats the name, because the name is translated and can be renamed', () => {
  // Google Photos keeps the name "favorite" and flips aria-pressed instead.
  assert.equal(classifyFavoriteState([control('favorite', true)], FAVORITE_LABELS, UNFAVORITE_LABELS), 'favorited');
  assert.equal(classifyFavoriteState([control('favorite', false)], FAVORITE_LABELS, UNFAVORITE_LABELS), 'not-favorited');
});

test('a toolbar with no favourite control means "cannot tell yet", never "not a favourite"', () => {
  // This is the important one: the toolbar draws a moment after the photo, and
  // guessing "not a favourite" here would click a control that is not there yet,
  // or act on the photo the viewer just left.
  assert.equal(classifyFavoriteState([], FAVORITE_LABELS, UNFAVORITE_LABELS), null);
  assert.equal(classifyFavoriteState([control('share'), control('info')], FAVORITE_LABELS, UNFAVORITE_LABELS), null);
});

test('matches the name exactly, so "remove from favorites" never counts as "favorite"', () => {
  const found = findFavoriteControl([control('remove from favorites')], FAVORITE_LABELS, UNFAVORITE_LABELS);
  assert.equal(found?.name, 'remove from favorites');
});

test('collects only the visible controls that sit in the toolbar', () => {
  const favorite = fakeElement({ ariaLabel: 'Favorite', pressed: 'false' });
  const hidden = fakeElement({ ariaLabel: 'Hidden' });
  const belowToolbar = fakeElement({ ariaLabel: 'Delete' });

  const controls = collectToolbarControls({
    root: /** @type {any} */ ({ querySelectorAll: () => [favorite, hidden, belowToolbar] }),
    favoriteLabels: FAVORITE_LABELS,
    unfavoriteLabels: UNFAVORITE_LABELS,
    isVisible: (element) => element !== hidden,
    isInToolbar: (element) => element !== belowToolbar,
  });

  assert.deepEqual(
    controls.map(({ name, pressed }) => ({ name, pressed })),
    [{ name: 'favorite', pressed: false }],
  );
});

/**
 * A stand-in for a DOM element, with only the members the probe reads.
 * @param {{ ariaLabel?: string, pressed?: string }} parts
 * @returns {Element}
 */
function fakeElement({ ariaLabel, pressed }) {
  return /** @type {any} */ ({
    getAttribute(/** @type {string} */ name) {
      if (name === 'aria-label') return ariaLabel ?? null;
      if (name === 'aria-pressed') return pressed ?? null;
      return null;
    },
    textContent: '',
  });
}
