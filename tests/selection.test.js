import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTabEntries,
  getDefaultSelection,
  getSelectedEligibleIds,
  isSelectionSameAsJob,
  toggleSelectAll,
} from '../src/shared/selection.js';

const tabs = [
  { id: 1, index: 0, title: ' Settings ', url: 'chrome://settings' },
  { id: 2, index: 1, title: 'Docs', url: 'https://docs.example.com/a' },
  { id: 3, index: 2, title: 'News', url: 'https://news.example.com/', active: true },
  { id: 4, index: 3, title: 'Local', url: 'file:///tmp/a.html' },
  { index: 4, title: 'No id', url: 'https://x.example/' },
];

test('buildTabEntries puts the active tab first and flags unreadable tabs', () => {
  const entries = buildTabEntries(tabs, 3);

  assert.deepEqual(entries.map((entry) => entry.tabId), [3, 1, 2, 4]);
  assert.equal(entries[0].isActive, true);
  assert.equal(entries[1].title, 'Settings');
  assert.equal(entries[1].eligible, false);
  assert.equal(entries[1].ineligibleCode, 'browser-page');
  assert.equal(entries[3].ineligibleCode, 'file-access');
  assert.equal(buildTabEntries(tabs, 3, { fileAccessAllowed: true })[3].eligible, true);
  assert.equal(entries[2].host, 'docs.example.com');
});

test('getDefaultSelection prefers the last job tabs, else the active tab', () => {
  const entries = buildTabEntries(tabs, 3);

  assert.deepEqual(getDefaultSelection(entries, null), [3]);
  assert.deepEqual(getDefaultSelection(entries, { tabs: [{ tabId: 2 }, { tabId: 1 }, { tabId: 99 }] }), [2]);
  assert.deepEqual(getDefaultSelection(buildTabEntries(tabs, 1), null), []);
});

test('selection helpers ignore unreadable tabs and respect the batch limit', () => {
  const entries = buildTabEntries(tabs, 3);

  assert.deepEqual(getSelectedEligibleIds(entries, [1, 2, 3]), [3, 2]);
  assert.deepEqual(toggleSelectAll(entries, [3], 20), [3, 2]);
  assert.deepEqual(toggleSelectAll(entries, [3, 2], 20), []);
  assert.deepEqual(toggleSelectAll(entries, [], 1), [3]);
});

test('isSelectionSameAsJob compares tab id sets', () => {
  const job = { tabs: [{ tabId: 2 }, { tabId: 3 }] };

  assert.equal(isSelectionSameAsJob(job, [3, 2]), true);
  assert.equal(isSelectionSameAsJob(job, [3]), false);
  assert.equal(isSelectionSameAsJob(null, [3]), false);
});
