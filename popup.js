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
import { calculateScrollPositions } from './src/shared/screenshot-utils.js';
import { formatCookiesTxt } from './src/shared/cookies-utils.js';

const viewState = {
  tabs: [],
  parseState: null,
  isStartingParse: false,
  isCapturingScreenshot: false,
  copyResetTimer: 0,
  toolsFeedbackTimer: 0,
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
  screenshotButton: document.getElementById('screenshotBtn'),
  cookiesButton: document.getElementById('cookiesBtn'),
  toolsFeedback: document.getElementById('toolsFeedback'),
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

  elements.screenshotButton.addEventListener('click', () => {
    void handleScreenshotClick();
  });

  elements.cookiesButton.addEventListener('click', () => {
    void handleCookiesClick();
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
    'Step 1: Pick a tab below · Step 2: Click Extract · Step 3: Copy the JSON';

  if (viewState.parseState && viewState.parseState.status) {
    status = viewState.parseState.status;
  }

  if (status === 'running') {
    statusText = viewState.parseState.stageLabel || 'Extracting';
    detailText =
      'Extracting page content — text, structure, and hidden sections.';
  }

  if (status === 'completed') {
    statusText = 'Done — ready to copy';
    detailText =
      'Extraction complete. Click "Copy JSON" to copy to clipboard.';

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
    detailText = viewState.parseState.errorMessage || 'This page could not be extracted.';
  }

  elements.app.dataset.status = status;
  elements.statusText.textContent = statusText;
  elements.detailText.textContent = detailText;
}

function renderSummary() {
  resetMetricValues();

  if (!viewState.parseState) {
    elements.summaryNote.textContent = 'Pick a tab and click "Extract Page" to start.';
    return;
  }

  if (viewState.parseState.status === 'running') {
    elements.summaryNote.textContent =
      'Extracting — results will appear here.';
    return;
  }

  if (viewState.parseState.status === 'error') {
    elements.summaryNote.textContent =
      viewState.parseState.errorMessage || 'This page could not be extracted.';
    return;
  }

  const summary = viewState.parseState.summary;
  const mismatchMessage = getResultMismatchMessage(
    viewState.parseState,
    getCurrentSelectedTabId(),
  );

  if (!summary) {
    elements.summaryNote.textContent = 'No extraction summary available yet.';
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
    elements.parseButton.textContent = 'Extracting...';
    return;
  }

  elements.parseButton.textContent = 'Extract Page';
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
    elements.detailText.textContent = 'Choose a valid tab before extracting.';
    return;
  }

  viewState.isStartingParse = true;
  elements.app.dataset.status = 'running';
  elements.statusText.textContent = 'Starting';
  elements.detailText.textContent =
    'Connecting to the selected page...';
  renderButtons();
  resetCopyFeedback();

  try {
    const permissionGranted = await ensureSelectedTabPermission(selectedTabId);

    if (!permissionGranted) {
      elements.app.dataset.status = 'error';
      elements.statusText.textContent = 'Permission needed';
      elements.detailText.textContent =
        'Chrome needs your permission to read this site. Please allow it and try again.';
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
      elements.detailText.textContent = 'Could not start extraction for this tab.';
    }
  } catch (error) {
    elements.app.dataset.status = 'error';
    elements.statusText.textContent = 'Needs attention';
    elements.detailText.textContent = 'Could not connect to the extension. Please try again.';
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
    'Everything stays on your device. Nothing is sent anywhere.';
  elements.copyButton.classList.remove('button--copied');
  elements.copyButton.textContent = 'Copy JSON';
}

async function handleScreenshotClick() {
  const selectedTabId = getCurrentSelectedTabId();

  if (!selectedTabId) {
    setToolsFeedback('Choose a valid tab before capturing.');
    return;
  }

  if (viewState.isCapturingScreenshot) {
    return;
  }

  viewState.isCapturingScreenshot = true;
  elements.screenshotButton.disabled = true;
  elements.screenshotButton.textContent = 'Preparing...';

  try {
    const permissionGranted = await ensureSelectedTabPermission(selectedTabId);

    if (!permissionGranted) {
      setToolsFeedback('Permission needed to capture this tab.');
      return;
    }

    await chrome.tabs.update(selectedTabId, { active: true });
    await delay(200);

    // Phase 1: Measure page and unfold non-document scrollable containers.
    // Many SPAs use overflow:hidden on html/body with a scrollable child div,
    // and intermediate wrappers (#root, .layout) that constrain height.
    // We find the main scrollable container, then walk up the ancestor chain
    // and temporarily remove every height/overflow constraint so the full
    // content participates in document-level scrolling.
    const [{ result: dims }] = await chrome.scripting.executeScript({
      target: { tabId: selectedTabId },
      func: () => {
        const viewportHeight = window.innerHeight;
        const saved = [];
        let scrollHeight = Math.max(
          document.body.scrollHeight,
          document.documentElement.scrollHeight,
        );

        if (scrollHeight <= viewportHeight + 1) {
          // Step A: Unfold html and body.
          for (const el of [document.documentElement, document.body]) {
            saved.push({ el, css: el.style.cssText });
            el.style.setProperty('overflow', 'visible', 'important');
            el.style.setProperty('height', 'auto', 'important');
            el.style.setProperty('max-height', 'none', 'important');
          }

          // Step B: Find the primary scrollable container (largest content).
          let target = null;
          let maxScroll = 0;

          for (const el of document.querySelectorAll('*')) {
            if (el === document.documentElement || el === document.body) {
              continue;
            }

            const cs = getComputedStyle(el);

            if (
              (cs.overflowY === 'auto' || cs.overflowY === 'scroll') &&
              el.scrollHeight > el.clientHeight + 10
            ) {
              if (el.scrollHeight > maxScroll) {
                maxScroll = el.scrollHeight;
                target = el;
              }
            }
          }

          if (target) {
            // Step C: Unfold the scrollable container itself.
            saved.push({ el: target, css: target.style.cssText });
            target.style.setProperty('overflow', 'visible', 'important');
            target.style.setProperty('height', 'auto', 'important');
            target.style.setProperty('max-height', 'none', 'important');

            // Step D: Walk up to body and unfold every ancestor that may
            // constrain height (e.g. #root, .layout with height:100%).
            let ancestor = target.parentElement;

            while (ancestor && ancestor !== document.documentElement) {
              saved.push({ el: ancestor, css: ancestor.style.cssText });
              ancestor.style.setProperty('overflow', 'visible', 'important');
              ancestor.style.setProperty('height', 'auto', 'important');
              ancestor.style.setProperty('max-height', 'none', 'important');
              ancestor = ancestor.parentElement;
            }
          }

          // Re-measure after unfolding.
          scrollHeight = Math.max(
            document.body.scrollHeight,
            document.documentElement.scrollHeight,
          );
        }

        window.__pagexSaved = saved;

        return {
          scrollHeight,
          viewportHeight,
          viewportWidth: window.innerWidth,
          originalScrollX: window.scrollX,
          originalScrollY: window.scrollY,
          devicePixelRatio: window.devicePixelRatio || 1,
        };
      },
    });

    // Phase 2: Pre-scroll to bottom and back to trigger lazy-loaded content,
    // then re-measure in case the page grew.
    await chrome.scripting.executeScript({
      target: { tabId: selectedTabId },
      func: (h) => window.scrollTo(0, h),
      args: [dims.scrollHeight],
    });

    await delay(500);

    await chrome.scripting.executeScript({
      target: { tabId: selectedTabId },
      func: () => window.scrollTo(0, 0),
    });

    await delay(300);

    const [{ result: measuredHeight }] = await chrome.scripting.executeScript({
      target: { tabId: selectedTabId },
      func: () =>
        Math.max(
          document.body.scrollHeight,
          document.documentElement.scrollHeight,
        ),
    });

    dims.scrollHeight = Math.max(dims.scrollHeight, measuredHeight);

    // Phase 3: Prepare canvas with safe dimensions.
    // Chrome caps canvas at ~16384px per dimension. For long pages we scale
    // down so the entire page fits. Each capture is drawn immediately to avoid
    // holding dozens of full-viewport PNGs in memory at once.
    const MAX_DIM = 16384;
    let scale = dims.devicePixelRatio;

    if (dims.viewportWidth * scale > MAX_DIM) {
      scale = MAX_DIM / dims.viewportWidth;
    }

    if (dims.scrollHeight * scale > MAX_DIM) {
      scale = MAX_DIM / dims.scrollHeight;
    }

    scale = Math.max(scale, 0.5);

    const canvasWidth = Math.round(dims.viewportWidth * scale);
    const canvasHeight = Math.min(
      Math.round(dims.scrollHeight * scale),
      MAX_DIM,
    );
    const capturePageHeight = canvasHeight / scale;

    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext('2d');

    const positions = calculateScrollPositions(
      capturePageHeight,
      dims.viewportHeight,
    );

    const drawWidth = Math.round(dims.viewportWidth * scale);
    const drawHeight = Math.round(dims.viewportHeight * scale);

    // Phase 4: Scroll-and-capture loop — draw each frame immediately.
    for (let i = 0; i < positions.length; i++) {
      elements.screenshotButton.textContent =
        `Capturing ${i + 1}/${positions.length}...`;

      await chrome.scripting.executeScript({
        target: { tabId: selectedTabId },
        func: (y) => window.scrollTo(0, y),
        args: [positions[i]],
      });

      await delay(300);

      const dataUrl = await chrome.tabs.captureVisibleTab(null, {
        format: 'png',
      });

      const [{ result: actualY }] = await chrome.scripting.executeScript({
        target: { tabId: selectedTabId },
        func: () => window.scrollY,
      });

      const img = await loadImage(dataUrl);
      const drawY = Math.round(actualY * scale);
      ctx.drawImage(img, 0, drawY, drawWidth, drawHeight);
    }

    // Phase 5: Restore original page styles and scroll position.
    await chrome.scripting.executeScript({
      target: { tabId: selectedTabId },
      func: (origX, origY) => {
        const saved = window.__pagexSaved || [];

        for (const entry of saved) {
          entry.el.style.cssText = entry.css;
        }

        delete window.__pagexSaved;
        window.scrollTo(origX, origY);
      },
      args: [dims.originalScrollX, dims.originalScrollY],
    });

    elements.screenshotButton.textContent = 'Saving...';

    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/png'),
    );

    if (!blob) {
      setToolsFeedback('Page too large — could not generate image.');
      return;
    }

    const tab = viewState.tabs.find((t) => t.id === selectedTabId);
    let hostname = 'page';

    try {
      hostname = new URL(tab.url).hostname.replace(/[^a-z0-9.-]/gi, '_');
    } catch {
      // Use default hostname.
    }

    downloadBlob(blob, `pagex-screenshot-${hostname}-${Date.now()}.png`);
    setToolsFeedback('Screenshot saved.');
  } catch (error) {
    setToolsFeedback('Screenshot failed — try again or check tab permissions.');
  } finally {
    viewState.isCapturingScreenshot = false;
    elements.screenshotButton.disabled = false;
    elements.screenshotButton.textContent = 'Screenshot Full Page';
  }
}

async function handleCookiesClick() {
  const selectedTabId = getCurrentSelectedTabId();

  if (!selectedTabId) {
    setToolsFeedback('Choose a valid tab before exporting cookies.');
    return;
  }

  elements.cookiesButton.disabled = true;
  elements.cookiesButton.textContent = 'Exporting...';

  try {
    const permissionGranted = await ensureSelectedTabPermission(selectedTabId);

    if (!permissionGranted) {
      setToolsFeedback('Permission needed to read cookies for this tab.');
      return;
    }

    const tab = viewState.tabs.find((t) => t.id === selectedTabId);

    if (!tab || !tab.url) {
      setToolsFeedback('Cannot read cookies — tab has no URL.');
      return;
    }

    const cookies = await chrome.cookies.getAll({ url: tab.url });
    const text = formatCookiesTxt(cookies);
    const blob = new Blob([text], { type: 'text/plain' });

    let hostname = 'site';

    try {
      hostname = new URL(tab.url).hostname.replace(/[^a-z0-9.-]/gi, '_');
    } catch {
      // Use default hostname.
    }

    downloadBlob(blob, `cookies-${hostname}.txt`);

    const count = cookies.length;
    setToolsFeedback(`Exported ${count} cookie${count === 1 ? '' : 's'}.`);
  } catch {
    setToolsFeedback('Could not export cookies — check tab permissions.');
  } finally {
    elements.cookiesButton.disabled = false;
    elements.cookiesButton.textContent = 'Get cookies.txt';
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setToolsFeedback(text) {
  if (viewState.toolsFeedbackTimer) {
    window.clearTimeout(viewState.toolsFeedbackTimer);
    viewState.toolsFeedbackTimer = 0;
  }

  elements.toolsFeedback.textContent = text;

  viewState.toolsFeedbackTimer = window.setTimeout(() => {
    viewState.toolsFeedbackTimer = 0;
    elements.toolsFeedback.textContent =
      'Capture or export from the selected tab above.';
  }, 4000);
}
