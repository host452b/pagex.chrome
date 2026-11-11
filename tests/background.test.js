import test from 'node:test';
import assert from 'node:assert/strict';

import { decompressText } from '../src/shared/compression.js';
import { PAGEX_JOB_KEY, PAGEX_MESSAGE_TYPES } from '../src/shared/constants.js';

// Minimal in-memory stand-in for the chrome.* APIs background.js uses.
function createChromeMock({ tabs, collect, session: initialSession = {}, quotaBytes, bytesInUse, failResultWrites = false }) {
  const session = { ...initialSession };
  const listeners = { message: null };
  const calls = { abort: 0 };

  const chrome = {
    runtime: {
      onMessage: { addListener: (fn) => { listeners.message = fn; } },
    },
    tabs: {
      get: async (tabId) => {
        const tab = tabs[tabId];

        if (!tab) {
          throw new Error(`No tab with id: ${tabId}.`);
        }

        return { id: tabId, ...tab };
      },
      onRemoved: { addListener: () => {} },
    },
    extension: { isAllowedFileSchemeAccess: async () => false },
    webNavigation: { getAllFrames: async () => [{ frameId: 0, url: 'https://x/' }] },
    scripting: {
      executeScript: async ({ target, files, func, args }) => {
        if (files) {
          return [{ frameId: 0 }];
        }

        if (target.allFrames) {
          calls.abort += 1;
          return [];
        }

        const result = await collect(target.tabId, args[0], func);
        return [{ frameId: target.frameIds[0], result }];
      },
    },
    storage: {
      session: {
        get: async (key) => (key in session ? { [key]: structuredClone(session[key]) } : {}),
        QUOTA_BYTES: quotaBytes,
        getBytesInUse: async () => (typeof bytesInUse === 'number' ? bytesInUse : JSON.stringify(session).length),
        set: async (values) => {
          if (failResultWrites && Object.keys(values).some((key) => key.startsWith('pagex.result.'))) {
            throw new Error('Session storage quota bytes exceeded. Values were not stored.');
          }

          Object.assign(session, structuredClone(values));
        },
        remove: async (keys) => { for (const key of [].concat(keys)) delete session[key]; },
      },
    },
  };

  const send = (message) =>
    new Promise((resolve) => {
      listeners.message(message, {}, resolve);
    });

  return { chrome, session, send, calls };
}

function okFrame(title) {
  return {
    ok: true,
    result: {
      title,
      frameUrl: `https://${title}.example/`,
      collectedAt: '2026-11-11T00:00:00.000Z',
      resultSizeBytes: 42,
      warnings: [],
      stats: { elementCount: 3, totalClicks: 1 },
      elements: [{ tag: 'html' }, { tag: 'body' }, { tag: 'p', text: title }],
    },
  };
}

async function waitFor(predicate, timeoutMs = 2000) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const value = await predicate();

    if (value) {
      return value;
    }

    await new Promise((resolve) => setTimeout(resolve, 5));
  }

  throw new Error('timed out waiting for condition');
}

let importCounter = 0;

async function loadBackground(mock) {
  globalThis.chrome = mock.chrome;
  importCounter += 1;
  await import(`../background.js?case=${importCounter}`);
}

const finishedJob = (mock) => () => {
  const job = mock.session[PAGEX_JOB_KEY];
  return job && job.status !== 'running' ? job : null;
};

test('a batch extracts every readable tab and stores compressed results', async () => {
  const mock = createChromeMock({
    tabs: {
      1: { title: 'Alpha', url: 'https://alpha.example/' },
      2: { title: 'Beta', url: 'https://beta.example/' },
      3: { title: 'Settings', url: 'chrome://settings' },
    },
    collect: async (tabId) => okFrame(tabId === 1 ? 'alpha' : 'beta'),
  });
  await loadBackground(mock);

  const response = await mock.send({ type: PAGEX_MESSAGE_TYPES.START_BATCH, tabIds: [1, 2, 3, 2] });
  assert.equal(response.ok, true);

  const job = await waitFor(finishedJob(mock));

  assert.equal(job.status, 'completed');
  assert.deepEqual(job.tabs.map((tab) => [tab.tabId, tab.status]), [
    [1, 'done'],
    [2, 'done'],
    [3, 'error'],
  ]);
  assert.equal(job.tabs[2].errorCode, 'browser-page');
  assert.equal(job.tabs[0].summary.elementCount, 3);

  const stored = JSON.parse(await decompressText(mock.session[job.tabs[0].resultKey]));
  assert.equal(stored.title, 'alpha');
  assert.equal(stored.frames[0].elements.length, 3);
});

test('main frame failures become classified per-tab errors', async () => {
  const mock = createChromeMock({
    tabs: { 7: { title: 'Slow', url: 'https://slow.example/' } },
    collect: async () => ({ ok: false, errorMessage: 'frame collection timed out after 15 s' }),
  });
  await loadBackground(mock);

  await mock.send({ type: PAGEX_MESSAGE_TYPES.START_BATCH, tabIds: [7] });
  const job = await waitFor(finishedJob(mock));

  assert.equal(job.tabs[0].status, 'error');
  assert.equal(job.tabs[0].errorCode, 'timeout');
});

test('a second start is rejected while a batch runs, and Stop releases it', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const mock = createChromeMock({
    tabs: {
      1: { title: 'Hang', url: 'https://hang.example/' },
      2: { title: 'Next', url: 'https://next.example/' },
    },
    collect: async (tabId) => {
      if (tabId === 1) {
        await gate;
      }

      return okFrame('next');
    },
  });
  await loadBackground(mock);

  const first = await mock.send({ type: PAGEX_MESSAGE_TYPES.START_BATCH, tabIds: [1] });
  assert.equal(first.ok, true);

  await waitFor(() => mock.session[PAGEX_JOB_KEY]?.tabs[0].stageKey === 'collecting');

  const busy = await mock.send({ type: PAGEX_MESSAGE_TYPES.START_BATCH, tabIds: [2] });
  assert.deepEqual(busy, { ok: false, errorCode: 'busy' });

  const stop = await mock.send({ type: PAGEX_MESSAGE_TYPES.STOP_BATCH });
  assert.equal(stop.ok, true);
  assert.equal(mock.calls.abort, 1, 'expected an abort to be sent to the running tab');

  const cancelled = mock.session[PAGEX_JOB_KEY];
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.tabs[0].status, 'cancelled');

  const second = await mock.send({ type: PAGEX_MESSAGE_TYPES.START_BATCH, tabIds: [2] });
  assert.equal(second.ok, true);

  // The stopped run finishing late must not overwrite the new job.
  release();
  const job = await waitFor(finishedJob(mock));

  assert.equal(job.jobId, second.jobId);
  assert.deepEqual(job.tabs.map((tab) => tab.tabId), [2]);
  assert.equal(job.tabs[0].status, 'done');
  assert.equal(
    Object.keys(mock.session).filter((key) => key.startsWith('pagex.result.')).length,
    1,
    'only the new job result should be stored',
  );
});

test('starting a new batch removes the previous batch results', async () => {
  const mock = createChromeMock({
    tabs: { 1: { title: 'A', url: 'https://a.example/' } },
    collect: async () => okFrame('a'),
  });
  await loadBackground(mock);

  await mock.send({ type: PAGEX_MESSAGE_TYPES.START_BATCH, tabIds: [1] });
  const firstJob = await waitFor(finishedJob(mock));
  const firstKey = firstJob.tabs[0].resultKey;
  assert.ok(mock.session[firstKey]);

  await mock.send({ type: PAGEX_MESSAGE_TYPES.START_BATCH, tabIds: [1] });
  await waitFor(() => {
    const job = mock.session[PAGEX_JOB_KEY];
    return job.jobId !== firstJob.jobId && job.status === 'completed';
  });

  assert.equal(firstKey in mock.session, false);
});

test('an empty or invalid tab list is rejected', async () => {
  const mock = createChromeMock({ tabs: {}, collect: async () => okFrame('x') });
  await loadBackground(mock);

  const response = await mock.send({ type: PAGEX_MESSAGE_TYPES.START_BATCH, tabIds: ['x'] });

  assert.equal(response.ok, false);
});

test('results that would overflow session storage fail that tab without stranding the job', async () => {
  const mock = createChromeMock({
    tabs: { 1: { title: 'A', url: 'https://a.example/' } },
    collect: async () => okFrame('a'),
    quotaBytes: 520 * 1024,
    bytesInUse: 10 * 1024,
  });
  await loadBackground(mock);

  await mock.send({ type: PAGEX_MESSAGE_TYPES.START_BATCH, tabIds: [1] });
  const job = await waitFor(finishedJob(mock));

  assert.equal(job.status, 'completed');
  assert.equal(job.tabs[0].errorCode, 'storage-full');
});

test('a quota error from the storage write itself is classified and the job still finishes', async () => {
  const mock = createChromeMock({
    tabs: { 1: { title: 'A', url: 'https://a.example/' }, 2: { title: 'B', url: 'https://b.example/' } },
    collect: async () => okFrame('a'),
    failResultWrites: true,
  });
  await loadBackground(mock);

  await mock.send({ type: PAGEX_MESSAGE_TYPES.START_BATCH, tabIds: [1, 2] });
  const job = await waitFor(finishedJob(mock));

  assert.equal(job.status, 'completed');
  assert.deepEqual(job.tabs.map((tab) => tab.errorCode), ['storage-full', 'storage-full']);
});

test('a worker restart marks a job left running as interrupted', async () => {
  const mock = createChromeMock({
    tabs: {},
    collect: async () => okFrame('x'),
    session: {
      [PAGEX_JOB_KEY]: {
        jobId: 'old',
        status: 'running',
        startedAt: '2026-11-11T00:00:00.000Z',
        tabs: [
          { tabId: 1, status: 'done', stageKey: 'done', resultKey: 'pagex.result.old.1' },
          { tabId: 2, status: 'running', stageKey: 'collecting' },
        ],
      },
    },
  });
  await loadBackground(mock);

  const ping = await mock.send({ type: PAGEX_MESSAGE_TYPES.PING });
  assert.deepEqual(ping, { ok: true });

  const job = await waitFor(finishedJob(mock));

  assert.equal(job.status, 'completed');
  assert.deepEqual(job.tabs.map((tab) => tab.status), ['done', 'error']);
  assert.equal(job.tabs[1].errorCode, 'interrupted');
});
