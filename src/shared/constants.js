export const PAGEX_STATE_KEY = 'pagex.parseState';

export const PAGEX_MESSAGE_TYPES = {
  START_PARSE: 'pagex/start-parse',
};

export const PAGEX_STAGE_LABELS = {
  PREPARING: 'Preparing selected tab',
  INJECTING: 'Injecting collector into page',
  COLLECTING: 'Collecting structure, styles, and hidden content',
  INSPECTING: 'Inspecting frame coverage',
  FINALIZING: 'Building final JSON payload',
};

export const PAGEX_PARSE_OPTIONS = Object.freeze({
  maxExpandRounds: 3,
  maxClicksPerRound: 24,
  maxTotalClicks: 72,
  enableAutoScroll: true,
  autoScrollPasses: 4,
  clickDelayMs: 120,
  settleDelayMs: 250,
  scrollDelayMs: 180,
  maxTextLength: 4000,
  maxAttributeValueLength: 500,
  maxElements: 1600,
  maxResultBytes: 1600000,
});
