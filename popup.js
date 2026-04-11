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
  let statusText = 'Ready to parse';
  let detailText =
    'Choose a tab and extract structure, styles, text, and expanded content.';

  if (viewState.parseState && viewState.parseState.status) {
    status = viewState.parseState.status;
  }

  if (status === 'running') {
    statusText = viewState.parseState.stageLabel || 'Parsing page';
    detailText =
      'Pagex is expanding disclosure controls, inspecting frames, and building JSON.';
  }

  if (status === 'completed') {
    statusText = 'Parse complete';
    detailText =
      'The payload is ready. Click Copy JSON to move the structured result into your clipboard.';

    const mismatchMessage = getResultMismatchMessage(
      viewState.parseState,
      getCurrentSelectedTabId(),
    );

    if (mismatchMessage) {
      detailText = mismatchMessage;
    }
  }

  if (status === 'error') {
    statusText = 'Parse failed';
    detailText = viewState.parseState.errorMessage || 'The selected tab could not be parsed.';
  }

  elements.app.dataset.status = status;
  elements.statusText.textContent = statusText;
  elements.detailText.textContent = detailText;
}

function renderSummary() {
  resetMetricValues();

  if (!viewState.parseState) {
    elements.summaryNote.textContent = 'No parse result yet.';
    return;
  }

  if (viewState.parseState.status === 'running') {
    elements.summaryNote.textContent =
      'Parsing is running in the background. You can keep this popup open or reopen it later.';
    return;
  }

  if (viewState.parseState.status === 'error') {
    elements.summaryNote.textContent =
      viewState.parseState.errorMessage || 'The page could not be parsed.';
    return;
  }

  const summary = viewState.parseState.summary;
  const mismatchMessage = getResultMismatchMessage(
    viewState.parseState,
    getCurrentSelectedTabId(),
  );

  if (!summary) {
    elements.summaryNote.textContent = 'No parse summary is available yet.';
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
    elements.parseButton.textContent = 'Parsing...';
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
    elements.statusText.textContent = 'No tab selected';
    elements.detailText.textContent = 'Choose a valid tab before starting the parse.';
    return;
  }

  viewState.isStartingParse = true;
  elements.app.dataset.status = 'running';
  elements.statusText.textContent = 'Starting parse';
  elements.detailText.textContent =
    'Pagex is sending the selected tab to the background parser.';
  renderButtons();
  resetCopyFeedback();

  try {
    const permissionGranted = await ensureSelectedTabPermission(selectedTabId);

    if (!permissionGranted) {
      elements.app.dataset.status = 'error';
      elements.statusText.textContent = 'Permission required';
      elements.detailText.textContent =
        'Pagex needs site access for the selected tab before it can parse this page.';
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
    elements.statusText.textContent = 'Parse failed';

    if (response && response.errorMessage) {
      elements.detailText.textContent = response.errorMessage;
    } else {
      elements.detailText.textContent = 'The parser could not start for this tab.';
    }
  } catch (error) {
    elements.app.dataset.status = 'error';
    elements.statusText.textContent = 'Parse failed';
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
  setCopyFeedback('Copied JSON to clipboard.');
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
    'The copied payload is formatted JSON for AI processing.';
}
