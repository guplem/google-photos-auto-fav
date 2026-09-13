import test from 'node:test';
import assert from 'node:assert/strict';

import { createFavoritesLookup, normalizeFileName, parseFavoritesFile } from '../src/favorites/favoritesList.js';

test('a file name compares without its case', () => {
  assert.equal(normalizeFileName('IMG_4903.HEIC'), 'img_4903.heic');
});

test('a file name compares without its folder, so an exported path still matches', () => {
  assert.equal(normalizeFileName('C:\\Photos\\IMG_1.HEIC'), 'img_1.heic');
  assert.equal(normalizeFileName('trip/2026/IMG_1.HEIC'), 'img_1.heic');
});

test('a file name compares without surrounding spaces or quotes', () => {
  assert.equal(normalizeFileName('  "IMG_1.HEIC"  '), 'img_1.heic');
});

test('reads one name per line and keeps the order of the file', () => {
  const names = parseFavoritesFile('PXL_20260815_171046148.mp4\nIMG_4903.HEIC\n');
  assert.deepEqual(names, ['pxl_20260815_171046148.mp4', 'img_4903.heic']);
});

test('skips blank lines and comments', () => {
  assert.deepEqual(parseFavoritesFile('\n# a note\n\nIMG_1.HEIC\n'), ['img_1.heic']);
});

test('reads a file saved with Windows line endings', () => {
  assert.deepEqual(parseFavoritesFile('IMG_1.HEIC\r\nIMG_2.HEIC\r\n'), ['img_1.heic', 'img_2.heic']);
});

test('keeps one entry when the same name appears twice', () => {
  assert.deepEqual(parseFavoritesFile('IMG_1.HEIC\nimg_1.heic\n'), ['img_1.heic']);
});

test('the lookup answers whatever case the page shows', () => {
  const lookup = createFavoritesLookup(parseFavoritesFile('IMG_4903.HEIC\n'));
  assert.equal(lookup.size, 1);
  assert.equal(lookup.has('img_4903.heic'), true);
  assert.equal(lookup.has('IMG_4903.HEIC'), true);
  assert.equal(lookup.has('IMG_4904.HEIC'), false);
});

test('a motion photo keeps both of its dots', () => {
  const lookup = createFavoritesLookup(parseFavoritesFile('PXL_20260816_102200375.MP.jpg\n'));
  assert.equal(lookup.has('PXL_20260816_102200375.MP.jpg'), true);
  assert.equal(lookup.has('PXL_20260816_102200375.jpg'), false);
});
