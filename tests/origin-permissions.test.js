import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildOriginPermissionPattern,
  collectOriginPatterns,
} from '../src/shared/origin-permissions.js';

test('buildOriginPermissionPattern returns requestable origin patterns for web urls', () => {
  assert.equal(
    buildOriginPermissionPattern('https://example.com/docs/page'),
    'https://example.com/*',
  );

  assert.equal(
    buildOriginPermissionPattern('http://localhost:3000/dashboard'),
    'http://localhost:3000/*',
  );
});

test('buildOriginPermissionPattern skips unsupported urls', () => {
  assert.equal(buildOriginPermissionPattern('chrome://extensions/'), '');
  assert.equal(buildOriginPermissionPattern('file:///Users/me/demo.html'), '');
  assert.equal(buildOriginPermissionPattern('not-a-url'), '');
});

test('buildOriginPermissionPattern returns empty for null, undefined, and empty string', () => {
  assert.equal(buildOriginPermissionPattern(null), '');
  assert.equal(buildOriginPermissionPattern(undefined), '');
  assert.equal(buildOriginPermissionPattern(''), '');
});

test('buildOriginPermissionPattern preserves port in the pattern', () => {
  assert.equal(
    buildOriginPermissionPattern('https://app.example.com:8443/page'),
    'https://app.example.com:8443/*',
  );
});

test('collectOriginPatterns dedupes origins and skips unscriptable urls', () => {
  assert.deepEqual(
    collectOriginPatterns([
      'https://a.example/one',
      'https://a.example/two?x=1',
      'http://b.example:8080/',
      'chrome://settings',
      'file:///tmp/a.html',
      '',
    ]),
    ['https://a.example/*', 'http://b.example:8080/*'],
  );
});
