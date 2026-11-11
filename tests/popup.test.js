import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { JSDOM, VirtualConsole } from 'jsdom';
import { strFromU8, unzipSync } from 'fflate';

import { compressText } from '../src/shared/compression.js';
import { PAGEX_JOB_KEY, PAGEX_MESSAGE_TYPES } from '../src/shared/constants.js';

const root = process.cwd();

const openWindows = [];

test.afterEach(() => {
  while (openWindows.length > 0) {
    openWindows.pop().close();
  }
});

async function setupPopup({ tabs, job = null }) {
  const html = await readFile(path.join(root, 'popup.html'), 'utf8');
  const messages = JSON.parse(await readFile(path.join(root, '_locales/en/messages.json'), 'utf8'));
  const dom = new JSDOM(html.replace(/<script[^>]*><\/script>/, ''), {
    url: 'https://extension.test/popup.html',
    virtualConsole: new VirtualConsole(),
  });
  const { window } = dom;
  openWindows.push(window);

  const session = job ? { [PAGEX_JOB_KEY]: job } : {};
  const local = {};
  const sent = [];
  const requested = [];
  const downloads = [];
  let storageListener = null;

  const chrome = {
    i18n: {
      getUILanguage: () => 'en',
      getMessage: (key, substitutions = []) => {
        const entry = messages[key];

        if (!entry) {
          return '';
        }

        return entry.message.replace(/\$P(\d)\$/g, (_, index) => substitutions[Number(index) - 1] ?? '');
      },
    },
    tabs: { query: async () => tabs },
    extension: { isAllowedFileSchemeAccess: async () => false },
    permissions: {
      contains: async () => false,
      request: async ({ origins }) => {
        requested.push(origins);
        return true;
      },
      remove: async () => true,
    },
    runtime: {
      sendMessage: async (message) => {
        sent.push(message);
        return message.type === PAGEX_MESSAGE_TYPES.START_BATCH
          ? { ok: true, jobId: 'job-1' }
          : { ok: true };
      },
    },
    storage: {
      session: {
        get: async (key) => (key in session ? { [key]: session[key] } : {}),
      },
      local: {
        get: async () => ({ ...local }),
        set: async (values) => Object.assign(local, values),
      },
      onChanged: { addListener: (fn) => { storageListener = fn; } },
    },
  };

  window.HTMLAnchorElement.prototype.click = function click() {
    downloads.push({ name: this.download, blob: window.__lastBlob });
  };
  window.URL.createObjectURL = (blob) => {
    window.__lastBlob = blob;
    return 'blob:test';
  };
  window.URL.revokeObjectURL = () => {};

  Object.assign(globalThis, {
    chrome,
    window,
    document: window.document,
    Element: window.Element,
    HTMLElement: window.HTMLElement,
    HTMLInputElement: window.HTMLInputElement,
  });
  globalThis.URL.createObjectURL = window.URL.createObjectURL;
  globalThis.URL.revokeObjectURL = window.URL.revokeObjectURL;

  await import(`../popup.js?case=${Math.random()}`);
  await waitFor(() => window.document.querySelectorAll('.tab-row').length === tabs.length);

  const pushJob = (nextJob) => {
    session[PAGEX_JOB_KEY] = nextJob;
    storageListener({ [PAGEX_JOB_KEY]: { newValue: nextJob } }, 'session');
  };

  return { window, document: window.document, sent, requested, downloads, session, pushJob };
}

async function waitFor(predicate, timeoutMs = 2000) {
  const started = Date.now();

  while (!(await predicate())) {
    if (Date.now() - started > timeoutMs) {
      throw new Error('timed out waiting for popup state');
    }

    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

const TABS = [
  { id: 11, index: 0, title: 'Docs', url: 'https://docs.example.com/guide', active: false },
  { id: 12, index: 1, title: 'News', url: 'https://news.example.com/today', active: true },
  { id: 13, index: 2, title: 'Settings', url: 'chrome://settings', active: false },
];

const text = (document, id) => document.getElementById(id).textContent.trim();

test('popup ticks the active tab and explains unreadable tabs', async () => {
  const { document } = await setupPopup({ tabs: TABS });
  const rows = [...document.querySelectorAll('.tab-row')];

  assert.deepEqual(rows.map((row) => row.querySelector('.tab-row__check').dataset.tabId), ['12', '11', '13']);
  assert.equal(rows[0].querySelector('.tab-row__check').checked, true);
  assert.equal(rows[2].dataset.state, 'unsupported');
  assert.equal(rows[2].querySelector('.tab-row__check').disabled, true);
  assert.match(rows[2].querySelector('.tab-row__meta').textContent, /chrome:\/\//);
  assert.equal(text(document, 'selectionCount'), '1 of 2 selected');
  assert.equal(text(document, 'extractBtn'), 'Extract page');
  assert.equal(text(document, 'statusPill'), 'Ready');
  assert.match(text(document, 'toolsHint'), /Works on the ticked page: News/);
  assert.equal(document.getElementById('guide').hidden, false, 'first run shows the quick start');
});

test('extracting several tabs runs one batch and auto-downloads a ZIP', async () => {
  const { window, document, sent, requested, downloads, session, pushJob } = await setupPopup({ tabs: TABS });
  const docsCheckbox = document.querySelector('.tab-row__check[data-tab-id="11"]');

  docsCheckbox.checked = true;
  docsCheckbox.dispatchEvent(new window.Event('change', { bubbles: true }));

  assert.equal(text(document, 'extractBtn'), 'Extract 2 pages');
  assert.match(text(document, 'pickerHint'), /Background tabs/);
  assert.match(text(document, 'toolsHint'), /Tick just one page/);

  document.getElementById('extractBtn').click();
  await waitFor(() => sent.length === 1);

  assert.deepEqual(requested[0].sort(), ['https://docs.example.com/*', 'https://news.example.com/*']);
  assert.deepEqual(sent[0], { type: PAGEX_MESSAGE_TYPES.START_BATCH, tabIds: [12, 11] });

  const running = {
    jobId: 'job-1',
    status: 'running',
    startedAt: new Date(2026, 10, 11, 10, 0, 0).toISOString(),
    tabs: [
      { tabId: 12, url: TABS[1].url, status: 'running', stageKey: 'collecting', summary: null, resultKey: '' },
      { tabId: 11, url: TABS[0].url, status: 'queued', stageKey: 'queued', summary: null, resultKey: '' },
    ],
  };
  pushJob(running);

  assert.equal(text(document, 'extractBtn'), 'Stop');
  assert.equal(text(document, 'statusPill'), 'Extracting 0/2');
  assert.equal(document.querySelector('.tab-row[data-state="running"] .chip').textContent, 'Reading');
  assert.equal(docsCheckbox.disabled, true);

  const summary = { frameCount: 1, skippedFrameCount: 0, elementCount: 10, totalClicks: 2, warningCount: 0, resultSizeBytes: 2048, resultSizeLabel: '2 KB' };
  session['pagex.result.job-1.12'] = await compressText('{"title":"News"}');
  session['pagex.result.job-1.11'] = await compressText('{"title":"Docs"}');

  pushJob({
    ...running,
    status: 'completed',
    tabs: [
      { ...running.tabs[0], status: 'done', stageKey: 'done', summary, resultKey: 'pagex.result.job-1.12' },
      { ...running.tabs[1], status: 'done', stageKey: 'done', summary: { ...summary, pageHidden: true }, resultKey: 'pagex.result.job-1.11' },
    ],
  });

  await waitFor(() => downloads.length === 1);

  assert.equal(downloads[0].name, 'pagex-batch-20261111-100000.zip');

  const archive = unzipSync(new Uint8Array(await downloads[0].blob.arrayBuffer()));
  assert.deepEqual(Object.keys(archive).sort(), [
    'pagex-docs.example.com-guide-20261111-100000.json',
    'pagex-news.example.com-today-20261111-100000.json',
  ]);
  assert.equal(strFromU8(archive['pagex-docs.example.com-guide-20261111-100000.json']), '{"title":"Docs"}');

  await waitFor(() => /Saved pagex-batch/.test(text(document, 'runMessage')));
  assert.equal(text(document, 'statusPill'), 'Done');
  assert.equal(text(document, 'pagesValue'), '2/2');
  assert.equal(text(document, 'sizeValue'), '4 KB');
  assert.match(
    document.querySelector('.tab-row__check[data-tab-id="11"]').closest('.tab-row').querySelector('.tab-row__meta').textContent,
    /read in background/,
  );
  assert.equal(document.querySelectorAll('.tab-row__download:not([hidden])').length, 2);
});

test('a failed tab shows a plain-language reason and a partial status', async () => {
  const { document } = await setupPopup({
    tabs: TABS,
    job: {
      jobId: 'job-9',
      status: 'completed',
      startedAt: new Date().toISOString(),
      tabs: [
        { tabId: 12, url: TABS[1].url, status: 'done', stageKey: 'done', resultKey: 'k', summary: { elementCount: 1, resultSizeBytes: 10 } },
        { tabId: 11, url: TABS[0].url, status: 'error', stageKey: 'error', errorCode: 'timeout', errorDetail: 'raw detail' },
      ],
    },
  });

  const failedRow = document.querySelector('.tab-row[data-state="error"]');

  assert.equal(text(document, 'statusPill'), 'Done with issues');
  assert.match(text(document, 'runMessage'), /1 of 2 page\(s\) extracted/);
  assert.match(failedRow.querySelector('.tab-row__meta').textContent, /took too long/);
  assert.equal(failedRow.title, 'raw detail');
  assert.equal(text(document, 'downloadLabel'), 'Download JSON');
});
