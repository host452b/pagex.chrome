import test from 'node:test';
import assert from 'node:assert/strict';

import {
  cancelJob,
  createJob,
  failTab,
  finalizeJob,
  getDownloadableTabs,
  getJobProgress,
  interruptJob,
  summarizeJob,
  updateTab,
} from '../src/shared/job-state.js';

function makeJob() {
  return createJob({
    jobId: 'job-1',
    now: new Date('2026-11-11T00:00:00Z'),
    tabs: [
      { tabId: 1, title: 'One', url: 'https://a.example/' },
      { tabId: 2, title: 'Two', url: 'https://b.example/' },
      { tabId: 3, title: 'Three', url: 'https://c.example/' },
    ],
  });
}

test('createJob queues every tab', () => {
  const job = makeJob();

  assert.equal(job.status, 'running');
  assert.equal(job.startedAt, '2026-11-11T00:00:00.000Z');
  assert.deepEqual(job.tabs.map((tab) => tab.status), ['queued', 'queued', 'queued']);
});

test('updateTab is immutable and only touches the target tab', () => {
  const job = makeJob();
  const next = updateTab(job, 2, { status: 'running', stageKey: 'collecting' });

  assert.notEqual(next, job);
  assert.equal(job.tabs[1].status, 'queued');
  assert.equal(next.tabs[1].stageKey, 'collecting');
  assert.equal(next.tabs[0], job.tabs[0]);
});

test('finalizeJob completes only when every tab is terminal', () => {
  let job = makeJob();
  job = updateTab(job, 1, { status: 'done', resultKey: 'k1' });
  job = failTab(job, 2, 'timeout');

  assert.equal(finalizeJob(job).status, 'running');

  job = updateTab(job, 3, { status: 'done', resultKey: 'k3' });
  const finished = finalizeJob(job, new Date('2026-11-11T00:01:00Z'));

  assert.equal(finished.status, 'completed');
  assert.equal(finished.finishedAt, '2026-11-11T00:01:00.000Z');
});

test('cancelJob keeps finished results and cancels the rest', () => {
  let job = makeJob();
  job = updateTab(job, 1, { status: 'done', resultKey: 'k1' });
  job = updateTab(job, 2, { status: 'running', stageKey: 'collecting' });

  const cancelled = cancelJob(job);

  assert.equal(cancelled.status, 'cancelled');
  assert.deepEqual(cancelled.tabs.map((tab) => tab.status), ['done', 'cancelled', 'cancelled']);
  assert.deepEqual(getDownloadableTabs(cancelled).map((tab) => tab.tabId), [1]);
  assert.equal(cancelJob(cancelled), cancelled, 'already-stopped jobs are left alone');
});

test('interruptJob marks unfinished tabs as interrupted errors', () => {
  let job = makeJob();
  job = updateTab(job, 1, { status: 'done', resultKey: 'k1' });

  const interrupted = interruptJob(job);

  assert.equal(interrupted.status, 'completed');
  assert.deepEqual(interrupted.tabs.map((tab) => tab.errorCode), ['', 'interrupted', 'interrupted']);
});

test('getJobProgress weights running stages into the fraction', () => {
  let job = makeJob();
  job = updateTab(job, 1, { status: 'done', resultKey: 'k1' });
  job = updateTab(job, 2, { status: 'running', stageKey: 'finalizing' });

  const progress = getJobProgress(job);

  assert.equal(progress.total, 3);
  assert.equal(progress.done, 1);
  assert.equal(progress.running, 1);
  assert.equal(progress.finished, 1);
  assert.ok(Math.abs(progress.fraction - (1 + 0.9) / 3) < 1e-9);
  assert.deepEqual(getJobProgress(null).total, 0);
});

test('summarizeJob totals finished tabs only', () => {
  let job = makeJob();
  job = updateTab(job, 1, {
    status: 'done',
    resultKey: 'k1',
    summary: { frameCount: 2, skippedFrameCount: 1, elementCount: 100, totalClicks: 3, warningCount: 1, resultSizeBytes: 1000, pageHidden: true },
  });
  job = updateTab(job, 2, {
    status: 'done',
    resultKey: 'k2',
    summary: { frameCount: 1, skippedFrameCount: 0, elementCount: 50, totalClicks: 0, warningCount: 0, resultSizeBytes: 500 },
  });
  job = failTab(job, 3, 'timeout');

  assert.deepEqual(summarizeJob(job), {
    pages: 2,
    frameCount: 3,
    skippedFrameCount: 1,
    elementCount: 150,
    totalClicks: 3,
    warningCount: 1,
    resultSizeBytes: 1500,
    backgroundPages: 1,
  });
});
