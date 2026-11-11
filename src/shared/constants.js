export const PAGEX_JOB_KEY = 'pagex.job';
export const PAGEX_RESULT_KEY_PREFIX = 'pagex.result.';
export const PAGEX_SETTINGS_KEY = 'pagex.settings';
export const PAGEX_GUIDE_DISMISSED_KEY = 'pagex.guideDismissed';

export const PAGEX_MESSAGE_TYPES = {
  START_BATCH: 'pagex/start-batch',
  STOP_BATCH: 'pagex/stop-batch',
  // Sent by the popup on open so a worker that died mid-job restarts and
  // marks that job as interrupted.
  PING: 'pagex/ping',
};

// Per-tab pipeline stages, in order. `weight` is the share of a single
// tab's work considered finished once the stage has been reached, and drives
// the popup progress bar.
export const PAGEX_STAGES = Object.freeze({
  queued: { weight: 0 },
  preparing: { weight: 0.05 },
  injecting: { weight: 0.15 },
  collecting: { weight: 0.3 },
  finalizing: { weight: 0.9 },
});

export const PAGEX_BATCH_LIMITS = Object.freeze({
  maxTabs: 20,
  concurrency: 3,
  maxSubFrames: 25,
  // Must exceed the sub-frame hardTimeoutMs plus injection time.
  subFrameTimeoutMs: 11000,
});

// Iframes get smaller budgets than the main frame so a slow embed cannot
// hold up the whole page.
export const PAGEX_SUBFRAME_OPTION_OVERRIDES = Object.freeze({
  expandBudgetMs: 3000,
  scrollBudgetMs: 1500,
  hardTimeoutMs: 8000,
});

export const PAGEX_DEFAULT_SETTINGS = Object.freeze({
  autoDownload: true,
});

export const PAGEX_PARSE_OPTIONS = Object.freeze({
  maxExpandRounds: 3,
  maxClicksPerRound: 24,
  maxTotalClicks: 72,
  enableAutoScroll: true,
  autoScrollPasses: 4,
  clickDelayMs: 120,
  settleDelayMs: 250,
  scrollDelayMs: 180,
  expandBudgetMs: 6000,
  scrollBudgetMs: 3000,
  hardTimeoutMs: 15000,
  maxTextLength: 4000,
  maxAttributeValueLength: 500,
  maxElements: 1600,
  maxResultBytes: 1600000,
});
