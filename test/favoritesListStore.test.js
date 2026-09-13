import test from 'node:test';
import assert from 'node:assert/strict';

import { createEmptyListRecord, normalizeListRecord } from '../src/favorites/favoritesListStore.js';

test('an empty storage gives an empty record', () => {
  assert.deepEqual(normalizeListRecord(undefined), createEmptyListRecord());
  assert.deepEqual(normalizeListRecord('not a record'), createEmptyListRecord());
});

test('keeps the names and the file they came from', () => {
  const record = normalizeListRecord({ names: ['img_1.heic'], sourceName: 'favorites.txt', loadedAt: 5 });
  assert.deepEqual(record, { names: ['img_1.heic'], sourceName: 'favorites.txt', loadedAt: 5 });
});

test('drops entries that are not names, because storage can hold data from an older version', () => {
  const record = normalizeListRecord({ names: ['img_1.heic', 42, '', null], sourceName: 7, loadedAt: 'yesterday' });
  assert.deepEqual(record, { names: ['img_1.heic'], sourceName: '', loadedAt: 0 });
});
