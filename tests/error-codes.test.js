import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PAGEX_ERROR_CODES,
  PagexError,
  classifyRuntimeError,
} from '../src/shared/error-codes.js';

test('classifyRuntimeError maps Chrome error messages to stable codes', () => {
  const cases = {
    'No tab with id: 12.': PAGEX_ERROR_CODES.TAB_CLOSED,
    'Cannot access contents of the page. Extension manifest must request permission to access the respective host.':
      PAGEX_ERROR_CODES.PERMISSION,
    'The extensions gallery cannot be scripted.': PAGEX_ERROR_CODES.WEB_STORE,
    'Frame with ID 0 is showing error page': PAGEX_ERROR_CODES.ERROR_PAGE,
    'Frame with ID 0 was removed.': PAGEX_ERROR_CODES.NAVIGATED,
    'Session storage quota bytes exceeded. Values were not stored.': PAGEX_ERROR_CODES.STORAGE_FULL,
    'main frame failed: frame collection timed out after 15 s': PAGEX_ERROR_CODES.TIMEOUT,
    'main frame failed: page collector is unavailable on this page': PAGEX_ERROR_CODES.MAIN_FRAME,
    'something odd': PAGEX_ERROR_CODES.UNKNOWN,
  };

  for (const [message, code] of Object.entries(cases)) {
    assert.equal(classifyRuntimeError(new Error(message)), code, message);
  }

  assert.equal(classifyRuntimeError(null), PAGEX_ERROR_CODES.UNKNOWN);
});

test('PagexError carries its code through classification', () => {
  const error = new PagexError(PAGEX_ERROR_CODES.FILE_ACCESS, 'detail');

  assert.equal(classifyRuntimeError(error), PAGEX_ERROR_CODES.FILE_ACCESS);
  assert.equal(new PagexError('made-up').code, PAGEX_ERROR_CODES.UNKNOWN);
});
