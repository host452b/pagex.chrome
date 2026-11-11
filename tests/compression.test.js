import test from 'node:test';
import assert from 'node:assert/strict';

import {
  base64ToBytes,
  bytesToBase64,
  compressText,
  decompressText,
} from '../src/shared/compression.js';

test('compressText round-trips unicode JSON text', async () => {
  const text = JSON.stringify({ title: '页面标题 — émoji 🚀', items: Array(500).fill('repeat') }, null, 2);
  const encoded = await compressText(text);

  assert.equal(typeof encoded, 'string');
  assert.ok(encoded.length < text.length / 3);
  assert.equal(await decompressText(encoded), text);
});

test('base64 helpers handle buffers larger than one chunk', () => {
  const bytes = new Uint8Array(100000).map((_, index) => index % 256);

  assert.deepEqual(base64ToBytes(bytesToBase64(bytes)), bytes);
});
