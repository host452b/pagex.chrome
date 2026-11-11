export function t(key, ...substitutions) {
  try {
    const message = chrome.i18n.getMessage(key, substitutions.map(String));

    return message || key;
  } catch {
    return key;
  }
}

export function applyI18n(root = document) {
  for (const element of root.querySelectorAll('[data-i18n]')) {
    element.textContent = t(element.dataset.i18n);
  }

  for (const element of root.querySelectorAll('[data-i18n-title]')) {
    element.title = t(element.dataset.i18nTitle);
  }

  for (const element of root.querySelectorAll('[data-i18n-aria-label]')) {
    element.setAttribute('aria-label', t(element.dataset.i18nAriaLabel));
  }

  try {
    document.documentElement.lang = chrome.i18n.getUILanguage() || 'en';
  } catch {
    // Keep the static lang attribute.
  }
}
