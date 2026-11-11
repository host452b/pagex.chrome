import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildBatchArchiveName,
  buildCookiesFileName,
  buildPageSlug,
  buildResultFileName,
  dedupeFileNames,
  formatFileTimestamp,
} from '../src/shared/filenames.js';

const date = new Date(2026, 10, 11, 9, 5, 7);

test('formatFileTimestamp uses local time with zero padding', () => {
  assert.equal(formatFileTimestamp(date), '20261111-090507');
});

test('buildPageSlug combines host and the first two path segments', () => {
  assert.equal(
    buildPageSlug('https://news.example.com/world/asia/story?id=1#top'),
    'news.example.com-world-asia',
  );
  assert.equal(buildPageSlug('https://example.com/'), 'example.com');
  assert.equal(buildPageSlug('https://example.com/%E4%B8%AD%E6%96%87/Hello World'), 'example.com-hello-world');
  assert.equal(buildPageSlug('file:///Users/me/Report Final.html'), 'file-report-final.html');
  assert.equal(buildPageSlug('not a url'), 'page');
});

test('result, archive, and cookie file names are filesystem safe', () => {
  assert.equal(
    buildResultFileName('https://example.com/docs', date),
    'pagex-example.com-docs-20261111-090507.json',
  );
  assert.equal(buildBatchArchiveName(date), 'pagex-batch-20261111-090507.zip');
  assert.equal(buildCookiesFileName('https://Sub.Example.com/x'), 'cookies-sub.example.com.txt');
  assert.equal(buildCookiesFileName(''), 'cookies-site.txt');
});

test('dedupeFileNames keeps names unique inside an archive', () => {
  assert.deepEqual(dedupeFileNames(['a.json', 'b.json', 'a.json', 'a.json', 'a-2.json']), [
    'a.json',
    'b.json',
    'a-2.json',
    'a-3.json',
    'a-2-2.json',
  ]);
});
