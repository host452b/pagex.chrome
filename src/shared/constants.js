export const PAGEX_STATE_KEY = 'pagex.parseState';

export const PAGEX_MESSAGE_TYPES = {
  START_PARSE: 'pagex/start-parse',
  STOP_PARSE: 'pagex/stop-parse',
};

export const PAGEX_STAGE_LABELS = {
  PREPARING: 'Checking selection',
  INJECTING: 'Opening the page',
  COLLECTING: 'Reading structure',
  INSPECTING: 'Noting frames',
  FINALIZING: 'Composing JSON',
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
