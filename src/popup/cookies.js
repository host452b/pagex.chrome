import { formatCookiesTxt } from '../shared/cookies-utils.js';

export async function collectCookieExport(tab) {
  const cookies = await chrome.cookies.getAll({ url: tab.url });
  let storage = null;

  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.tabId },
      func: () => {
        const read = (area) => {
          const entries = {};

          for (let index = 0; index < area.length; index += 1) {
            const key = area.key(index);
            entries[key] = area.getItem(key);
          }

          return entries;
        };

        return { localStorage: read(localStorage), sessionStorage: read(sessionStorage) };
      },
    });

    storage = result;
  } catch {
    // Restricted pages: cookies still export without storage.
  }

  const storageCount = storage
    ? Object.keys(storage.localStorage || {}).length +
      Object.keys(storage.sessionStorage || {}).length
    : 0;

  return {
    text: formatCookiesTxt(cookies, storage),
    cookieCount: cookies.length,
    storageCount,
  };
}
