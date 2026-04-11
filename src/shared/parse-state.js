import { buildResultSummary } from './result-utils.js';

function createBaseState({
  requestId,
  selectedTabId,
  status,
  stageKey,
  stageLabel,
  canCopy,
  result,
  summary,
  errorMessage,
}) {
  return {
    requestId,
    selectedTabId,
    status,
    stageKey,
    stageLabel,
    canCopy,
    result,
    summary,
    errorMessage,
    updatedAt: new Date().toISOString(),
  };
}

function normalizeStats(stats) {
  const safeStats = {
    elementCount: 0,
    totalClicks: 0,
    openedDetails: 0,
    clickedExpanders: 0,
    autoScrollPasses: 0,
  };

  if (!stats || typeof stats !== 'object') {
    return safeStats;
  }

  for (const key of Object.keys(safeStats)) {
    if (Number.isFinite(stats[key])) {
      safeStats[key] = stats[key];
    }
  }

  return safeStats;
}

function buildAccessibleFrame(entry) {
  let result = entry.result || {};
  const warnings = [];
  const elements = [];

  if (result && typeof result === 'object' && 'ok' in result) {
    if (result.ok) {
      result = result.result || {};
    } else {
      return buildFailedFrame(entry.frameId, result);
    }
  }

  if (Array.isArray(result.warnings)) {
    warnings.push(...result.warnings);
  }

  if (Array.isArray(result.elements)) {
    elements.push(...result.elements);
  }

  return {
    frameId: entry.frameId,
    skipped: false,
    failed: false,
    frameUrl: result.frameUrl || '',
    title: result.title || '',
    warnings,
    stats: normalizeStats(result.stats),
    elements,
    collectedAt: result.collectedAt || '',
    resultSizeBytes: getSafeResultSize(result.resultSizeBytes),
  };
}

function buildFailedFrame(frameId, frameError) {
  let warningMessage = 'frame collection failed';
  let frameUrl = '';

  if (
    frameError &&
    typeof frameError.errorMessage === 'string' &&
    frameError.errorMessage.trim()
  ) {
    warningMessage = frameError.errorMessage.trim();
  }

  if (frameError && typeof frameError.frameUrl === 'string') {
    frameUrl = frameError.frameUrl;
  }

  return {
    frameId,
    skipped: false,
    failed: true,
    frameUrl,
    title: '',
    warnings: [warningMessage],
    stats: normalizeStats(null),
    elements: [],
    collectedAt: '',
    resultSizeBytes: 0,
  };
}

function buildSkippedFrame(discoveredFrame) {
  return {
    frameId: discoveredFrame.frameId,
    skipped: true,
    failed: false,
    frameUrl: discoveredFrame.url || '',
    title: '',
    warnings: ['frame was discovered but not accessible to the extension'],
    stats: normalizeStats(null),
    elements: [],
    collectedAt: '',
    resultSizeBytes: 0,
  };
}

function getSafeResultSize(value) {
  if (Number.isFinite(value) && value >= 0) {
    return value;
  }

  return 0;
}

export function buildParseResult({
  requestId,
  selectedTabId,
  timestamp,
  accessibleFrameResults,
  discoveredFrames,
}) {
  const frameMap = new Map();
  const mergedFrames = [];

  for (const entry of accessibleFrameResults || []) {
    frameMap.set(entry.frameId, buildAccessibleFrame(entry));
  }

  if (Array.isArray(discoveredFrames) && discoveredFrames.length > 0) {
    for (const discoveredFrame of discoveredFrames) {
      if (frameMap.has(discoveredFrame.frameId)) {
        mergedFrames.push(frameMap.get(discoveredFrame.frameId));
        frameMap.delete(discoveredFrame.frameId);
      } else {
        mergedFrames.push(buildSkippedFrame(discoveredFrame));
      }
    }
  }

  for (const frame of frameMap.values()) {
    mergedFrames.push(frame);
  }

  let title = '';
  let url = '';
  let resultSizeBytes = 0;
  let hasSuccessfulMainFrame = false;
  let mainFrameErrorMessage = 'main frame did not return a successful result';
  let mainFrame = null;

  for (const frame of mergedFrames) {
    if (frame.frameId === 0) {
      mainFrame = frame;
      break;
    }
  }

  if (mainFrame && !mainFrame.skipped && !mainFrame.failed) {
    hasSuccessfulMainFrame = true;
    title = mainFrame.title || '';
    url = mainFrame.frameUrl || '';
  }

  if (mainFrame && mainFrame.failed && Array.isArray(mainFrame.warnings) && mainFrame.warnings[0]) {
    mainFrameErrorMessage = `main frame failed: ${mainFrame.warnings[0]}`;
  }

  for (const frame of mergedFrames) {
    resultSizeBytes += getSafeResultSize(frame.resultSizeBytes);
  }

  return {
    requestId,
    selectedTabId,
    parseMode: 'aggressive',
    timestamp: timestamp || new Date().toISOString(),
    title,
    url,
    hasSuccessfulMainFrame,
    mainFrameErrorMessage,
    resultSizeBytes,
    frames: mergedFrames,
  };
}

export function createRunningState({
  requestId,
  selectedTabId,
  stageKey,
  stageLabel,
}) {
  return createBaseState({
    requestId,
    selectedTabId,
    status: 'running',
    stageKey,
    stageLabel,
    canCopy: false,
    result: null,
    summary: null,
    errorMessage: '',
  });
}

export function createCompletedState({
  requestId,
  selectedTabId,
  result,
}) {
  return createBaseState({
    requestId,
    selectedTabId,
    status: 'completed',
    stageKey: 'completed',
    stageLabel: 'Parse complete',
    canCopy: true,
    result,
    summary: buildResultSummary(result),
    errorMessage: '',
  });
}

export function createErrorState({
  requestId,
  selectedTabId,
  errorMessage,
}) {
  return createBaseState({
    requestId,
    selectedTabId,
    status: 'error',
    stageKey: 'error',
    stageLabel: 'Parse failed',
    canCopy: false,
    result: null,
    summary: null,
    errorMessage,
  });
}
