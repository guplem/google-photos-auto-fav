/**
 * Reads and writes the settings shown on the options page.
 *
 * Settings live in `chrome.storage.sync` so they follow your Chrome profile.
 * The list of file names lives in `chrome.storage.local`, because it is large
 * and belongs to one computer.
 */

import { DEFAULT_SETTINGS, loadSettings, normalizeSettings, saveSettings } from '../src/settings/extensionSettings.js';
import { createFavoritesListStore } from '../src/favorites/favoritesListStore.js';

const listStore = createFavoritesListStore(chrome.storage.local);

/**
 * @param {string} id
 * @returns {HTMLInputElement}
 */
const input = (id) => /** @type {HTMLInputElement} */ (document.getElementById(id));

/**
 * @param {string} id
 * @returns {HTMLTextAreaElement}
 */
const textarea = (id) => /** @type {HTMLTextAreaElement} */ (document.getElementById(id));

/**
 * @param {string} value
 * @returns {string[]}
 */
const readLines = (value) =>
  value
    .split('\n')
    .map((line) => line.trim().toLowerCase())
    .filter((line) => line !== '');

/** @param {string} message */
function showStatus(message) {
  const status = /** @type {HTMLElement} */ (document.getElementById('status'));
  status.textContent = message;
  setTimeout(() => {
    if (status.textContent === message) status.textContent = '';
  }, 3000);
}

/** @param {import('../src/settings/extensionSettings.js').ExtensionSettings} settings */
function showSettings(settings) {
  input('dryRun').checked = settings.dryRun;
  input('pollMs').value = String(settings.pollMs);
  input('minDwellMs').value = String(settings.minDwellMs);
  input('confirmMs').value = String(settings.confirmMs);
  input('timeoutMs').value = String(settings.timeoutMs);
  input('clickConfirmMs').value = String(settings.clickConfirmMs);
  textarea('favoriteLabels').value = settings.favoriteLabels.join('\n');
  textarea('unfavoriteLabels').value = settings.unfavoriteLabels.join('\n');
  textarea('infoLabels').value = settings.infoLabels.join('\n');
}

/** @returns {import('../src/settings/extensionSettings.js').ExtensionSettings} */
function collectSettings() {
  return normalizeSettings({
    dryRun: input('dryRun').checked,
    pollMs: Number(input('pollMs').value),
    minDwellMs: Number(input('minDwellMs').value),
    confirmMs: Number(input('confirmMs').value),
    timeoutMs: Number(input('timeoutMs').value),
    clickConfirmMs: Number(input('clickConfirmMs').value),
    favoriteLabels: readLines(textarea('favoriteLabels').value),
    unfavoriteLabels: readLines(textarea('unfavoriteLabels').value),
    infoLabels: readLines(textarea('infoLabels').value),
  });
}

/** @returns {Promise<void>} */
async function showListSummary() {
  const record = await listStore.read();
  const summary = /** @type {HTMLElement} */ (document.getElementById('listSummary'));
  summary.textContent =
    record.names.length === 0
      ? 'No list is loaded. Choose one in the panel on a Google Photos album page.'
      : `${record.names.length} names loaded from ${record.sourceName || 'a file'}.`;
}

document.getElementById('save')?.addEventListener('click', async () => {
  const saved = await saveSettings(chrome.storage.sync, collectSettings());
  showSettings(saved);
  showStatus('Saved. Reload any open Google Photos tab.');
});

document.getElementById('reset')?.addEventListener('click', async () => {
  const saved = await saveSettings(chrome.storage.sync, { ...DEFAULT_SETTINGS });
  showSettings(saved);
  showStatus('Back to the defaults.');
});

document.getElementById('clearList')?.addEventListener('click', async () => {
  await listStore.clear();
  await showListSummary();
  showStatus('The list is gone.');
});

showSettings(await loadSettings(chrome.storage.sync));
await showListSummary();
