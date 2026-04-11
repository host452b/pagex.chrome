import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canCopyForSelectedTab,
  getResultMismatchMessage,
  isParseButtonDisabled,
} from '../src/shared/popup-state.js';

test('canCopyForSelectedTab only allows copying the currently parsed tab result', () => {
  const parseState = {
    canCopy: true,
    selectedTabId: 21,
    result: { frames: [] },
  };

  assert.equal(canCopyForSelectedTab(parseState, 21), true);
  assert.equal(canCopyForSelectedTab(parseState, 99), false);
});

test('getResultMismatchMessage warns when the selected tab differs from the stored result', () => {
  const parseState = {
    selectedTabId: 21,
  };

  assert.equal(getResultMismatchMessage(parseState, 21), '');
  assert.match(
    getResultMismatchMessage(parseState, 99),
    /Select Parse again/,
  );
});

test('isParseButtonDisabled respects local starting state and background running state', () => {
  assert.equal(
    isParseButtonDisabled({
      hasTabs: true,
      isStartingParse: true,
      parseState: null,
    }),
    true,
  );

  assert.equal(
    isParseButtonDisabled({
      hasTabs: true,
      isStartingParse: false,
      parseState: {
        status: 'running',
      },
    }),
    true,
  );

  assert.equal(
    isParseButtonDisabled({
      hasTabs: true,
      isStartingParse: false,
      parseState: {
        status: 'completed',
      },
    }),
    false,
  );
});
