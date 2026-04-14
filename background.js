import {
  PAGEX_MESSAGE_TYPES,
  PAGEX_PARSE_OPTIONS,
  PAGEX_STAGE_LABELS,
  PAGEX_STATE_KEY,
} from './src/shared/constants.js';
import {
  buildParseResult,
  createCompletedState,
  createErrorState,
  createRunningState,
} from './src/shared/parse-state.js';
import { createParseSingleFlight } from './src/shared/parse-single-flight.js';

const parseSingleFlight = createParseSingleFlight();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== 'object') {
    return false;
  }

  if (message.type === PAGEX_MESSAGE_TYPES.START_PARSE) {
    void handleStartParse(message.tabId)
      .then((response) => {
        sendResponse(response);
      })
      .catch(async (error) => {
        const requestId = crypto.randomUUID();
        const errorMessage = getErrorMessage(error);

        await writeState(
          createErrorState({
            requestId,
            selectedTabId: message.tabId,
            errorMessage,
          }),
        );

        sendResponse({
          ok: false,
          requestId,
          errorMessage,
        });
      });

    return true;
  }

  return false;
});

async function handleStartParse(tabId) {
  if (!Number.isInteger(tabId)) {
    return {
      ok: false,
      requestId: '',
      errorMessage: 'Please choose a valid tab before parsing.',
    };
  }

  const requestId = crypto.randomUUID();
  const startAttempt = parseSingleFlight.start({
    requestId,
    tabId,
  });

  if (!startAttempt.ok) {
    return {
      ok: false,
      requestId,
      errorMessage:
        'Another parse is already running. Wait for it to finish before starting a new one.',
    };
  }

  try {
    await ensureTabCanBeParsed(tabId);
    await writeStageState({
      requestId,
      selectedTabId: tabId,
      stageKey: 'preparing',
      stageLabel: PAGEX_STAGE_LABELS.PREPARING,
    });

    await writeStageState({
      requestId,
      selectedTabId: tabId,
      stageKey: 'injecting',
      stageLabel: PAGEX_STAGE_LABELS.INJECTING,
    });

    await chrome.scripting.executeScript({
      target: {
        tabId,
        allFrames: true,
      },
      files: ['content.js'],
    });

    await writeStageState({
      requestId,
      selectedTabId: tabId,
      stageKey: 'collecting',
      stageLabel: PAGEX_STAGE_LABELS.COLLECTING,
    });

    const accessibleFrameResults = await chrome.scripting.executeScript({
      target: {
        tabId,
        allFrames: true,
      },
      func: async (options) => {
        try {
          if (
            !globalThis.pagexCollector ||
            typeof globalThis.pagexCollector.collectPage !== 'function'
          ) {
            throw new Error('page collector is unavailable on this page');
          }

          const frameTimeoutMs = 15000;
          const result = await Promise.race([
            globalThis.pagexCollector.collectPage(options),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('frame collection timed out after 15 s')), frameTimeoutMs),
            ),
          ]);

          return {
            ok: true,
            result,
          };
        } catch (error) {
          let errorMessage = 'frame collection failed';

          if (error instanceof Error && error.message) {
            errorMessage = error.message;
          }

          return {
            ok: false,
            frameUrl: window.location.href,
            errorMessage,
          };
        }
      },
      args: [PAGEX_PARSE_OPTIONS],
    });

    await writeStageState({
      requestId,
      selectedTabId: tabId,
      stageKey: 'inspecting',
      stageLabel: PAGEX_STAGE_LABELS.INSPECTING,
    });

    const discoveredFrames = await getDiscoveredFrames(tabId);

    await writeStageState({
      requestId,
      selectedTabId: tabId,
      stageKey: 'finalizing',
      stageLabel: PAGEX_STAGE_LABELS.FINALIZING,
    });

    const result = buildParseResult({
      requestId,
      selectedTabId: tabId,
      accessibleFrameResults,
      discoveredFrames,
    });

    if (!result.hasSuccessfulMainFrame) {
      throw new Error(result.mainFrameErrorMessage);
    }

    await writeState(
      createCompletedState({
        requestId,
        selectedTabId: tabId,
        result,
      }),
    );

    return {
      ok: true,
      requestId,
    };
  } catch (error) {
    const errorMessage = getErrorMessage(error);

    await writeState(
      createErrorState({
        requestId,
        selectedTabId: tabId,
        errorMessage,
      }),
    );

    return {
      ok: false,
      requestId,
      errorMessage,
    };
  } finally {
    parseSingleFlight.finish(requestId);
  }
}

async function ensureTabCanBeParsed(tabId) {
  const tab = await chrome.tabs.get(tabId);
  const url = tab.url || '';

  if (!url) {
    throw new Error('The selected tab does not expose a scriptable URL yet.');
  }

  if (url.startsWith('chrome://')) {
    throw new Error('Chrome internal pages cannot be parsed.');
  }

  if (url.startsWith('chrome-extension://')) {
    throw new Error('Extension pages cannot be parsed.');
  }

  if (url.startsWith('edge://')) {
    throw new Error('Browser internal pages cannot be parsed.');
  }

  if (url.startsWith('about:')) {
    throw new Error('This browser page cannot be parsed.');
  }

  if (url.startsWith('file://')) {
    throw new Error('Local file pages cannot be parsed without file access permission.');
  }

  if (url.startsWith('devtools://')) {
    throw new Error('Developer tools pages cannot be parsed.');
  }

  return tab;
}

async function getDiscoveredFrames(tabId) {
  try {
    const frames = await chrome.webNavigation.getAllFrames({ tabId });

    if (Array.isArray(frames)) {
      return frames;
    }
  } catch (error) {
    return [];
  }

  return [];
}

async function writeStageState({
  requestId,
  selectedTabId,
  stageKey,
  stageLabel,
}) {
  const state = createRunningState({
    requestId,
    selectedTabId,
    stageKey,
    stageLabel,
  });

  await writeState(state);
}

async function writeState(state) {
  await chrome.storage.session.set({
    [PAGEX_STATE_KEY]: state,
  });
}

function getErrorMessage(error) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }

  return 'An unexpected parsing error occurred.';
}

chrome.tabs.onRemoved.addListener(async (tabId) => {
  try {
    const stored = await chrome.storage.session.get(PAGEX_STATE_KEY);
    const parseState = stored[PAGEX_STATE_KEY];

    if (parseState && parseState.selectedTabId === tabId) {
      await chrome.storage.session.remove(PAGEX_STATE_KEY);
    }
  } catch {
    // Storage access may fail during shutdown — safe to ignore.
  }
});
