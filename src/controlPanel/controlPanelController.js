/**
 * The small panel that appears at the bottom left of an album page.
 *
 * It takes the list file, starts and stops a run, shows the progress, and copies
 * the report. The report matters: it names every photo the run could not read
 * and every name in your list that the album never showed, which is the only way
 * to know a run was complete.
 */

const ROOT_CLASS = 'gpaf-root';

/**
 * @typedef {object} ControlPanelDeps
 * @property {Document} document
 * @property {(file: File) => void} onListFileChosen
 * @property {(dryRun: boolean) => void} onDryRunChanged
 * @property {() => void} onRunStart
 * @property {() => void} onRunStop
 * @property {() => void} onOpenOptions
 * @property {() => Promise<string>} onBuildReport
 */

/**
 * @param {Document} ownerDocument
 * @param {string} tagName
 * @param {string} className
 * @param {string} [text]
 */
function createElement(ownerDocument, tagName, className, text) {
  const element = ownerDocument.createElement(tagName);
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

/**
 * @param {ControlPanelDeps} deps
 */
export function createControlPanel({
  document: ownerDocument,
  onListFileChosen,
  onDryRunChanged,
  onRunStart,
  onRunStop,
  onOpenOptions,
  onBuildReport,
}) {
  const root = createElement(ownerDocument, 'div', ROOT_CLASS);
  root.setAttribute('data-gpaf-collapsed', 'true');

  const toggle = createElement(ownerDocument, 'button', 'gpaf-toggle', 'auto Fav');
  toggle.setAttribute('type', 'button');

  const body = createElement(ownerDocument, 'div', 'gpaf-body');
  const listSummary = createElement(ownerDocument, 'p', 'gpaf-summary', 'No list loaded yet.');
  const message = createElement(ownerDocument, 'p', 'gpaf-message');

  const fileLabel = createElement(ownerDocument, 'label', 'gpaf-file');
  const fileInput = /** @type {HTMLInputElement} */ (ownerDocument.createElement('input'));
  fileInput.type = 'file';
  fileInput.accept = '.txt,.csv,text/plain';
  fileLabel.append(createElement(ownerDocument, 'span', 'gpaf-file-text', 'Choose list file'), fileInput);

  const dryRunLabel = createElement(ownerDocument, 'label', 'gpaf-check');
  const dryRunInput = /** @type {HTMLInputElement} */ (ownerDocument.createElement('input'));
  dryRunInput.type = 'checkbox';
  dryRunLabel.append(dryRunInput, createElement(ownerDocument, 'span', 'gpaf-check-text', 'Dry run (click nothing)'));

  const runButton = createElement(ownerDocument, 'button', 'gpaf-button gpaf-button--primary', 'Start');
  runButton.setAttribute('type', 'button');

  const reportButton = createElement(ownerDocument, 'button', 'gpaf-button', 'Copy report');
  reportButton.setAttribute('type', 'button');

  const optionsButton = createElement(ownerDocument, 'button', 'gpaf-button', 'Options');
  optionsButton.setAttribute('type', 'button');

  const actions = createElement(ownerDocument, 'div', 'gpaf-actions');
  actions.append(runButton, reportButton, optionsButton);
  body.append(listSummary, fileLabel, dryRunLabel, message, actions);
  root.append(toggle, body);

  /** @type {'idle' | 'running'} */
  let runState = 'idle';

  toggle.addEventListener('click', () => {
    const collapsed = root.getAttribute('data-gpaf-collapsed') === 'true';
    root.setAttribute('data-gpaf-collapsed', collapsed ? 'false' : 'true');
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file !== undefined) onListFileChosen(file);
    // Clearing the value lets the user pick the same file again after an edit.
    fileInput.value = '';
  });

  dryRunInput.addEventListener('change', () => onDryRunChanged(dryRunInput.checked));

  runButton.addEventListener('click', () => {
    if (runState === 'running') onRunStop();
    else onRunStart();
  });

  optionsButton.addEventListener('click', onOpenOptions);

  reportButton.addEventListener('click', async () => {
    const report = await onBuildReport();
    try {
      await ownerDocument.defaultView?.navigator.clipboard.writeText(report);
      panel.setMessage('Report copied to the clipboard.');
    } catch {
      // Clipboard access can be refused when the tab is not focused.
      console.info('[auto Fav] report:\n' + report);
      panel.setMessage('Clipboard refused. The report is in the browser console.');
    }
  });

  const panel = {
    mount() {
      if (!root.isConnected) ownerDocument.body.append(root);
    },

    unmount() {
      root.remove();
    },

    /** @param {boolean} collapsed */
    setCollapsed(collapsed) {
      root.setAttribute('data-gpaf-collapsed', collapsed ? 'true' : 'false');
    },

    /** @param {import('../favorites/favoritesListStore.js').FavoritesListRecord} record */
    setListSummary({ names, sourceName }) {
      listSummary.textContent =
        names.length === 0 ? 'No list loaded yet.' : `${names.length} names loaded from ${sourceName || 'a file'}.`;
    },

    /** @param {boolean} dryRun */
    setDryRun(dryRun) {
      dryRunInput.checked = dryRun;
    },

    /** @param {'idle' | 'running'} next */
    setRunState(next) {
      runState = next;
      runButton.textContent = next === 'running' ? 'Stop' : 'Start';
      root.setAttribute('data-gpaf-running', next === 'running' ? 'true' : 'false');
      fileInput.disabled = next === 'running';
      dryRunInput.disabled = next === 'running';
      if (next === 'running') panel.setCollapsed(false);
    },

    /** @param {string} text */
    setMessage(text) {
      message.textContent = text;
    },
  };

  return panel;
}

/** @typedef {ReturnType<typeof createControlPanel>} ControlPanel */
