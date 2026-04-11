import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

test('manifest requests broad site access only through optional host permissions', async () => {
  const manifestPath = path.join(process.cwd(), 'manifest.json');
  const manifestSource = await readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestSource);

  const hostPermissions = [];
  const optionalHostPermissions = [];

  if (Array.isArray(manifest.optional_host_permissions)) {
    optionalHostPermissions.push(...manifest.optional_host_permissions);
  }

  assert.equal(hostPermissions.length, 0);
  assert.ok(
    optionalHostPermissions.includes('<all_urls>'),
    'expected optional_host_permissions to include <all_urls>',
  );
});
