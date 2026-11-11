import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { unzipSync, strFromU8 } from 'fflate';

import {
  buildArchiveFileName,
  collectPackageFiles,
  packageExtension,
} from '../src/shared/package-extension.js';

async function createFixtureProject() {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'pagex-package-'));

  await mkdir(path.join(projectRoot, 'src', 'shared'), { recursive: true });
  await mkdir(path.join(projectRoot, 'src', 'popup'), { recursive: true });
  await mkdir(path.join(projectRoot, '_locales', 'en'), { recursive: true });
  await mkdir(path.join(projectRoot, 'assets', 'icons'), { recursive: true });
  await mkdir(path.join(projectRoot, 'tests'), { recursive: true });
  await mkdir(path.join(projectRoot, 'fixtures'), { recursive: true });

  await writeFile(
    path.join(projectRoot, 'manifest.json'),
    JSON.stringify(
      {
        name: 'Pagex',
        version: '0.1.0',
        manifest_version: 3,
        background: {
          service_worker: 'background.js',
          type: 'module',
        },
        action: {
          default_popup: 'popup.html',
        },
      },
      null,
      2,
    ),
  );

  await writeFile(path.join(projectRoot, 'background.js'), 'export const bg = true;\n');
  await writeFile(path.join(projectRoot, 'content.js'), 'globalThis.pagex = true;\n');
  await writeFile(path.join(projectRoot, 'popup.html'), '<!doctype html><html></html>\n');
  await writeFile(path.join(projectRoot, 'popup.css'), 'body { color: white; }\n');
  await writeFile(path.join(projectRoot, 'popup.js'), 'console.log("popup");\n');
  await writeFile(path.join(projectRoot, 'assets', 'icons', 'pagex-16.png'), 'icon16\n');
  await writeFile(path.join(projectRoot, 'assets', 'icons', 'pagex-32.png'), 'icon32\n');
  await writeFile(path.join(projectRoot, 'README.md'), '# ignore me\n');
  await writeFile(path.join(projectRoot, 'package.json'), '{"name":"ignore"}\n');
  await writeFile(path.join(projectRoot, 'tests', 'ignore.test.js'), 'ignored\n');
  await writeFile(path.join(projectRoot, 'fixtures', 'ignore.html'), 'ignored\n');
  await writeFile(
    path.join(projectRoot, 'src', 'shared', 'constants.js'),
    'export const version = "0.1.0";\n',
  );
  await writeFile(
    path.join(projectRoot, 'src', 'shared', 'package-extension.js'),
    'import "node:fs";\n',
  );
  await writeFile(path.join(projectRoot, 'src', 'popup', 'i18n.js'), 'export {};\n');
  await writeFile(
    path.join(projectRoot, '_locales', 'en', 'messages.json'),
    '{"extDescription":{"message":"x"}}\n',
  );

  return projectRoot;
}

test('buildArchiveFileName uses manifest name and version', () => {
  assert.equal(
    buildArchiveFileName({
      name: 'Pagex',
      version: '0.1.0',
    }),
    'pagex-v0.1.0.zip',
  );
});

test('collectPackageFiles keeps only extension runtime files', async () => {
  const projectRoot = await createFixtureProject();

  try {
    const files = await collectPackageFiles(projectRoot);

    assert.deepEqual(files, [
      '_locales/en/messages.json',
      'assets/icons/pagex-16.png',
      'assets/icons/pagex-32.png',
      'background.js',
      'content.js',
      'manifest.json',
      'popup.css',
      'popup.html',
      'popup.js',
      'src/popup/i18n.js',
      'src/shared/constants.js',
    ]);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('packageExtension writes a release zip with runtime files only', async () => {
  const projectRoot = await createFixtureProject();

  try {
    const archivePath = await packageExtension(projectRoot);
    const archiveStat = await stat(archivePath);

    assert.ok(archiveStat.isFile(), 'expected a generated zip archive');

    const archiveBuffer = await readFile(archivePath);
    const extracted = unzipSync(new Uint8Array(archiveBuffer));

    assert.equal(strFromU8(extracted['manifest.json']).includes('"name": "Pagex"'), true);
    assert.equal(strFromU8(extracted['assets/icons/pagex-16.png']), 'icon16\n');
    assert.equal(strFromU8(extracted['background.js']), 'export const bg = true;\n');
    assert.equal('README.md' in extracted, false);
    assert.equal('tests/ignore.test.js' in extracted, false);
    assert.equal('fixtures/ignore.html' in extracted, false);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
