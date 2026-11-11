import {
  PAGEX_BATCH_LIMITS,
  PAGEX_DEFAULT_SETTINGS,
  PAGEX_GUIDE_DISMISSED_KEY,
  PAGEX_JOB_KEY,
  PAGEX_MESSAGE_TYPES,
  PAGEX_SETTINGS_KEY,
} from './src/shared/constants.js';
import { PAGEX_ERROR_CODES } from './src/shared/error-codes.js';
import {
  buildBatchArchiveName,
  buildCookiesFileName,
  buildResultFileName,
  buildScreenshotFileName,
  dedupeFileNames,
} from './src/shared/filenames.js';
import {
  getDownloadableTabs,
  getJobProgress,
  summarizeJob,
} from './src/shared/job-state.js';
import {
  buildOriginPermissionPattern,
  collectOriginPatterns,
} from './src/shared/origin-permissions.js';
import { loadResultText } from './src/shared/result-store.js';
import { formatBytes } from './src/shared/result-utils.js';
import {
  buildTabEntries,
  getDefaultSelection,
  getHost,
  getSelectedEligibleIds,
  isSelectionSameAsJob,
  toggleSelectAll,
} from './src/shared/selection.js';
import { createZip } from './src/shared/zip.js';
import { collectCookieExport } from './src/popup/cookies.js';
import { downloadBlob } from './src/popup/download.js';
import { applyI18n, t } from './src/popup/i18n.js';
import { createMotion } from './src/popup/jelly.js';
import { captureFullPage } from './src/popup/screenshot.js';

const ALL_SITES = ['<all_urls>'];

const ERROR_MESSAGE_KEYS = {
  [PAGEX_ERROR_CODES.NO_URL]: 'errNoUrl',
  [PAGEX_ERROR_CODES.BROWSER_PAGE]: 'errBrowserPage',
  [PAGEX_ERROR_CODES.EXTENSION_PAGE]: 'errExtensionPage',
  [PAGEX_ERROR_CODES.WEB_STORE]: 'errWebStore',
  [PAGEX_ERROR_CODES.FILE_ACCESS]: 'errFileAccess',
  [PAGEX_ERROR_CODES.UNSUPPORTED_SCHEME]: 'errUnsupportedScheme',
  [PAGEX_ERROR_CODES.PERMISSION]: 'errPermission',
  [PAGEX_ERROR_CODES.TAB_CLOSED]: 'errTabClosed',
  [PAGEX_ERROR_CODES.NAVIGATED]: 'errNavigated',
  [PAGEX_ERROR_CODES.ERROR_PAGE]: 'errErrorPage',
  [PAGEX_ERROR_CODES.TIMEOUT]: 'errTimeout',
  [PAGEX_ERROR_CODES.MAIN_FRAME]: 'errMainFrame',
  [PAGEX_ERROR_CODES.STORAGE_FULL]: 'errStorageFull',
  [PAGEX_ERROR_CODES.TOO_LARGE]: 'errTooLarge',
  [PAGEX_ERROR_CODES.INTERRUPTED]: 'errInterrupted',
  [PAGEX_ERROR_CODES.BUSY]: 'errBusy',
  [PAGEX_ERROR_CODES.UNKNOWN]: 'errUnknown',
};

const CHIP_KEYS = {
  queued: 'chipQueued',
  preparing: 'chipPreparing',
  injecting: 'chipInjecting',
  collecting: 'chipCollecting',
  finalizing: 'chipFinalizing',
  done: 'chipDone',
  error: 'chipError',
  cancelled: 'chipCancelled',
};

const view = {
  entries: [],
  selected: new Set(),
  job: null,
  settings: { ...PAGEX_DEFAULT_SETTINGS },
  // Local, pre-job phase: 'idle' | 'permission' | 'starting'.
  phase: 'idle',
  permissionSiteCount: 0,
  pickerHintOverride: '',
  localError: '',
  // Jobs this popup saw running; only those may auto-download on finish.
  watchedJobIds: new Set(),
  savedJobId: '',
  savedFileName: '',
  downloadFlashTimer: 0,
  ticker: 0,
  busyTool: '',
  toolsMessage: '',
  toolsMessageTimer: 0,
};

const dom = {
  app: document.getElementById('app'),
  statusPill: document.getElementById('statusPill'),
  settingsBtn: document.getElementById('settingsBtn'),
  settingsPanel: document.getElementById('settingsPanel'),
  autoDownloadToggle: document.getElementById('autoDownloadToggle'),
  allSitesToggle: document.getElementById('allSitesToggle'),
  allSitesHint: document.getElementById('allSitesHint'),
  showGuideBtn: document.getElementById('showGuideBtn'),
  guide: document.getElementById('guide'),
  guideDismissBtn: document.getElementById('guideDismissBtn'),
  selectionCount: document.getElementById('selectionCount'),
  selectAllBtn: document.getElementById('selectAllBtn'),
  tabList: document.getElementById('tabList'),
  pickerHint: document.getElementById('pickerHint'),
  progress: document.getElementById('progress'),
  progressFill: document.getElementById('progressFill'),
  runMessage: document.getElementById('runMessage'),
  extractBtn: document.getElementById('extractBtn'),
  downloadBtn: document.getElementById('downloadBtn'),
  downloadLabel: document.getElementById('downloadLabel'),
  pagesValue: document.getElementById('pagesValue'),
  elementsValue: document.getElementById('elementsValue'),
  clicksValue: document.getElementById('clicksValue'),
  sizeValue: document.getElementById('sizeValue'),
  summaryNote: document.getElementById('summaryNote'),
  screenshotBtn: document.getElementById('screenshotBtn'),
  screenshotLabel: document.getElementById('screenshotLabel'),
  cookiesBtn: document.getElementById('cookiesBtn'),
  cookiesLabel: document.getElementById('cookiesLabel'),
  toolsHint: document.getElementById('toolsHint'),
};

const rowElements = new Map();
const motion = createMotion(dom.app, { clip: dom.tabList });

void init();

async function init() {
  applyI18n(document);
  bindEvents();

  const [tabs, sessionData, localData, fileAccessAllowed, hasAllSites] = await Promise.all([
    chrome.tabs.query({ currentWindow: true }),
    chrome.storage.session.get(PAGEX_JOB_KEY),
    chrome.storage.local.get([PAGEX_SETTINGS_KEY, PAGEX_GUIDE_DISMISSED_KEY]),
    chrome.extension.isAllowedFileSchemeAccess().catch(() => false),
    chrome.permissions.contains({ origins: ALL_SITES }).catch(() => false),
  ]);

  const activeTab = tabs.find((tab) => tab.active);

  view.job = sessionData[PAGEX_JOB_KEY] || null;
  view.settings = { ...PAGEX_DEFAULT_SETTINGS, ...(localData[PAGEX_SETTINGS_KEY] || {}) };
  view.entries = buildTabEntries(tabs, activeTab ? activeTab.id : null, { fileAccessAllowed });
  view.selected = new Set(getDefaultSelection(view.entries, view.job));

  if (view.job && view.job.status === 'running') {
    view.watchedJobIds.add(view.job.jobId);
    // Wakes the worker; if it died mid-job it marks the job interrupted.
    chrome.runtime.sendMessage({ type: PAGEX_MESSAGE_TYPES.PING }).catch(() => {});
  }

  dom.guide.hidden = Boolean(localData[PAGEX_GUIDE_DISMISSED_KEY]);
  dom.autoDownloadToggle.checked = Boolean(view.settings.autoDownload);
  dom.allSitesToggle.checked = hasAllSites;

  render();
}

function bindEvents() {
  dom.extractBtn.addEventListener('click', () => {
    motion.jiggle(dom.extractBtn, { strength: 0.9 });

    if (isJobRunning()) {
      void handleStop();
    } else {
      void handleExtract();
    }
  });

  dom.downloadBtn.addEventListener('click', () => {
    motion.jiggle(dom.downloadBtn, { strength: 0.9 });
    void handleDownload();
  });

  dom.selectAllBtn.addEventListener('click', () => {
    view.selected = new Set(
      toggleSelectAll(view.entries, [...view.selected], PAGEX_BATCH_LIMITS.maxTabs),
    );
    view.localError = '';
    render();
  });

  dom.tabList.addEventListener('change', (event) => {
    const checkbox = event.target;

    if (!(checkbox instanceof HTMLInputElement)) {
      return;
    }

    const tabId = Number(checkbox.dataset.tabId);

    if (checkbox.checked) {
      if (view.selected.size >= PAGEX_BATCH_LIMITS.maxTabs) {
        checkbox.checked = false;
        setPickerHintOverride(t('hintMaxTabs', PAGEX_BATCH_LIMITS.maxTabs));
        return;
      }

      view.selected.add(tabId);
    } else {
      view.selected.delete(tabId);
    }

    view.localError = '';
    render();
  });

  dom.tabList.addEventListener('click', (event) => {
    const button = event.target instanceof Element
      ? event.target.closest('.tab-row__download')
      : null;

    if (button) {
      void handleDownload([Number(button.dataset.tabId)]);
    }
  });

  dom.screenshotBtn.addEventListener('click', () => {
    void handleScreenshot();
  });

  dom.cookiesBtn.addEventListener('click', () => {
    void handleCookies();
  });

  dom.settingsBtn.addEventListener('click', () => {
    const open = dom.settingsPanel.hidden;
    dom.settingsPanel.hidden = !open;
    dom.settingsBtn.setAttribute('aria-expanded', String(open));
  });

  dom.autoDownloadToggle.addEventListener('change', () => {
    view.settings = { ...view.settings, autoDownload: dom.autoDownloadToggle.checked };
    void chrome.storage.local.set({ [PAGEX_SETTINGS_KEY]: view.settings });
    render();
  });

  dom.allSitesToggle.addEventListener('change', () => {
    void handleAllSitesToggle();
  });

  dom.showGuideBtn.addEventListener('click', () => {
    dom.guide.hidden = false;
    dom.guideDismissBtn.focus();
  });

  dom.guideDismissBtn.addEventListener('click', () => {
    dom.guide.hidden = true;
    void chrome.storage.local.set({ [PAGEX_GUIDE_DISMISSED_KEY]: true });
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'session' || !changes[PAGEX_JOB_KEY]) {
      return;
    }

    const previous = view.job;
    const next = changes[PAGEX_JOB_KEY].newValue || null;
    view.job = next;

    if (next && next.status === 'running') {
      view.watchedJobIds.add(next.jobId);
    }

    const justCompleted =
      next &&
      previous &&
      previous.jobId === next.jobId &&
      previous.status === 'running' &&
      next.status === 'completed';

    if (justCompleted && view.watchedJobIds.has(next.jobId) && view.settings.autoDownload) {
      void handleDownload();
    }

    render();

    if (justCompleted && getDownloadableTabs(next).length > 0) {
      motion.celebrate(dom.downloadBtn);
    }
  });
}

// ── Actions ─────────────────────────────────

async function handleExtract() {
  const tabIds = getSelectedEligibleIds(view.entries, [...view.selected]).slice(
    0,
    PAGEX_BATCH_LIMITS.maxTabs,
  );

  if (tabIds.length === 0 || view.phase !== 'idle') {
    return;
  }

  view.localError = '';

  const urls = tabIds.map((tabId) => getEntry(tabId).url);
  const patterns = collectOriginPatterns(urls);

  if (patterns.length > 0) {
    view.phase = 'permission';
    view.permissionSiteCount = patterns.length;
    render();

    // Called straight from the click so Chrome treats it as a user gesture.
    // Already-granted origins resolve immediately without a prompt.
    let granted = false;

    try {
      granted = await chrome.permissions.request({ origins: patterns });
    } catch {
      granted = false;
    }

    if (!granted) {
      const allowed = await Promise.all(
        patterns.map((pattern) =>
          chrome.permissions.contains({ origins: [pattern] }).catch(() => false),
        ),
      );
      const allowedPatterns = new Set(patterns.filter((_, index) => allowed[index]));
      const anyReadable = urls.some((url) => {
        const pattern = buildOriginPermissionPattern(url);
        return !pattern || allowedPatterns.has(pattern);
      });

      if (!anyReadable) {
        view.phase = 'idle';
        view.localError = t('errPermissionDeniedAll');
        render();
        return;
      }
      // Tabs without access still run and fail with a clear per-tab reason.
    }
  }

  view.phase = 'starting';
  render();

  try {
    const response = await chrome.runtime.sendMessage({
      type: PAGEX_MESSAGE_TYPES.START_BATCH,
      tabIds,
    });

    if (response && response.ok) {
      tabIds.forEach((tabId, index) => {
        motion.jiggle(rowElements.get(tabId)?.root, { strength: 0.55, delay: index * 0.05 });
      });
      view.watchedJobIds.add(response.jobId);
      view.savedJobId = '';
      view.savedFileName = '';
    } else {
      view.localError = getErrorMessage(response && response.errorCode);
    }
  } catch {
    view.localError = t('errConnect');
  } finally {
    view.phase = 'idle';
    render();
  }
}

async function handleStop() {
  try {
    await chrome.runtime.sendMessage({ type: PAGEX_MESSAGE_TYPES.STOP_BATCH });
  } catch {
    view.localError = t('errConnect');
    render();
  }
}

async function handleDownload(onlyTabIds) {
  const job = view.job;
  let tabs = getDownloadableTabs(job);

  if (Array.isArray(onlyTabIds)) {
    tabs = tabs.filter((tab) => onlyTabIds.includes(tab.tabId));
  }

  if (tabs.length === 0) {
    return;
  }

  try {
    const runDate = job.startedAt ? new Date(job.startedAt) : new Date();
    let blob;
    let fileName;

    if (tabs.length === 1) {
      const text = await loadResultText(tabs[0].resultKey);
      blob = new Blob([text], { type: 'application/json' });
      fileName = buildResultFileName(tabs[0].url, runDate);
    } else {
      const names = dedupeFileNames(tabs.map((tab) => buildResultFileName(tab.url, runDate)));
      const texts = await Promise.all(tabs.map((tab) => loadResultText(tab.resultKey)));
      const archive = await createZip(
        names.map((name, index) => ({ name, data: texts[index] })),
        { date: runDate },
      );
      blob = new Blob([archive], { type: 'application/zip' });
      fileName = buildBatchArchiveName(runDate);
    }

    downloadBlob(blob, fileName);

    if (!onlyTabIds) {
      view.savedJobId = job.jobId;
      view.savedFileName = fileName;
      flashDownloadSaved();
    }
  } catch {
    view.localError = t('downloadFailed');
  }

  render();
}

function flashDownloadSaved() {
  window.clearTimeout(view.downloadFlashTimer);
  dom.downloadBtn.classList.add('button--saved');
  dom.downloadLabel.textContent = t('downloadSaved');

  view.downloadFlashTimer = window.setTimeout(() => {
    dom.downloadBtn.classList.remove('button--saved');
    view.downloadFlashTimer = 0;
    render();
  }, 2000);
}

async function handleAllSitesToggle() {
  const wantAll = dom.allSitesToggle.checked;

  try {
    if (wantAll) {
      const granted = await chrome.permissions.request({ origins: ALL_SITES });
      dom.allSitesToggle.checked = granted;
      dom.allSitesHint.textContent = granted
        ? t('settingAllSitesHint')
        : t('settingAllSitesDenied');
    } else {
      await chrome.permissions.remove({ origins: ALL_SITES });
      dom.allSitesHint.textContent = t('settingAllSitesHint');
    }
  } catch {
    dom.allSitesToggle.checked = await chrome.permissions
      .contains({ origins: ALL_SITES })
      .catch(() => false);
  }
}

async function ensureSiteAccess(url) {
  const pattern = buildOriginPermissionPattern(url);

  if (!pattern) {
    return true;
  }

  try {
    return await chrome.permissions.request({ origins: [pattern] });
  } catch {
    return false;
  }
}

async function handleScreenshot() {
  const entry = getSingleToolTarget();

  if (!entry || view.busyTool) {
    return;
  }

  view.busyTool = 'screenshot';
  dom.screenshotLabel.textContent = t('shotPreparing');
  renderTools();

  try {
    if (!(await ensureSiteAccess(entry.url))) {
      setToolsMessage(t('shotPermission'));
      return;
    }

    const { blob, truncated } = await captureFullPage(entry.tabId, {
      onProgress: (current, total) => {
        dom.screenshotLabel.textContent = t('shotCapturing', current, total);
      },
    });

    dom.screenshotLabel.textContent = t('shotSaving');

    if (!blob) {
      setToolsMessage(t('shotTooLarge'));
      return;
    }

    downloadBlob(blob, buildScreenshotFileName(entry.url, new Date()));
    setToolsMessage(truncated ? t('shotSavedTruncated') : t('shotSaved'));
  } catch {
    setToolsMessage(t('shotFailed'));
  } finally {
    view.busyTool = '';
    dom.screenshotLabel.textContent = t('screenshot');
    renderTools();
  }
}

async function handleCookies() {
  const entry = getSingleToolTarget();

  if (!entry || view.busyTool) {
    return;
  }

  view.busyTool = 'cookies';
  dom.cookiesLabel.textContent = t('cookiesExporting');
  renderTools();

  try {
    if (!(await ensureSiteAccess(entry.url))) {
      setToolsMessage(t('cookiesPermission'));
      return;
    }

    const { text, cookieCount, storageCount } = await collectCookieExport(entry);
    downloadBlob(new Blob([text], { type: 'text/plain' }), buildCookiesFileName(entry.url));
    setToolsMessage(t('cookiesDone', cookieCount, storageCount));
  } catch {
    setToolsMessage(t('cookiesFailed'));
  } finally {
    view.busyTool = '';
    dom.cookiesLabel.textContent = t('cookies');
    renderTools();
  }
}

function setToolsMessage(message) {
  window.clearTimeout(view.toolsMessageTimer);
  view.toolsMessage = message;
  renderTools();

  view.toolsMessageTimer = window.setTimeout(() => {
    view.toolsMessage = '';
    renderTools();
  }, 6000);
}

let pickerHintOverrideTimer = 0;

function setPickerHintOverride(message) {
  window.clearTimeout(pickerHintOverrideTimer);
  view.pickerHintOverride = message;
  renderPicker();

  pickerHintOverrideTimer = window.setTimeout(() => {
    view.pickerHintOverride = '';
    renderPicker();
  }, 4000);
}

// ── Helpers ─────────────────────────────────

function getEntry(tabId) {
  return view.entries.find((entry) => entry.tabId === tabId);
}

function getJobTab(tabId) {
  if (!view.job || !Array.isArray(view.job.tabs)) {
    return null;
  }

  return view.job.tabs.find((tab) => tab.tabId === tabId) || null;
}

function isJobRunning() {
  return Boolean(view.job && view.job.status === 'running');
}

function getSelectedIds() {
  return getSelectedEligibleIds(view.entries, [...view.selected]);
}

function getSingleToolTarget() {
  const ids = getSelectedIds();

  return ids.length === 1 ? getEntry(ids[0]) : null;
}

function getErrorMessage(code) {
  return t(ERROR_MESSAGE_KEYS[code] || 'errUnknown');
}

function getElapsedSeconds(job) {
  const started = Date.parse(job.startedAt);

  return Number.isFinite(started) ? Math.max(0, Math.round((Date.now() - started) / 1000)) : 0;
}

// ── Rendering ───────────────────────────────

function render() {
  renderPicker();
  renderRun();
  renderTools();
  syncTicker();
  syncAgents();
}

// One cursor per tab being read; they leave when the job stops or ends.
function syncAgents() {
  const tasks = [];

  if (isJobRunning()) {
    for (const tab of view.job.tabs) {
      const row = rowElements.get(tab.tabId);

      if (tab.status === 'running' && row) {
        tasks.push({ key: tab.tabId, element: row.root, mode: tab.stageKey, pressTarget: row.chip });
      }
    }
  }

  motion.syncAgents(tasks);
}

function syncTicker() {
  if (isJobRunning() && !view.ticker) {
    view.ticker = window.setInterval(renderRun, 1000);
  } else if (!isJobRunning() && view.ticker) {
    window.clearInterval(view.ticker);
    view.ticker = 0;
  }
}

function renderPicker() {
  const running = isJobRunning();
  const eligibleCount = view.entries.filter((entry) => entry.eligible).length;
  const selectedIds = getSelectedIds();
  const liveIds = new Set();

  if (view.entries.length === 0) {
    dom.tabList.textContent = '';
    const empty = document.createElement('li');
    empty.className = 'tab-list__empty';
    empty.textContent = t('noTabs');
    dom.tabList.appendChild(empty);
  }

  view.entries.forEach((entry, position) => {
    liveIds.add(entry.tabId);

    let row = rowElements.get(entry.tabId);

    if (!row) {
      row = createRow(entry);
      rowElements.set(entry.tabId, row);
    }

    // Keep DOM order in sync with entry order without rebuilding rows.
    if (dom.tabList.children[position] !== row.root) {
      dom.tabList.insertBefore(row.root, dom.tabList.children[position] || null);
    }

    updateRow(row, entry, running);
  });

  for (const [tabId, row] of rowElements) {
    if (!liveIds.has(tabId)) {
      row.root.remove();
      rowElements.delete(tabId);
    }
  }

  dom.selectionCount.textContent = t('selectionCount', selectedIds.length, eligibleCount);

  const allSelected =
    selectedIds.length > 0 &&
    selectedIds.length >= Math.min(eligibleCount, PAGEX_BATCH_LIMITS.maxTabs);
  dom.selectAllBtn.textContent = allSelected ? t('selectNone') : t('selectAll');
  dom.selectAllBtn.hidden = eligibleCount < 2 || running;

  let hint = view.pickerHintOverride || '';

  const showsLastRun = Boolean(view.job) && isSelectionSameAsJob(view.job, selectedIds);

  if (!hint && !running && !showsLastRun) {
    const includesBackground = selectedIds.some((tabId) => !getEntry(tabId).isActive);

    if (selectedIds.length >= PAGEX_BATCH_LIMITS.maxTabs) {
      hint = t('hintMaxTabs', PAGEX_BATCH_LIMITS.maxTabs);
    } else if (includesBackground) {
      hint = t('hintBackgroundTabs');
    }
  }

  dom.pickerHint.textContent = hint;
  dom.pickerHint.hidden = !hint;
}

function createRow(entry) {
  const root = document.createElement('li');
  root.className = 'tab-row';

  const label = document.createElement('label');
  label.className = 'tab-row__main';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'tab-row__check';
  checkbox.dataset.tabId = String(entry.tabId);

  const mono = document.createElement('span');
  mono.className = 'tab-row__mono';
  mono.setAttribute('aria-hidden', 'true');

  const text = document.createElement('span');
  text.className = 'tab-row__text';

  const title = document.createElement('span');
  title.className = 'tab-row__title';

  const meta = document.createElement('span');
  meta.className = 'tab-row__meta';

  text.append(title, meta);
  label.append(checkbox, mono, text);

  const chip = document.createElement('span');
  chip.className = 'chip';

  const download = document.createElement('button');
  download.type = 'button';
  download.className = 'icon-button tab-row__download';
  download.dataset.tabId = String(entry.tabId);
  download.hidden = true;
  download.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19h14" /></svg>';

  root.append(label, chip, download);

  return { root, checkbox, mono, title, meta, chip, download };
}

function updateRow(row, entry, running) {
  const jobTab = getJobTab(entry.tabId);
  const displayTitle = entry.title || t('untitledTab');
  let state = 'idle';
  let chipText = '';
  const metaParts = [];

  if (!entry.eligible) {
    state = 'unsupported';
    chipText = t('chipUnsupported');
    metaParts.push(getErrorMessage(entry.ineligibleCode));
  } else if (jobTab) {
    state = jobTab.status === 'queued' ? 'queued' : jobTab.status;
    chipText = t(CHIP_KEYS[jobTab.status === 'running' ? jobTab.stageKey : jobTab.status] || 'chipQueued');

    if (jobTab.status === 'error') {
      metaParts.push(getErrorMessage(jobTab.errorCode));
    } else {
      metaParts.push(entry.host || entry.url);

      if (jobTab.status === 'done' && jobTab.summary) {
        metaParts.push(jobTab.summary.resultSizeLabel || formatBytes(jobTab.summary.resultSizeBytes));

        if (jobTab.summary.pageHidden) {
          metaParts.push(t('metaBackground'));
        }
      }
    }
  } else {
    metaParts.push(entry.host || entry.url || '');
  }

  if (entry.isActive && entry.eligible && state !== 'error') {
    metaParts.splice(1, 0, t('tabCurrent'));
  }

  if (row.state !== undefined && row.state !== state) {
    if (state === 'done') {
      motion.jiggle(row.root, { strength: 1 });
      motion.jiggle(row.chip, { strength: 1.3 });
    } else if (state === 'error') {
      motion.jiggle(row.root, { kind: 'shake', strength: 1 });
    } else if (state === 'running' || state === 'queued') {
      motion.jiggle(row.chip, { strength: 0.7 });
    }

    if (state === 'running' && typeof row.root.scrollIntoView === 'function') {
      // Keep the page being read in view so its cursor has somewhere to land.
      row.root.scrollIntoView({ block: 'nearest', behavior: motion.reduced ? 'auto' : 'smooth' });
    }
  }

  row.state = state;
  row.root.dataset.state = state;
  row.root.title = jobTab && jobTab.errorDetail ? jobTab.errorDetail : entry.url;
  row.checkbox.checked = entry.eligible && view.selected.has(entry.tabId);
  row.checkbox.disabled = !entry.eligible || running || view.phase !== 'idle';
  row.mono.textContent = (getHost(entry.url) || displayTitle).replace(/^www\./, '').charAt(0) || '·';
  row.title.textContent = displayTitle;
  row.meta.textContent = metaParts.filter(Boolean).join(' · ');

  row.chip.textContent = chipText;

  const downloadable = Boolean(jobTab && jobTab.status === 'done' && jobTab.resultKey);
  row.download.hidden = !downloadable;
  row.download.setAttribute('aria-label', t('tabDownload', displayTitle));
  row.download.title = t('downloadJson');
}

function renderRun() {
  const job = view.job;
  const selectedIds = getSelectedIds();
  const progress = getJobProgress(job);
  const running = isJobRunning();
  let status = 'idle';
  let pill = t('statusReady');
  let message = '';

  if (view.phase === 'permission') {
    status = 'permission';
    pill = t('statusPermission');
    message = t('runPermission', view.permissionSiteCount || 1);
  } else if (view.localError) {
    status = 'error';
    pill = t('statusFailed');
    message = view.localError;
  } else if (running) {
    status = 'running';
    pill = t('statusRunning', progress.finished, progress.total);
    message = t('runRunning', progress.finished, progress.total, getElapsedSeconds(job));
  } else if (job && job.tabs && job.tabs.length > 0) {
    if (job.status === 'cancelled') {
      status = 'stopped';
      pill = t('statusStopped');
      message = progress.done > 0 ? t('runStopped', progress.done) : t('runStoppedNone');
    } else if (progress.done === progress.total) {
      status = 'done';
      pill = t('statusDone');

      if (view.savedJobId === job.jobId && view.savedFileName) {
        message = `${t('runDone', progress.done)} ${t('runDoneSaved', view.savedFileName)}`;
      } else if (view.watchedJobIds.has(job.jobId)) {
        message = t('runDone', progress.done);
      } else {
        message = t('runFinishedAway');
      }
    } else if (progress.done > 0) {
      status = 'partial';
      pill = t('statusPartial');
      message = t('runPartial', progress.done, progress.total);
    } else {
      status = 'error';
      pill = t('statusFailed');
      message = t('runAllFailed');
    }

    if (selectedIds.length > 0 && !isSelectionSameAsJob(job, selectedIds)) {
      message = t('runSelectionChanged');
    }
  }

  if (status === 'idle') {
    if (selectedIds.length === 0) {
      const tickedUnsupported = [...view.selected].some((tabId) => {
        const entry = getEntry(tabId);
        return entry && !entry.eligible;
      });
      message = tickedUnsupported ? t('runOnlyUnsupported') : t('runNoSelection');
    } else {
      message = view.settings.autoDownload ? t('runIdleAuto') : t('runIdle');
    }
  }

  dom.app.dataset.status = status;
  dom.statusPill.textContent = pill;
  dom.runMessage.textContent = message;

  // Progress bar
  const showProgress = Boolean(job && job.tabs && job.tabs.length > 0) && (running || status !== 'idle');
  dom.progress.hidden = !showProgress;

  if (showProgress) {
    const percent = Math.round(progress.fraction * 100);
    motion.progress(dom.progressFill, progress.fraction);
    dom.progress.setAttribute('aria-valuenow', String(percent));
  } else {
    motion.resetProgress(dom.progressFill);
  }

  // Primary button
  if (running) {
    dom.extractBtn.textContent = t('stop');
    dom.extractBtn.className = 'button button--stop';
    dom.extractBtn.disabled = false;
  }

  const downloadable = getDownloadableTabs(job);
  const resultsInFocus =
    !running &&
    downloadable.length > 0 &&
    isSelectionSameAsJob(job, selectedIds) &&
    view.phase === 'idle' &&
    !view.localError;

  if (!running) {
    dom.extractBtn.className = resultsInFocus
      ? 'button button--secondary'
      : 'button button--primary';
    dom.extractBtn.textContent = resultsInFocus
      ? t('extractAgain')
      : selectedIds.length === 0
        ? t('extractNone')
        : selectedIds.length === 1
          ? t('extractOne')
          : t('extractMany', selectedIds.length);
    dom.extractBtn.disabled = selectedIds.length === 0 || view.phase !== 'idle';
  }

  // Download button
  dom.downloadBtn.disabled = downloadable.length === 0;
  dom.downloadBtn.classList.toggle('button--primary', resultsInFocus);
  dom.downloadBtn.classList.toggle('button--secondary', !resultsInFocus);

  if (!view.downloadFlashTimer) {
    dom.downloadLabel.textContent =
      downloadable.length > 1 ? t('downloadZip', downloadable.length) : t('downloadJson');
  }

  renderMetrics(job, progress);
}

function renderMetrics(job, progress) {
  const totals = summarizeJob(job);

  if (!job || totals.pages === 0) {
    dom.pagesValue.textContent = job && progress.total > 0 ? `0/${progress.total}` : '–';
    motion.setText(dom.elementsValue, '–');
    motion.setText(dom.clicksValue, '–');
    motion.setText(dom.sizeValue, '–');
    dom.summaryNote.textContent = job ? '' : t('summaryEmpty');
    return;
  }

  const pagesText = `${totals.pages}/${progress.total}`;

  if (dom.pagesValue.textContent !== pagesText) {
    dom.pagesValue.textContent = pagesText;
    motion.jiggle(dom.pagesValue.parentElement, { strength: 0.6 });
  }

  motion.countTo(dom.elementsValue, totals.elementCount, (n) => Math.round(n).toLocaleString());
  motion.countTo(dom.clicksValue, totals.totalClicks);
  motion.countTo(dom.sizeValue, totals.resultSizeBytes, (n) => formatBytes(Math.round(n)));
  dom.summaryNote.textContent = t(
    'summaryNote',
    totals.frameCount,
    totals.skippedFrameCount,
    totals.warningCount,
  );
}

function renderTools() {
  const running = isJobRunning();
  const selectedIds = getSelectedIds();
  const target = getSingleToolTarget();
  const enabled = Boolean(target) && !running && view.phase === 'idle';

  dom.screenshotBtn.disabled = !enabled || Boolean(view.busyTool);
  dom.cookiesBtn.disabled = !enabled || Boolean(view.busyTool);

  if (view.toolsMessage) {
    dom.toolsHint.textContent = view.toolsMessage;
  } else if (running) {
    dom.toolsHint.textContent = t('toolsHintRunning');
  } else if (target) {
    dom.toolsHint.textContent = t('toolsHintOne', target.title || target.host);
  } else if (selectedIds.length > 1) {
    dom.toolsHint.textContent = t('toolsHintMany');
  } else {
    dom.toolsHint.textContent = t('toolsHintNone');
  }
}
