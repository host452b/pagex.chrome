import { PAGEX_ERROR_CODES } from './error-codes.js';

const BROWSER_PAGE_PREFIXES = [
  'chrome://',
  'chrome-untrusted://',
  'chrome-search://',
  'edge://',
  'about:',
  'devtools://',
  'view-source:',
];

const WEB_STORE_PREFIXES = [
  'https://chromewebstore.google.com/',
  'https://chrome.google.com/webstore',
];

// Decides up front whether Chrome will let the extension script a tab, so the
// popup can grey out pages that are guaranteed to fail and say why.
export function classifyTabUrl(url, { fileAccessAllowed = false } = {}) {
  if (typeof url !== 'string' || !url.trim()) {
    return { ok: false, code: PAGEX_ERROR_CODES.NO_URL };
  }

  const value = url.trim();

  if (BROWSER_PAGE_PREFIXES.some((prefix) => value.startsWith(prefix))) {
    return { ok: false, code: PAGEX_ERROR_CODES.BROWSER_PAGE };
  }

  if (value.startsWith('chrome-extension://')) {
    return { ok: false, code: PAGEX_ERROR_CODES.EXTENSION_PAGE };
  }

  if (WEB_STORE_PREFIXES.some((prefix) => value.startsWith(prefix))) {
    return { ok: false, code: PAGEX_ERROR_CODES.WEB_STORE };
  }

  if (value.startsWith('file://')) {
    if (fileAccessAllowed) {
      return { ok: true, code: '' };
    }

    return { ok: false, code: PAGEX_ERROR_CODES.FILE_ACCESS };
  }

  if (value.startsWith('http://') || value.startsWith('https://')) {
    return { ok: true, code: '' };
  }

  return { ok: false, code: PAGEX_ERROR_CODES.UNSUPPORTED_SCHEME };
}
