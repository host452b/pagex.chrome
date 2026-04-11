function formatBytes(byteLength) {
  if (!Number.isFinite(byteLength) || byteLength < 0) {
    return '0 B';
  }

  if (byteLength < 1024) {
    return `${byteLength} B`;
  }

  const kiloBytes = byteLength / 1024;

  if (kiloBytes < 1024) {
    return `${stripTrailingZero(kiloBytes.toFixed(1))} KB`;
  }

  const megaBytes = kiloBytes / 1024;

  return `${stripTrailingZero(megaBytes.toFixed(1))} MB`;
}

function stripTrailingZero(value) {
  if (!value.includes('.')) {
    return value;
  }

  if (value.endsWith('.0')) {
    return value.slice(0, -2);
  }

  return value;
}

export function formatResultForCopy(result) {
  return JSON.stringify(result, null, 2);
}

export function buildResultSummary(result) {
  const frames = [];

  if (result && Array.isArray(result.frames)) {
    frames.push(...result.frames);
  }

  let accessibleFrameCount = 0;
  let skippedFrameCount = 0;
  let elementCount = 0;
  let totalClicks = 0;
  let warningCount = 0;

  for (const frame of frames) {
    if (frame && frame.skipped) {
      skippedFrameCount += 1;
    } else {
      accessibleFrameCount += 1;
    }

    if (frame && frame.stats && Number.isFinite(frame.stats.elementCount)) {
      elementCount += frame.stats.elementCount;
    }

    if (frame && frame.stats && Number.isFinite(frame.stats.totalClicks)) {
      totalClicks += frame.stats.totalClicks;
    }

    if (frame && Array.isArray(frame.warnings)) {
      warningCount += frame.warnings.length;
    }
  }

  let byteLength = 0;

  if (result && Number.isFinite(result.resultSizeBytes) && result.resultSizeBytes >= 0) {
    byteLength = result.resultSizeBytes;
  }

  return {
    frameCount: frames.length,
    accessibleFrameCount,
    skippedFrameCount,
    elementCount,
    totalClicks,
    warningCount,
    resultSizeBytes: byteLength,
    resultSizeLabel: formatBytes(byteLength),
  };
}

export function buildTabLabel(tab) {
  const safeTitle = normalizeTitle(tab);
  const safeHost = normalizeHost(tab);

  return `${safeTitle} - ${safeHost}`;
}

function normalizeTitle(tab) {
  if (tab && typeof tab.title === 'string' && tab.title.trim()) {
    return tab.title.trim();
  }

  return 'Untitled tab';
}

function normalizeHost(tab) {
  if (!tab || typeof tab.url !== 'string' || !tab.url.trim()) {
    return 'no-url';
  }

  try {
    const parsed = new URL(tab.url);

    if (parsed.host) {
      return parsed.host;
    }
  } catch (error) {
    return 'invalid-url';
  }

  return 'no-url';
}

export function sortTabsForPicker(tabs, activeTabId) {
  const enrichedTabs = [];

  for (const tab of tabs) {
    enrichedTabs.push({
      ...tab,
      label: buildTabLabel(tab),
    });
  }

  enrichedTabs.sort((left, right) => {
    if (left.id === activeTabId && right.id !== activeTabId) {
      return -1;
    }

    if (left.id !== activeTabId && right.id === activeTabId) {
      return 1;
    }

    if (Number.isFinite(left.index) && Number.isFinite(right.index)) {
      return left.index - right.index;
    }

    return 0;
  });

  return enrichedTabs;
}
