import test from 'node:test';
import assert from 'node:assert/strict';

import { classifyFileName, collectVisibleFileNames, isMediaFileName } from '../src/favorites/photoFileNameReader.js';

test('accepts the file names Google Photos shows in the info panel', () => {
  assert.equal(isMediaFileName('IMG_4903.HEIC'), true);
  assert.equal(isMediaFileName('PXL_20260816_102200375.MP.jpg'), true);
  assert.equal(isMediaFileName('VID20260816103501.mp4'), true);
  assert.equal(isMediaFileName('  01001585.jpg  '), true);
});

test('rejects text that only ends like a file name', () => {
  // The info panel also holds sentences and dates. Only a whole string that is
  // one file name counts, or the reader would act on a caption.
  assert.equal(isMediaFileName('Taken with a camera.mov file'), false);
  assert.equal(isMediaFileName('16 Aug 2026'), false);
  assert.equal(isMediaFileName('photos/IMG_1.HEIC'), false);
  assert.equal(isMediaFileName('IMG_1.txt'), false);
});

test('one name on screen is the answer', () => {
  assert.equal(classifyFileName(['IMG_1.HEIC']), 'IMG_1.HEIC');
});

test('no name and two different names both mean "cannot tell yet"', () => {
  // Two names appear while the info panel is between photos. Picking either one
  // could mark the wrong photo, so the run waits instead.
  assert.equal(classifyFileName([]), null);
  assert.equal(classifyFileName(['IMG_1.HEIC', 'IMG_2.HEIC']), null);
});

test('reads leaf elements only, so a parent does not repeat its child', () => {
  const child = fakeElement({ text: 'IMG_1.HEIC' });
  const parent = fakeElement({ text: 'IMG_1.HEIC', childElementCount: 1 });
  const hidden = fakeElement({ text: 'IMG_2.HEIC' });

  const names = collectVisibleFileNames({
    root: /** @type {any} */ ({ querySelectorAll: () => [parent, child, hidden] }),
    isVisible: (element) => element !== hidden,
  });

  assert.deepEqual(names, ['IMG_1.HEIC']);
});

test('reads the accessible label too, and reports each name once', () => {
  const labelled = fakeElement({ text: '', ariaLabel: 'IMG_1.HEIC' });
  const text = fakeElement({ text: 'IMG_1.HEIC' });

  const names = collectVisibleFileNames({
    root: /** @type {any} */ ({ querySelectorAll: () => [labelled, text] }),
    isVisible: () => true,
  });

  assert.deepEqual(names, ['IMG_1.HEIC']);
});

/**
 * @param {{ text?: string, ariaLabel?: string, childElementCount?: number }} parts
 * @returns {Element}
 */
function fakeElement({ text = '', ariaLabel, childElementCount = 0 }) {
  return /** @type {any} */ ({
    childElementCount,
    textContent: text,
    getAttribute: (/** @type {string} */ name) => (name === 'aria-label' ? (ariaLabel ?? null) : null),
  });
}
