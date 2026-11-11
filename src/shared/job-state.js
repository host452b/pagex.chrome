import { PAGEX_STAGES } from './constants.js';
import { PAGEX_ERROR_CODES } from './error-codes.js';

// A job is one press of "Extract": a list of tabs processed in the
// background. All helpers are pure and return new objects so the service
// worker can persist each snapshot as-is.

const TERMINAL_TAB_STATUSES = new Set(['done', 'error', 'cancelled']);

export function isTerminalTabStatus(status) {
  return TERMINAL_TAB_STATUSES.has(status);
}

export function createJob({ jobId, tabs, now = new Date() }) {
  return {
    jobId,
    status: 'running',
    startedAt: now.toISOString(),
    finishedAt: '',
    tabs: tabs.map((tab) => ({
      tabId: tab.tabId,
      title: tab.title || '',
      url: tab.url || '',
      status: 'queued',
      stageKey: 'queued',
      errorCode: '',
      errorDetail: '',
      summary: null,
      resultKey: '',
    })),
  };
}

export function updateTab(job, tabId, patch) {
  if (!job) {
    return job;
  }

  return {
    ...job,
    tabs: job.tabs.map((tab) => (tab.tabId === tabId ? { ...tab, ...patch } : tab)),
  };
}

export function failTab(job, tabId, errorCode, errorDetail = '') {
  return updateTab(job, tabId, {
    status: 'error',
    stageKey: 'error',
    errorCode: errorCode || PAGEX_ERROR_CODES.UNKNOWN,
    errorDetail,
  });
}

export function finalizeJob(job, now = new Date()) {
  if (!job || job.status !== 'running') {
    return job;
  }

  if (!job.tabs.every((tab) => isTerminalTabStatus(tab.status))) {
    return job;
  }

  return {
    ...job,
    status: 'completed',
    finishedAt: now.toISOString(),
  };
}

// Stops a running job. Finished tabs keep their results so they can still be
// downloaded; everything else is marked cancelled.
export function cancelJob(job, now = new Date()) {
  if (!job || job.status !== 'running') {
    return job;
  }

  return {
    ...job,
    status: 'cancelled',
    finishedAt: now.toISOString(),
    tabs: job.tabs.map((tab) =>
      isTerminalTabStatus(tab.status)
        ? tab
        : { ...tab, status: 'cancelled', stageKey: 'cancelled' },
    ),
  };
}

// Used when the service worker restarts and finds a job it no longer runs.
export function interruptJob(job, now = new Date()) {
  if (!job || job.status !== 'running') {
    return job;
  }

  return {
    ...job,
    status: 'completed',
    finishedAt: now.toISOString(),
    tabs: job.tabs.map((tab) =>
      isTerminalTabStatus(tab.status)
        ? tab
        : {
            ...tab,
            status: 'error',
            stageKey: 'error',
            errorCode: PAGEX_ERROR_CODES.INTERRUPTED,
            errorDetail: '',
          },
    ),
  };
}

export function getJobProgress(job) {
  const progress = {
    total: 0,
    done: 0,
    failed: 0,
    cancelled: 0,
    finished: 0,
    running: 0,
    fraction: 0,
  };

  if (!job || !Array.isArray(job.tabs) || job.tabs.length === 0) {
    return progress;
  }

  let weighted = 0;

  for (const tab of job.tabs) {
    progress.total += 1;

    if (tab.status === 'done') {
      progress.done += 1;
    } else if (tab.status === 'error') {
      progress.failed += 1;
    } else if (tab.status === 'cancelled') {
      progress.cancelled += 1;
    } else if (tab.status === 'running') {
      progress.running += 1;
    }

    if (isTerminalTabStatus(tab.status)) {
      weighted += 1;
    } else {
      const stage = PAGEX_STAGES[tab.stageKey];
      weighted += stage ? stage.weight : 0;
    }
  }

  progress.finished = progress.done + progress.failed + progress.cancelled;
  progress.fraction = Math.min(weighted / progress.total, 1);

  return progress;
}

export function getDownloadableTabs(job) {
  if (!job || !Array.isArray(job.tabs)) {
    return [];
  }

  return job.tabs.filter((tab) => tab.status === 'done' && tab.resultKey);
}

export function summarizeJob(job) {
  const totals = {
    pages: 0,
    frameCount: 0,
    skippedFrameCount: 0,
    elementCount: 0,
    totalClicks: 0,
    warningCount: 0,
    resultSizeBytes: 0,
    backgroundPages: 0,
  };

  for (const tab of getDownloadableTabs(job)) {
    const summary = tab.summary || {};
    totals.pages += 1;
    totals.frameCount += Number(summary.frameCount) || 0;
    totals.skippedFrameCount += Number(summary.skippedFrameCount) || 0;
    totals.elementCount += Number(summary.elementCount) || 0;
    totals.totalClicks += Number(summary.totalClicks) || 0;
    totals.warningCount += Number(summary.warningCount) || 0;
    totals.resultSizeBytes += Number(summary.resultSizeBytes) || 0;

    if (summary.pageHidden) {
      totals.backgroundPages += 1;
    }
  }

  return totals;
}
