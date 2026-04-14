import {
  PAGEX_MESSAGE_TYPES,
  PAGEX_STATE_KEY,
} from './src/shared/constants.js';
import {
  formatResultForCopy,
  sortTabsForPicker,
} from './src/shared/result-utils.js';
import {
  canCopyForSelectedTab,
  getResultMismatchMessage,
  isParseButtonDisabled,
} from './src/shared/popup-state.js';
import { buildOriginPermissionPattern } from './src/shared/origin-permissions.js';

const viewState = {
  tabs: [],
  parseState: null,
  isStartingParse: false,
  copyResetTimer: 0,
};

const elements = {
  app: document.getElementById('app'),
  tabSelect: document.getElementById('tabSelect'),
  parseButton: document.getElementById('parseBtn'),
  copyButton: document.getElementById('copyBtn'),
  statusText: document.getElementById('statusText'),
  detailText: document.getElementById('detailText'),
  framesValue: document.getElementById('framesValue'),
  elementsValue: document.getElementById('elementsValue'),
  clicksValue: document.getElementById('clicksValue'),
  sizeValue: document.getElementById('sizeValue'),
  summaryNote: document.getElementById('summaryNote'),
  copyFeedback: document.getElementById('copyFeedback'),
};

void init();

async function init() {
  bindEvents();
  await loadTabs();
  await loadStoredState();
  syncSelectedTab();
  render();
}

function bindEvents() {
  elements.parseButton.addEventListener('click', () => {
    void handleParseClick();
  });

  elements.copyButton.addEventListener('click', () => {
    void handleCopyClick();
  });

  elements.tabSelect.addEventListener('change', () => {
    resetCopyFeedback();
    render();
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'session') {
      return;
    }

    if (!changes[PAGEX_STATE_KEY]) {
      return;
    }

    viewState.parseState = changes[PAGEX_STATE_KEY].newValue || null;
    syncSelectedTab();
    render();
  });
}

async function loadTabs() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const availableTabs = [];
  let activeTabId = 0;

  for (const tab of tabs) {
    if (!Number.isInteger(tab.id)) {
      continue;
    }

    availableTabs.push(tab);

    if (tab.active) {
      activeTabId = tab.id;
    }
  }

  viewState.tabs = sortTabsForPicker(availableTabs, activeTabId);
  renderTabOptions();
}

async function loadStoredState() {
  const stored = await chrome.storage.session.get(PAGEX_STATE_KEY);

  viewState.parseState = stored[PAGEX_STATE_KEY] || null;
}

function render() {
  renderStatus();
  renderSummary();
  renderButtons();
}

function renderTabOptions() {
  elements.tabSelect.textContent = '';

  if (viewState.tabs.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No tabs available';
    elements.tabSelect.appendChild(option);
    elements.tabSelect.disabled = true;
    return;
  }

  elements.tabSelect.disabled = false;

  for (const tab of viewState.tabs) {
    const option = document.createElement('option');
    option.value = String(tab.id);
    option.textContent = tab.label;
    elements.tabSelect.appendChild(option);
  }
}

function syncSelectedTab() {
  if (viewState.tabs.length === 0) {
    return;
  }

  const preferredTabId = getPreferredTabId();

  if (!Number.isInteger(preferredTabId)) {
    elements.tabSelect.value = String(viewState.tabs[0].id);
    return;
  }

  for (const tab of viewState.tabs) {
    if (tab.id === preferredTabId) {
      elements.tabSelect.value = String(preferredTabId);
      return;
    }
  }

  elements.tabSelect.value = String(viewState.tabs[0].id);
}

function getPreferredTabId() {
  if (
    viewState.parseState &&
    Number.isInteger(viewState.parseState.selectedTabId)
  ) {
    return viewState.parseState.selectedTabId;
  }

  const selectedValue = Number(elements.tabSelect.value);

  if (Number.isInteger(selectedValue) && selectedValue > 0) {
    return selectedValue;
  }

  if (viewState.tabs.length > 0) {
    return viewState.tabs[0].id;
  }

  return null;
}

function getCurrentSelectedTabId() {
  const selectedValue = Number(elements.tabSelect.value);

  if (Number.isInteger(selectedValue) && selectedValue > 0) {
    return selectedValue;
  }

  return null;
}

function renderStatus() {
  let status = 'idle';
  let statusText = 'Ready';
  let detailText =
    'Select a tab, reveal what matters, and copy a quieter JSON record.';

  if (viewState.parseState && viewState.parseState.status) {
    status = viewState.parseState.status;
  }

  if (status === 'running') {
    statusText = viewState.parseState.stageLabel || 'Reading';
    detailText =
      'Working quietly through structure, hidden sections, and frame notes.';
  }

  if (status === 'completed') {
    statusText = 'Ready to copy';
    detailText =
      'The page reading is prepared. Copy the JSON when you like.';

    const mismatchMessage = getResultMismatchMessage(
      viewState.parseState,
      getCurrentSelectedTabId(),
    );

    if (mismatchMessage) {
      detailText = mismatchMessage;
    }
  }

  if (status === 'error') {
    statusText = 'Needs attention';
    detailText = viewState.parseState.errorMessage || 'This page could not be parsed.';
  }

  elements.app.dataset.status = status;
  elements.statusText.textContent = statusText;
  elements.detailText.textContent = detailText;
}

function renderSummary() {
  resetMetricValues();

  if (!viewState.parseState) {
    elements.summaryNote.textContent = 'No captured page yet.';
    return;
  }

  if (viewState.parseState.status === 'running') {
    elements.summaryNote.textContent =
      'Working quietly in the background.';
    return;
  }

  if (viewState.parseState.status === 'error') {
    elements.summaryNote.textContent =
      viewState.parseState.errorMessage || 'This page could not be parsed.';
    return;
  }

  const summary = viewState.parseState.summary;
  const mismatchMessage = getResultMismatchMessage(
    viewState.parseState,
    getCurrentSelectedTabId(),
  );

  if (!summary) {
    elements.summaryNote.textContent = 'No summary is available yet.';
    return;
  }

  if (mismatchMessage) {
    elements.summaryNote.textContent = mismatchMessage;
    return;
  }

  elements.framesValue.textContent = String(summary.frameCount);
  elements.elementsValue.textContent = String(summary.elementCount);
  elements.clicksValue.textContent = String(summary.totalClicks);
  elements.sizeValue.textContent = summary.resultSizeLabel;
  elements.summaryNote.textContent = buildSummaryNote(summary);
}

function resetMetricValues() {
  elements.framesValue.textContent = '-';
  elements.elementsValue.textContent = '-';
  elements.clicksValue.textContent = '-';
  elements.sizeValue.textContent = '-';
}

function buildSummaryNote(summary) {
  const noteParts = [];

  noteParts.push(`${summary.accessibleFrameCount} accessible frame(s)`);
  noteParts.push(`${summary.skippedFrameCount} skipped frame(s)`);
  noteParts.push(`${summary.warningCount} warning(s)`);

  return noteParts.join(' • ');
}

function renderButtons() {
  const canCopy = canCopyForSelectedTab(
    viewState.parseState,
    getCurrentSelectedTabId(),
  );
  const parseDisabled = isParseButtonDisabled({
    hasTabs: viewState.tabs.length > 0,
    isStartingParse: viewState.isStartingParse,
    parseState: viewState.parseState,
  });
  let running = false;

  if (viewState.isStartingParse) {
    running = true;
  }

  if (viewState.parseState && viewState.parseState.status === 'running') {
    running = true;
  }

  elements.parseButton.disabled = parseDisabled;
  elements.copyButton.disabled = !canCopy;

  if (running) {
    elements.parseButton.textContent = 'Reading...';
    return;
  }

  elements.parseButton.textContent = 'Parse';
}

async function handleParseClick() {
  if (
    isParseButtonDisabled({
      hasTabs: viewState.tabs.length > 0,
      isStartingParse: viewState.isStartingParse,
      parseState: viewState.parseState,
    })
  ) {
    return;
  }

  const selectedTabId = Number(elements.tabSelect.value);

  if (!Number.isInteger(selectedTabId) || selectedTabId <= 0) {
    elements.app.dataset.status = 'error';
    elements.statusText.textContent = 'Needs attention';
    elements.detailText.textContent = 'Choose a valid tab before parsing.';
    return;
  }

  viewState.isStartingParse = true;
  elements.app.dataset.status = 'running';
  elements.statusText.textContent = 'Starting';
  elements.detailText.textContent =
    'Opening the selected page and preparing a reading.';
  renderButtons();
  resetCopyFeedback();

  try {
    const permissionGranted = await ensureSelectedTabPermission(selectedTabId);

    if (!permissionGranted) {
      elements.app.dataset.status = 'error';
      elements.statusText.textContent = 'Permission needed';
      elements.detailText.textContent =
        'Allow access to this site before parsing the page.';
      return;
    }

    const response = await chrome.runtime.sendMessage({
      type: PAGEX_MESSAGE_TYPES.START_PARSE,
      tabId: selectedTabId,
    });

    if (response && response.ok) {
      return;
    }

    elements.app.dataset.status = 'error';
    elements.statusText.textContent = 'Needs attention';

    if (response && response.errorMessage) {
      elements.detailText.textContent = response.errorMessage;
    } else {
      elements.detailText.textContent = 'The parser could not start for this tab.';
    }
  } catch (error) {
    elements.app.dataset.status = 'error';
    elements.statusText.textContent = 'Needs attention';
    elements.detailText.textContent = 'The parser request could not be delivered.';
  } finally {
    viewState.isStartingParse = false;
    renderButtons();
  }
}

async function ensureSelectedTabPermission(selectedTabId) {
  const selectedTab = viewState.tabs.find((tab) => tab.id === selectedTabId);

  if (!selectedTab) {
    return false;
  }

  const permissionPattern = buildOriginPermissionPattern(selectedTab.url);

  if (!permissionPattern) {
    return true;
  }

  const containsPermission = await chrome.permissions.contains({
    origins: [permissionPattern],
  });

  if (containsPermission) {
    return true;
  }

  const granted = await chrome.permissions.request({
    origins: [permissionPattern],
  });

  if (granted) {
    return true;
  }

  return false;
}

async function handleCopyClick() {
  if (
    !canCopyForSelectedTab(viewState.parseState, getCurrentSelectedTabId()) ||
    !viewState.parseState ||
    !viewState.parseState.result
  ) {
    return;
  }

  const formatted = formatResultForCopy(viewState.parseState.result);
  await navigator.clipboard.writeText(formatted);
  elements.copyButton.classList.add('button--copied');
  elements.copyButton.textContent = 'Copied';
  setCopyFeedback('Copied to clipboard.');
}

function setCopyFeedback(text) {
  if (viewState.copyResetTimer) {
    window.clearTimeout(viewState.copyResetTimer);
    viewState.copyResetTimer = 0;
  }

  elements.copyFeedback.textContent = text;

  viewState.copyResetTimer = window.setTimeout(() => {
    viewState.copyResetTimer = 0;
    resetCopyFeedback();
  }, 2200);
}

function resetCopyFeedback() {
  elements.copyFeedback.textContent =
    'Local only. Nothing is sent away.';
  elements.copyButton.classList.remove('button--copied');
  elements.copyButton.textContent = 'Copy JSON';
}
