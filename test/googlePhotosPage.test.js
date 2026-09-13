import test from 'node:test';
import assert from 'node:assert/strict';

import { isAlbumContext, readGooglePhotosLocation } from '../src/googlePhotosPage.js';

test('reads an album grid', () => {
  const location = readGooglePhotosLocation('https://photos.google.com/album/ALBUMKEY');
  assert.deepEqual(location, { kind: 'album', albumKey: 'ALBUMKEY', photoKey: null });
});

test('reads a photo inside an album', () => {
  const location = readGooglePhotosLocation('https://photos.google.com/album/ALBUMKEY/photo/PHOTOKEY');
  assert.deepEqual(location, { kind: 'photo-in-album', albumKey: 'ALBUMKEY', photoKey: 'PHOTOKEY' });
});

test('reads a shared album, which uses /share/ instead of /album/', () => {
  const location = readGooglePhotosLocation('https://photos.google.com/share/SHAREKEY/photo/PHOTOKEY?key=abc');
  assert.deepEqual(location, { kind: 'photo-in-album', albumKey: 'SHAREKEY', photoKey: 'PHOTOKEY' });
});

test('reads an account with a profile prefix such as /u/1/', () => {
  const location = readGooglePhotosLocation('https://photos.google.com/u/1/album/ALBUMKEY');
  assert.equal(location.albumKey, 'ALBUMKEY');
});

test('a photo outside an album is not an album context, so the panel stays hidden', () => {
  const location = readGooglePhotosLocation('https://photos.google.com/photo/PHOTOKEY');
  assert.equal(location.kind, 'photo');
  assert.equal(isAlbumContext(location), false);
});

test('the Google Photos home page carries no keys', () => {
  assert.deepEqual(readGooglePhotosLocation('https://photos.google.com/'), { kind: 'other', albumKey: null, photoKey: null });
});
