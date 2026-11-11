import {
  PAGEX_ALL_SITES,
  PAGEX_BATCH_LIMITS,
  PAGEX_JOB_KEY,
  PAGEX_PENDING_BATCH_KEY,
  PAGEX_MESSAGE_TYPES,
  PAGEX_PARSE_OPTIONS,
  PAGEX_SUBFRAME_OPTION_OVERRIDES,
} from './src/shared/constants.js';
import {
  PAGEX_ERROR_CODES,
  PagexError,
  classifyRuntimeError,
  getErrorText,
} from './src/shared/error-codes.js';
import {
  cancelJob,
  createJob,
  failTab,
  finalizeJob,
  interruptJob,
  updateTab,
} from './src/shared/job-state.js';
import { buildParseResult } from './src/shared/parse-state.js';
import { createParseSingleFlight } from './src/shared/parse-single-flight.js';
import { buildResultSummary } from './src/shared/result-utils.js';
import {
  buildResultKey,
  removeResults,
  saveResult,
} from './src/shared/result-store.js';
import { classifyTabUrl } from './src/shared/tab-eligibility.js';

const jobGate = createParseSingleFlight();

// In-memory copy of the running job. Every change goes through `mutateJob`
// and is persisted to chrome.storage.session for the popup to render.
let currentJob = null;
let persistChain = Promise.resolve();
const cancelledJobIds = new Set();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== 'object') {
    return false;
  }

  if (message.type === PAGEX_MESSAGE_TYPES.START_BATCH) {
    void startBatchOnce(message.pendingId, message.tabIds)
      .then(sendResponse)
      .catch((error) => {
        sendResponse({
          ok: false,
          errorCode: classifyRuntimeError(error),
          errorDetail: getErrorText(error),
        });
      });

    return true;
  }

  if (message.type === PAGEX_MESSAGE_TYPES.PING) {
    // Waking the worker is the point: a fresh worker runs
    // recoverInterruptedJob() at startup.
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === PAGEX_MESSAGE_TYPES.STOP_BATCH) {
    void handleStopBatch()
      .then(sendResponse)
      .catch(() => sendResponse({ ok: false }));

    return true;
  }

  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (!currentJob || currentJob.status !== 'running') {
    return;
  }

  const entry = currentJob.tabs.find((tab) => tab.tabId === tabId);

  if (entry && entry.status === 'queued') {
    void mutateJob(currentJob.jobId, (job) =>
      failTab(job, tabId, PAGEX_ERROR_CODES.TAB_CLOSED),
    );
  }
});

// Chrome's permission prompt can close the popup before it gets to send
// START_BATCH. The popup saved the batch first, so start it from here as
// soon as access is granted. The popup, if still open, sends the same
// pendingId and gets the same job back.
chrome.permissions.onAdded.addListener(() => {
  void startPendingBatch();
});

const pendingStarts = new Map();

function startBatchOnce(pendingId, tabIds) {
  if (typeof pendingId !== 'string' || !pendingId) {
    return handleStartBatch(tabIds);
  }

  if (!pendingStarts.has(pendingId)) {
    pendingStarts.set(
      pendingId,
      (async () => {
        await chrome.storage.session.remove(PAGEX_PENDING_BATCH_KEY).catch(() => {});
        return handleStartBatch(tabIds);
      })(),
    );
  }

  return pendingStarts.get(pendingId);
}

async function startPendingBatch() {
  let pending = null;

  try {
    pending = (await chrome.storage.session.get(PAGEX_PENDING_BATCH_KEY))[PAGEX_PENDING_BATCH_KEY];
  } catch {
    return;
  }

  if (!pending || typeof pending.id !== 'string' || !Array.isArray(pending.tabIds)) {
    return;
  }

  if (!(Date.now() - pending.createdAt <= PAGEX_BATCH_LIMITS.pendingBatchMaxAgeMs)) {
    await chrome.storage.session.remove(PAGEX_PENDING_BATCH_KEY).catch(() => {});
    return;
  }

  const granted = await chrome.permissions
    .contains({ origins: PAGEX_ALL_SITES })
    .catch(() => false);

  if (granted) {
    await startBatchOnce(pending.id, pending.tabIds).catch(() => {});
  }
}

// If the service worker was stopped mid-job, the stored job still says
// "running" but nothing is driving it. Mark it as interrupted.
void recoverInterruptedJob();

async function recoverInterruptedJob() {
  try {
    const stored = await chrome.storage.session.get(PAGEX_JOB_KEY);
    const job = stored[PAGEX_JOB_KEY];

    if (!job || job.status !== 'running' || currentJob) {
      return;
    }

    await chrome.storage.session.set({ [PAGEX_JOB_KEY]: interruptJob(job) });
  } catch {
    // Nothing to recover.
  }
}

async function handleStartBatch(rawTabIds) {
  const tabIds = Array.from(
    new Set((Array.isArray(rawTabIds) ? rawTabIds : []).filter(Number.isInteger)),
  ).slice(0, PAGEX_BATCH_LIMITS.maxTabs);

  if (tabIds.length === 0) {
    return { ok: false, errorCode: PAGEX_ERROR_CODES.NO_URL };
  }

  const jobId = crypto.randomUUID();

  if (!jobGate.start({ requestId: jobId, tabId: tabIds[0] }).ok) {
    return { ok: false, errorCode: PAGEX_ERROR_CODES.BUSY };
  }

  const previousInMemory = currentJob;

  try {
    const tabs = await Promise.all(
      tabIds.map((tabId) => chrome.tabs.get(tabId).catch(() => null)),
    );
    const previous = await readStoredJob();

    let job = createJob({
      jobId,
      tabs: tabIds.map((tabId, index) => ({
        tabId,
        title: tabs[index]?.title || '',
        url: tabs[index]?.url || '',
      })),
    });

    tabs.forEach((tab, index) => {
      if (!tab) {
        job = failTab(job, tabIds[index], PAGEX_ERROR_CODES.TAB_CLOSED);
      }
    });

    currentJob = job;
    await chrome.storage.session.set({ [PAGEX_JOB_KEY]: job });

    // Only once the new job is safely stored, free the previous results.
    if (previous) {
      await removeResults(previous.tabs.map((tab) => tab.resultKey)).catch(() => {});
    }

    void runJob(jobId);

    return { ok: true, jobId };
  } catch (error) {
    if (currentJob && currentJob.jobId === jobId) {
      currentJob = previousInMemory;
    }

    jobGate.finish(jobId);
    throw error;
  }
}

async function handleStopBatch() {
  if (!currentJob || currentJob.status !== 'running') {
    return { ok: true };
  }

  const { jobId } = currentJob;
  const runningTabIds = currentJob.tabs
    .filter((tab) => tab.status === 'running')
    .map((tab) => tab.tabId);

  currentJob = cancelJob(currentJob);
  cancelledJobIds.add(jobId);
  jobGate.finish(jobId);
  await persistJob().catch(() => {});

  // Ask in-page collectors to stop clicking and scrolling. Fire and forget:
  // a stuck frame must not block the Stop response.
  for (const tabId of runningTabIds) {
    chrome.scripting
      .executeScript({
        target: { tabId, allFrames: true },
        func: (token) => globalThis.pagexCollector?.abort?.(token),
        args: [jobId],
      })
      .catch(() => {});
  }

  return { ok: true };
}

async function runJob(jobId) {
  const queue = currentJob.tabs
    .filter((tab) => tab.status === 'queued')
    .map((tab) => tab.tabId);
  const workerCount = Math.min(PAGEX_BATCH_LIMITS.concurrency, queue.length);

  const worker = async () => {
    while (queue.length > 0 && !isCancelled(jobId)) {
      const tabId = queue.shift();
      const entry = currentJob?.tabs.find((tab) => tab.tabId === tabId);

      if (!entry || entry.status !== 'queued') {
        continue;
      }

      try {
        await runTab(jobId, tabId);
      } catch (error) {
        await mutateJob(jobId, (job) =>
          failTab(job, tabId, classifyRuntimeError(error), getErrorText(error)),
        );
      }
    }
  };

  try {
    await Promise.allSettled(Array.from({ length: workerCount }, worker));
  } finally {
    if (!isCancelled(jobId)) {
      // Anything still unfinished at this point can never finish.
      await mutateJob(jobId, (job) => {
        const finished = finalizeJob(job);
        return finished.status === 'running' ? interruptJob(job) : finished;
      });
    }

    jobGate.finish(jobId);
  }
}

async function runTab(jobId, tabId) {
  const setStage = (stageKey) =>
    mutateJob(jobId, (job) => updateTab(job, tabId, { status: 'running', stageKey }));

  try {
    await setStage('preparing');

    let tab = await chrome.tabs.get(tabId);
    const fileAccessAllowed = await isFileAccessAllowed();
    const eligibility = classifyTabUrl(tab.url, { fileAccessAllowed });

    if (!eligibility.ok) {
      throw new PagexError(eligibility.code);
    }

    // Memory Saver discards background tabs; there is no page to read until
    // the tab is loaded again.
    if (tab.discarded || tab.status === 'unloaded') {
      tab = await reloadAndWait(tabId, PAGEX_BATCH_LIMITS.tabLoadTimeoutMs);
    }

    assertActive(jobId);
    await setStage('injecting');
    await chrome.scripting.executeScript({
      target: { tabId, frameIds: [0] },
      files: ['content.js'],
    });

    assertActive(jobId);
    await setStage('collecting');

    const frameResults = await collectFrames(tabId, jobId);

    assertActive(jobId);
    await setStage('finalizing');

    const result = buildParseResult({
      requestId: jobId,
      selectedTabId: tabId,
      accessibleFrameResults: frameResults,
      discoveredFrames: await getDiscoveredFrames(tabId),
    });

    if (!result.hasSuccessfulMainFrame) {
      throw new Error(result.mainFrameErrorMessage);
    }

    assertActive(jobId);

    const resultKey = buildResultKey(jobId, tabId);
    await saveResult(resultKey, result);

    if (isCancelled(jobId)) {
      // Stopped while saving: nothing references this key any more.
      await removeResults([resultKey]).catch(() => {});
      return;
    }

    await mutateJob(jobId, (job) =>
      updateTab(job, tabId, {
        status: 'done',
        stageKey: 'done',
        title: result.title || tab.title || '',
        url: tab.url || '',
        summary: buildResultSummary(result),
        resultKey,
      }),
    );
  } catch (error) {
    if (isCancelled(jobId)) {
      return;
    }

    await mutateJob(jobId, (job) =>
      failTab(job, tabId, classifyRuntimeError(error), getErrorText(error)),
    );
  }
}

// Runs inside every frame. Must stay self-contained (it is serialized).
async function collectPageInFrame(options) {
  try {
    if (
      !globalThis.pagexCollector ||
      typeof globalThis.pagexCollector.collectPage !== 'function'
    ) {
      throw new Error('page collector is unavailable on this page');
    }

    const timeoutMs = Number(options && options.hardTimeoutMs) || 15000;
    let timer = 0;
    const result = await Promise.race([
      globalThis.pagexCollector.collectPage(options),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          // Stop the in-page loop too, so it does not keep clicking.
          globalThis.pagexCollector.abort?.(options && options.runToken);
          reject(new Error(`frame collection timed out after ${timeoutMs / 1000} s`));
        }, timeoutMs);
      }),
    ]).finally(() => clearTimeout(timer));

    return { ok: true, result };
  } catch (error) {
    return {
      ok: false,
      frameUrl: window.location.href,
      errorMessage:
        error instanceof Error && error.message ? error.message : 'frame collection failed',
    };
  }
}

// Main frame and sub-frames are collected in parallel and independently, so a
// stuck ad iframe can never block or duplicate the main-frame collection.
async function collectFrames(tabId, jobId) {
  const mainOptions = { ...PAGEX_PARSE_OPTIONS, runToken: jobId };
  const subFrameOptions = { ...mainOptions, ...PAGEX_SUBFRAME_OPTION_OVERRIDES };
  const mainPromise = withTimeout(
    chrome.scripting.executeScript({
      target: { tabId, frameIds: [0] },
      func: collectPageInFrame,
      args: [mainOptions],
    }),
    PAGEX_BATCH_LIMITS.mainFrameTimeoutMs,
    'main frame timed out',
    () => {
      chrome.scripting
        .executeScript({
          target: { tabId, frameIds: [0] },
          func: (token) => globalThis.pagexCollector?.abort?.(token),
          args: [jobId],
        })
        .catch(() => {});
    },
  );

  const discovered = await getDiscoveredFrames(tabId);
  const subFrameIds = discovered
    .map((frame) => frame.frameId)
    .filter((frameId) => frameId !== 0)
    .slice(0, PAGEX_BATCH_LIMITS.maxSubFrames);

  const subPromises = subFrameIds.map((frameId) =>
    collectSubFrame(tabId, frameId, subFrameOptions).catch(() => null),
  );

  const [mainResults, ...subResults] = await Promise.all([mainPromise, ...subPromises]);

  return [...mainResults, ...subResults.filter(Boolean)];
}

async function collectSubFrame(tabId, frameId, options) {
  const target = { tabId, frameIds: [frameId] };
  let timer = 0;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => {
      chrome.scripting
        .executeScript({
          target,
          func: (token) => globalThis.pagexCollector?.abort?.(token),
          args: [options.runToken],
        })
        .catch(() => {});
      resolve({
        frameId,
        result: { ok: false, errorMessage: 'frame did not respond in time' },
      });
    }, PAGEX_BATCH_LIMITS.subFrameTimeoutMs);
  });

  const work = (async () => {
    await chrome.scripting.executeScript({ target, files: ['content.js'] });

    const [entry] = await chrome.scripting.executeScript({
      target,
      func: collectPageInFrame,
      args: [options],
    });

    return entry || null;
  })();

  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function withTimeout(promise, timeoutMs, message, onTimeout) {
  let timer = 0;

  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => {
        onTimeout?.();
        reject(new Error(message));
      }, timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

// Reloads a discarded tab and resolves with it once it has finished loading.
function reloadAndWait(tabId, timeoutMs) {
  return new Promise((resolve, reject) => {
    let timer = 0;
    let settled = false;

    const finish = (callback, value) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      callback(value);
    };

    function onUpdated(updatedTabId, changeInfo, updatedTab) {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        finish(resolve, updatedTab);
      }
    }

    chrome.tabs.onUpdated.addListener(onUpdated);
    timer = setTimeout(
      () => finish(reject, new Error('tab load timed out')),
      timeoutMs,
    );
    chrome.tabs.reload(tabId).catch((error) => finish(reject, error));
  });
}

async function getDiscoveredFrames(tabId) {
  try {
    const frames = await chrome.webNavigation.getAllFrames({ tabId });

    return Array.isArray(frames) ? frames : [];
  } catch {
    return [];
  }
}

async function isFileAccessAllowed() {
  try {
    return Boolean(await chrome.extension.isAllowedFileSchemeAccess());
  } catch {
    return false;
  }
}

function isCancelled(jobId) {
  return cancelledJobIds.has(jobId) || !currentJob || currentJob.jobId !== jobId;
}

function assertActive(jobId) {
  if (isCancelled(jobId)) {
    throw new Error('job cancelled');
  }
}

async function mutateJob(jobId, update) {
  if (!currentJob || currentJob.jobId !== jobId || cancelledJobIds.has(jobId)) {
    return;
  }

  currentJob = update(currentJob);

  try {
    await persistJob();
  } catch {
    // Storage write failed (e.g. quota). The in-memory job stays correct and
    // the next successful write carries the latest state.
  }
}

// Serializes writes so snapshots land in storage in the order they were made.
function persistJob() {
  const snapshot = currentJob;

  persistChain = persistChain
    .catch(() => {})
    .then(() => chrome.storage.session.set({ [PAGEX_JOB_KEY]: snapshot }));

  return persistChain;
}

async function readStoredJob() {
  try {
    const stored = await chrome.storage.session.get(PAGEX_JOB_KEY);

    return stored[PAGEX_JOB_KEY] || null;
  } catch {
    return null;
  }
}
