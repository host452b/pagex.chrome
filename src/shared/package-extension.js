import {
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

import { zipSync } from 'fflate';

const REQUIRED_ROOT_FILES = [
  'manifest.json',
  'background.js',
  'content.js',
  'popup.html',
  'popup.css',
  'popup.js',
];

const REQUIRED_DIRECTORIES = [
  '_locales',
  'assets/icons',
  'src/popup',
  'src/shared',
];

// Node-only build tooling that lives next to runtime code but must not ship.
const EXCLUDED_FILES = new Set([
  'src/shared/package-extension.js',
]);

function slugifyName(name) {
  if (typeof name !== 'string' || !name.trim()) {
    return 'extension';
  }

  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function ensurePathExists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch (error) {
    return false;
  }
}

async function collectFilesRecursively(projectRoot, relativeDirectory) {
  const directoryPath = path.join(projectRoot, relativeDirectory);
  const directoryEntries = await readdir(directoryPath, {
    withFileTypes: true,
  });
  const files = [];

  for (const directoryEntry of directoryEntries) {
    const relativePath = path.join(relativeDirectory, directoryEntry.name);

    if (directoryEntry.isDirectory()) {
      const nestedFiles = await collectFilesRecursively(projectRoot, relativePath);
      files.push(...nestedFiles);
      continue;
    }

    if (directoryEntry.isFile()) {
      files.push(relativePath);
    }
  }

  return files;
}

export function buildArchiveFileName(manifest) {
  const extensionName = slugifyName(manifest.name || 'extension');
  const version = typeof manifest.version === 'string' && manifest.version.trim()
    ? manifest.version.trim()
    : '0.0.0';

  return `${extensionName}-v${version}.zip`;
}

export async function readManifest(projectRoot) {
  const manifestPath = path.join(projectRoot, 'manifest.json');
  const manifestSource = await readFile(manifestPath, 'utf8');

  return JSON.parse(manifestSource);
}

export async function collectPackageFiles(projectRoot) {
  const files = [];

  for (const relativeFile of REQUIRED_ROOT_FILES) {
    const absolutePath = path.join(projectRoot, relativeFile);
    const exists = await ensurePathExists(absolutePath);

    if (!exists) {
      throw new Error(`Missing required extension file: ${relativeFile}`);
    }

    files.push(relativeFile);
  }

  for (const relativeDirectory of REQUIRED_DIRECTORIES) {
    const absolutePath = path.join(projectRoot, relativeDirectory);
    const exists = await ensurePathExists(absolutePath);

    if (!exists) {
      continue;
    }

    const nestedFiles = await collectFilesRecursively(projectRoot, relativeDirectory);
    files.push(
      ...nestedFiles
        .map((file) => file.split(path.sep).join('/'))
        .filter((file) => !EXCLUDED_FILES.has(file)),
    );
  }

  files.sort((left, right) => {
    return left.localeCompare(right);
  });

  return files;
}

export async function packageExtension(projectRoot = process.cwd()) {
  const manifest = await readManifest(projectRoot);
  const archiveFileName = buildArchiveFileName(manifest);
  const packageFiles = await collectPackageFiles(projectRoot);
  const zipEntries = {};
  const releaseDirectory = path.join(projectRoot, 'release');
  const archivePath = path.join(releaseDirectory, archiveFileName);

  for (const relativeFile of packageFiles) {
    const absolutePath = path.join(projectRoot, relativeFile);
    zipEntries[relativeFile] = await readFile(absolutePath);
  }

  await mkdir(releaseDirectory, { recursive: true });
  await rm(archivePath, { force: true });

  const archiveBuffer = zipSync(zipEntries, {
    level: 9,
  });

  await writeFile(archivePath, archiveBuffer);

  return archivePath;
}
