import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_SETTINGS, normalizeSettings } from '../src/settings/extensionSettings.js';

test('an empty storage gives the defaults', () => {
  assert.deepEqual(normalizeSettings(undefined), { ...DEFAULT_SETTINGS });
  assert.deepEqual(normalizeSettings(null), { ...DEFAULT_SETTINGS });
});

test('drops keys the current version does not know', () => {
  const settings = /** @type {Record<string, unknown>} */ (normalizeSettings({ somethingOld: true }));
  assert.equal('somethingOld' in settings, false);
});

test('replaces a value of the wrong type with the default', () => {
  assert.equal(normalizeSettings({ pollMs: 'fast' }).pollMs, DEFAULT_SETTINGS.pollMs);
  assert.equal(normalizeSettings({ dryRun: 'yes' }).dryRun, DEFAULT_SETTINGS.dryRun);
});

test('clamps a number to its allowed range', () => {
  assert.equal(normalizeSettings({ pollMs: 1 }).pollMs, 20);
  assert.equal(normalizeSettings({ pollMs: 99999 }).pollMs, 1000);
});

test('lowercases the button names, because the page is matched in lower case', () => {
  assert.deepEqual(normalizeSettings({ favoriteLabels: ['  Add To Favorites '] }).favoriteLabels, ['add to favorites']);
});

test('an empty list of button names falls back to the defaults, so no run is left blind', () => {
  assert.deepEqual(normalizeSettings({ favoriteLabels: [] }).favoriteLabels, [...DEFAULT_SETTINGS.favoriteLabels]);
});
