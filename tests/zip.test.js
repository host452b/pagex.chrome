import test from 'node:test';
import assert from 'node:assert/strict';

import { strFromU8, unzipSync } from 'fflate';

import { crc32, createZip } from '../src/shared/zip.js';

test('crc32 matches the standard check value', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  assert.equal(crc32(new Uint8Array()), 0);
});

test('createZip output is readable by a standard unzip implementation', async () => {
  const big = JSON.stringify({ items: Array.from({ length: 200 }, (_, i) => ({ i, tag: 'div' })) });
  const archive = await createZip([
    { name: 'pagex-example.com-20261111-120000.json', data: big },
    { name: '中文-页面.json', data: '{"title":"你好"}' },
    { name: 'empty.json', data: '' },
  ]);

  const files = unzipSync(archive);

  assert.deepEqual(Object.keys(files).sort(), [
    'empty.json',
    'pagex-example.com-20261111-120000.json',
    '中文-页面.json',
  ]);
  assert.equal(strFromU8(files['pagex-example.com-20261111-120000.json']), big);
  assert.equal(strFromU8(files['中文-页面.json']), '{"title":"你好"}');
  assert.equal(strFromU8(files['empty.json']), '');
});

test('createZip compresses repetitive JSON and can store without compression', async () => {
  const text = '{"tag":"div","styleSummary":{"display":"block"}}'.repeat(500);
  const compressed = await createZip([{ name: 'a.json', data: text }]);
  const stored = await createZip([{ name: 'a.json', data: text }], { compress: false });

  assert.ok(compressed.length < text.length / 5, 'expected deflate to shrink repetitive JSON');
  assert.ok(stored.length > text.length);
  assert.equal(strFromU8(unzipSync(stored)['a.json']), text);
});
