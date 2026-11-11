import test from 'node:test';
import assert from 'node:assert/strict';

import { PAGEX_ERROR_CODES } from '../src/shared/error-codes.js';
import { classifyTabUrl } from '../src/shared/tab-eligibility.js';

test('classifyTabUrl accepts regular web pages', () => {
  assert.equal(classifyTabUrl('https://example.com/a').ok, true);
  assert.equal(classifyTabUrl('http://localhost:3000').ok, true);
});

test('classifyTabUrl rejects pages Chrome never lets extensions script', () => {
  const cases = {
    '': PAGEX_ERROR_CODES.NO_URL,
    'chrome://settings': PAGEX_ERROR_CODES.BROWSER_PAGE,
    'about:blank': PAGEX_ERROR_CODES.BROWSER_PAGE,
    'edge://flags': PAGEX_ERROR_CODES.BROWSER_PAGE,
    'view-source:https://example.com': PAGEX_ERROR_CODES.BROWSER_PAGE,
    'chrome-extension://abc/popup.html': PAGEX_ERROR_CODES.EXTENSION_PAGE,
    'https://chromewebstore.google.com/detail/x': PAGEX_ERROR_CODES.WEB_STORE,
    'https://chrome.google.com/webstore/detail/x': PAGEX_ERROR_CODES.WEB_STORE,
    'data:text/html,hi': PAGEX_ERROR_CODES.UNSUPPORTED_SCHEME,
  };

  for (const [url, code] of Object.entries(cases)) {
    assert.deepEqual(classifyTabUrl(url), { ok: false, code }, url);
  }
});

test('classifyTabUrl allows file pages only with file access', () => {
  assert.equal(classifyTabUrl('file:///tmp/a.html').code, PAGEX_ERROR_CODES.FILE_ACCESS);
  assert.equal(classifyTabUrl('file:///tmp/a.html', { fileAccessAllowed: true }).ok, true);
});
