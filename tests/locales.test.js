import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), 'utf8'));
}

async function readSourceFiles() {
  const files = ['popup.html', 'popup.js'];

  for (const name of await readdir(path.join(root, 'src', 'popup'))) {
    files.push(path.join('src', 'popup', name));
  }

  return Promise.all(files.map((file) => readFile(path.join(root, file), 'utf8')));
}

test('en and zh_CN define the same message keys and placeholders', async () => {
  const en = await readJson('_locales/en/messages.json');
  const zh = await readJson('_locales/zh_CN/messages.json');

  assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort());

  for (const key of Object.keys(en)) {
    assert.ok(en[key].message.trim(), `en.${key} is empty`);
    assert.ok(zh[key].message.trim(), `zh_CN.${key} is empty`);
    assert.deepEqual(
      Object.keys(zh[key].placeholders || {}).sort(),
      Object.keys(en[key].placeholders || {}).sort(),
      `placeholder mismatch for ${key}`,
    );

    for (const name of Object.keys(en[key].placeholders || {})) {
      assert.ok(en[key].message.includes(`$${name.toUpperCase()}$`), `en.${key} misses $${name}$`);
      assert.ok(zh[key].message.includes(`$${name.toUpperCase()}$`), `zh_CN.${key} misses $${name}$`);
    }
  }
});

test('every message key referenced by the popup exists', async () => {
  const en = await readJson('_locales/en/messages.json');
  const sources = (await readSourceFiles()).join('\n');
  const referenced = new Set();

  for (const match of sources.matchAll(/data-i18n(?:-title|-aria-label)?="([A-Za-z0-9_]+)"/g)) {
    referenced.add(match[1]);
  }

  for (const match of sources.matchAll(/\bt\(\s*'([A-Za-z0-9_]+)'/g)) {
    referenced.add(match[1]);
  }

  for (const match of sources.matchAll(/:\s*'((?:err|chip)[A-Za-z0-9]+)'/g)) {
    referenced.add(match[1]);
  }

  assert.ok(referenced.size > 40, 'expected to find message references');

  for (const key of referenced) {
    assert.ok(key in en, `missing message key: ${key}`);
  }
});

test('manifest localizes its description through default_locale', async () => {
  const manifest = await readJson('manifest.json');
  const en = await readJson('_locales/en/messages.json');

  assert.equal(manifest.default_locale, 'en');
  assert.equal(manifest.name, 'Pagex');
  assert.equal(manifest.description, '__MSG_extDescription__');
  assert.ok(en.extDescription.message.length <= 132, 'Web Store summary limit is 132 characters');
});
