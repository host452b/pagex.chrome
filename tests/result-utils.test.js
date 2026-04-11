import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildResultSummary,
  formatResultForCopy,
  sortTabsForPicker,
} from '../src/shared/result-utils.js';

test('buildResultSummary aggregates frame and element statistics', () => {
  const result = {
    resultSizeBytes: 2048,
    frames: [
      {
        frameId: 0,
        skipped: false,
        stats: {
          elementCount: 12,
          totalClicks: 3,
        },
        warnings: ['truncated text'],
      },
      {
        frameId: 2,
        skipped: false,
        stats: {
          elementCount: 5,
          totalClicks: 1,
        },
        warnings: [],
      },
      {
        frameId: 3,
        skipped: true,
        warnings: ['cross-origin frame'],
      },
    ],
  };

  const summary = buildResultSummary(result);

  assert.equal(summary.frameCount, 3);
  assert.equal(summary.accessibleFrameCount, 2);
  assert.equal(summary.skippedFrameCount, 1);
  assert.equal(summary.elementCount, 17);
  assert.equal(summary.totalClicks, 4);
  assert.equal(summary.warningCount, 2);
  assert.equal(summary.resultSizeBytes, 2048);
  assert.equal(summary.resultSizeLabel, '2 KB');
});

test('formatResultForCopy returns readable JSON', () => {
  const payload = {
    title: 'Example',
    frames: [{ frameId: 0, elements: [{ tag: 'h1', text: 'hello' }] }],
  };

  const formatted = formatResultForCopy(payload);

  assert.equal(typeof formatted, 'string');
  assert.match(formatted, /\n  "title": "Example"/);
  assert.match(formatted, /"tag": "h1"/);
});

test('sortTabsForPicker keeps the active tab first and normalizes labels', () => {
  const tabs = [
    { id: 11, index: 1, active: false, title: '', url: '' },
    { id: 7, index: 0, active: true, title: 'Dashboard', url: 'https://example.com/app' },
    { id: 9, index: 2, active: false, title: 'Docs', url: 'https://docs.example.com/guide' },
  ];

  const sorted = sortTabsForPicker(tabs, 7);

  assert.deepEqual(
    sorted.map((tab) => tab.id),
    [7, 11, 9],
  );
  assert.equal(sorted[0].label, 'Dashboard - example.com');
  assert.equal(sorted[1].label, 'Untitled tab - no-url');
});
