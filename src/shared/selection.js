import { classifyTabUrl } from './tab-eligibility.js';

export function getHost(url) {
  try {
    const parsed = new URL(url);

    if (parsed.protocol === 'file:') {
      return 'file';
    }

    return parsed.hostname || '';
  } catch {
    return '';
  }
}

// Normalizes chrome.tabs.Tab objects into picker rows: active tab first, then
// window order, each tagged with whether Pagex can read it.
export function buildTabEntries(tabs, activeTabId, { fileAccessAllowed = false } = {}) {
  const entries = [];

  for (const tab of tabs || []) {
    if (!tab || !Number.isInteger(tab.id)) {
      continue;
    }

    const url = tab.url || tab.pendingUrl || '';
    const eligibility = classifyTabUrl(url, { fileAccessAllowed });

    entries.push({
      tabId: tab.id,
      title: typeof tab.title === 'string' ? tab.title.trim() : '',
      url,
      host: getHost(url),
      index: Number.isFinite(tab.index) ? tab.index : 0,
      isActive: tab.id === activeTabId,
      eligible: eligibility.ok,
      ineligibleCode: eligibility.code,
    });
  }

  entries.sort((left, right) => {
    if (left.isActive !== right.isActive) {
      return left.isActive ? -1 : 1;
    }

    return left.index - right.index;
  });

  return entries;
}

// On open: a running job's tabs; else what was ticked moments ago (the
// popup may have been closed by Chrome's permission prompt); else the last
// job's tabs; else the active tab if it can be read.
export function getDefaultSelection(
  entries,
  job,
  { saved = null, now = Date.now(), maxAgeMs = 120000 } = {},
) {
  const eligibleIds = new Set(
    entries.filter((entry) => entry.eligible).map((entry) => entry.tabId),
  );
  const keepEligible = (tabIds) => tabIds.filter((tabId) => eligibleIds.has(tabId));

  if (job && job.status === 'running' && Array.isArray(job.tabs)) {
    const running = keepEligible(job.tabs.map((tab) => tab.tabId));

    if (running.length > 0) {
      return running;
    }
  }

  if (
    saved &&
    Array.isArray(saved.tabIds) &&
    Number.isFinite(saved.savedAt) &&
    now - saved.savedAt <= maxAgeMs
  ) {
    const recent = keepEligible(saved.tabIds);

    if (recent.length > 0) {
      return recent;
    }
  }

  if (job && Array.isArray(job.tabs)) {
    const fromJob = job.tabs
      .map((tab) => tab.tabId)
      .filter((tabId) => eligibleIds.has(tabId));

    if (fromJob.length > 0) {
      return fromJob;
    }
  }

  const active = entries.find((entry) => entry.isActive && entry.eligible);

  return active ? [active.tabId] : [];
}

export function getSelectedEligibleIds(entries, selectedIds) {
  const selected = new Set(selectedIds);

  return entries
    .filter((entry) => entry.eligible && selected.has(entry.tabId))
    .map((entry) => entry.tabId);
}

// "Select all" ticks up to `maxTabs` readable tabs; pressing it again when
// they are all ticked clears the selection.
export function toggleSelectAll(entries, selectedIds, maxTabs) {
  const eligibleIds = entries
    .filter((entry) => entry.eligible)
    .map((entry) => entry.tabId)
    .slice(0, maxTabs);
  const selected = new Set(selectedIds);
  const allSelected =
    eligibleIds.length > 0 && eligibleIds.every((tabId) => selected.has(tabId));

  return allSelected ? [] : eligibleIds;
}

export function isSelectionSameAsJob(job, selectedIds) {
  if (!job || !Array.isArray(job.tabs)) {
    return false;
  }

  const jobIds = new Set(job.tabs.map((tab) => tab.tabId));
  const selected = new Set(selectedIds);

  if (jobIds.size !== selected.size) {
    return false;
  }

  for (const tabId of selected) {
    if (!jobIds.has(tabId)) {
      return false;
    }
  }

  return true;
}
