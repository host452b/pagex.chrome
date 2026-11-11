export const PAGEX_ERROR_CODES = Object.freeze({
  NO_URL: 'no-url',
  BROWSER_PAGE: 'browser-page',
  EXTENSION_PAGE: 'extension-page',
  WEB_STORE: 'web-store',
  FILE_ACCESS: 'file-access',
  UNSUPPORTED_SCHEME: 'unsupported-scheme',
  PERMISSION: 'permission',
  TAB_CLOSED: 'tab-closed',
  NAVIGATED: 'navigated',
  ERROR_PAGE: 'error-page',
  TIMEOUT: 'timeout',
  MAIN_FRAME: 'main-frame',
  STORAGE_FULL: 'storage-full',
  TOO_LARGE: 'too-large',
  INTERRUPTED: 'interrupted',
  BUSY: 'busy',
  UNKNOWN: 'unknown',
});

const KNOWN_CODES = new Set(Object.values(PAGEX_ERROR_CODES));

export class PagexError extends Error {
  constructor(code, detail = '') {
    super(detail || code);
    this.name = 'PagexError';
    this.code = KNOWN_CODES.has(code) ? code : PAGEX_ERROR_CODES.UNKNOWN;
  }
}

// Maps raw Chrome / runtime error messages to stable codes the popup can
// explain in plain language.
export function classifyRuntimeError(error) {
  if (error && typeof error.code === 'string' && KNOWN_CODES.has(error.code)) {
    return error.code;
  }

  const message = getErrorText(error).toLowerCase();

  if (!message) {
    return PAGEX_ERROR_CODES.UNKNOWN;
  }

  if (message.includes('no tab with id') || message.includes('tab was closed')) {
    return PAGEX_ERROR_CODES.TAB_CLOSED;
  }

  if (message.includes('extensions gallery cannot be scripted')) {
    return PAGEX_ERROR_CODES.WEB_STORE;
  }

  if (message.includes('showing error page')) {
    return PAGEX_ERROR_CODES.ERROR_PAGE;
  }

  if (message.includes('was removed') || message.includes('no frame with id')) {
    return PAGEX_ERROR_CODES.NAVIGATED;
  }

  if (
    message.includes('cannot access') ||
    message.includes('missing host permission') ||
    message.includes('permission')
  ) {
    return PAGEX_ERROR_CODES.PERMISSION;
  }

  if (message.includes('quota')) {
    return PAGEX_ERROR_CODES.STORAGE_FULL;
  }

  if (message.includes('timed out')) {
    return PAGEX_ERROR_CODES.TIMEOUT;
  }

  if (message.includes('main frame')) {
    return PAGEX_ERROR_CODES.MAIN_FRAME;
  }

  return PAGEX_ERROR_CODES.UNKNOWN;
}

export function getErrorText(error) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error.trim();
  }

  return '';
}
