import { PAGEX_RESULT_KEY_PREFIX } from './constants.js';
import { compressText, decompressText } from './compression.js';
import { PAGEX_ERROR_CODES, PagexError } from './error-codes.js';
import { formatResultForCopy } from './result-utils.js';

// Extraction results live in chrome.storage.session (memory only, cleared
// when the browser closes). They are stored as the exact JSON file text,
// deflated and base64-encoded, so a whole batch fits in the 10 MB quota.

export function buildResultKey(jobId, tabId) {
  return `${PAGEX_RESULT_KEY_PREFIX}${jobId}.${tabId}`;
}

const FALLBACK_QUOTA_BYTES = 10 * 1024 * 1024;

// Head-room kept free so job-state updates can always be written, even when
// results have filled the session quota.
export const RESULT_RESERVE_BYTES = 512 * 1024;

export async function saveResult(key, result) {
  const encoded = await compressText(formatResultForCopy(result));
  const quota = Number(chrome.storage.session.QUOTA_BYTES) || FALLBACK_QUOTA_BYTES;
  const needed = encoded.length + key.length + 8;

  if (needed > quota - RESULT_RESERVE_BYTES) {
    throw new PagexError(PAGEX_ERROR_CODES.TOO_LARGE, `result is ${encoded.length} bytes compressed`);
  }

  let used = 0;

  try {
    used = await chrome.storage.session.getBytesInUse(null);
  } catch {
    used = 0;
  }

  if (used + needed > quota - RESULT_RESERVE_BYTES) {
    throw new PagexError(PAGEX_ERROR_CODES.STORAGE_FULL, `${used} bytes already in use`);
  }

  await chrome.storage.session.set({ [key]: encoded });
}

export async function loadResultText(key) {
  const stored = await chrome.storage.session.get(key);
  const encoded = stored[key];

  if (typeof encoded !== 'string' || !encoded) {
    throw new Error(`result ${key} is no longer available`);
  }

  return decompressText(encoded);
}

export async function removeResults(keys) {
  const validKeys = (keys || []).filter(
    (key) => typeof key === 'string' && key.startsWith(PAGEX_RESULT_KEY_PREFIX),
  );

  if (validKeys.length > 0) {
    await chrome.storage.session.remove(validKeys);
  }
}
