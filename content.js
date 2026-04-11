(function attachPagexCollector() {
  const collectorVersion = '0.1.0';

  if (
    globalThis.pagexCollector &&
    globalThis.pagexCollector.version === collectorVersion
  ) {
    return;
  }

  const defaultOptions = {
    maxExpandRounds: 3,
    maxClicksPerRound: 24,
    maxTotalClicks: 72,
    enableAutoScroll: true,
    autoScrollPasses: 4,
    clickDelayMs: 120,
    settleDelayMs: 250,
    scrollDelayMs: 180,
    maxTextLength: 4000,
    maxAttributeValueLength: 500,
    maxElements: 1600,
    maxResultBytes: 1600000,
  };

  const styleFields = [
    'display',
    'visibility',
    'position',
    'zIndex',
    'opacity',
    'color',
    'backgroundColor',
    'fontSize',
    'fontWeight',
    'lineHeight',
    'textAlign',
    'width',
    'height',
  ];

  const expandKeywords =
    /(expand|show more|read more|view more|details|disclosure|accordion|toggle|spoiler|more|展开|更多|显示更多|查看全部|阅读更多)/i;
  const dangerousKeywords =
    /(delete|remove|buy|pay|purchase|checkout|login|log in|sign in|submit|download|install|confirm|unsubscribe|remove account|delete account)/i;
  const safeAttributeNames = new Set([
    'id',
    'class',
    'role',
    'name',
    'type',
    'href',
    'src',
    'alt',
    'title',
    'placeholder',
    'for',
    'tabindex',
    'data-toggle',
    'data-bs-toggle',
    'data-target',
    'data-bs-target',
    'data-testid',
    'data-test-id',
    'data-qa',
  ]);
  const sensitiveAttributePattern =
    /(token|nonce|auth|cookie|session|csrf|xsrf|secret|password|signature|credential|bearer|api[-_]?key)/i;

  function mergeOptions(overrides) {
    const merged = { ...defaultOptions };

    if (overrides && typeof overrides === 'object') {
      Object.assign(merged, overrides);
    }

    return merged;
  }

  function sleep(delayMs) {
    if (!Number.isFinite(delayMs) || delayMs <= 0) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      setTimeout(resolve, delayMs);
    });
  }

  function normalizeWhitespace(value) {
    if (typeof value !== 'string') {
      return '';
    }

    return value.replace(/\s+/g, ' ').trim();
  }

  function limitText(value, maxLength, warnings, label) {
    const normalized = normalizeWhitespace(value);

    if (!normalized) {
      return '';
    }

    if (!Number.isFinite(maxLength) || normalized.length <= maxLength) {
      return normalized;
    }

    pushWarning(warnings, `${label} was truncated`);

    return normalized.slice(0, maxLength);
  }

  function pushWarning(warnings, message) {
    if (!Array.isArray(warnings)) {
      return;
    }

    if (!warnings.includes(message)) {
      warnings.push(message);
    }
  }

  function estimateValueSize(value) {
    if (value === null || value === undefined) {
      return 0;
    }

    if (typeof value === 'string') {
      return value.length;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value).length;
    }

    if (Array.isArray(value)) {
      let total = 2;

      for (const item of value) {
        total += estimateValueSize(item);
        total += 1;
      }

      return total;
    }

    if (typeof value === 'object') {
      let total = 2;

      for (const [key, nestedValue] of Object.entries(value)) {
        total += key.length;
        total += estimateValueSize(nestedValue);
        total += 2;
      }

      return total;
    }

    return 0;
  }

  function getStyleSummary(element) {
    const summary = {};
    const computedStyle = window.getComputedStyle(element);

    for (const field of styleFields) {
      summary[field] = computedStyle[field];
    }

    return summary;
  }

  function shouldKeepAttribute(attributeName) {
    if (safeAttributeNames.has(attributeName)) {
      return true;
    }

    if (attributeName.startsWith('aria-')) {
      return true;
    }

    return false;
  }

  function shouldRedactAttribute(attributeName) {
    if (sensitiveAttributePattern.test(attributeName)) {
      return true;
    }

    return false;
  }

  function sanitizeUrlAttributeValue(value) {
    if (typeof value !== 'string' || !value) {
      return value;
    }

    if (value.startsWith('#')) {
      return value;
    }

    if (value.startsWith('data:')) {
      return 'data:[redacted]';
    }

    if (value.startsWith('blob:')) {
      return 'blob:[redacted]';
    }

    let parsedUrl;

    try {
      parsedUrl = new URL(value, window.location.href);
    } catch (error) {
      return value;
    }

    parsedUrl.search = '';
    parsedUrl.hash = '';

    return parsedUrl.toString();
  }

  function getAttributes(element, options, warnings, label) {
    const attributes = {};

    for (const attribute of element.attributes) {
      const attributeName = attribute.name.toLowerCase();

      if (!shouldKeepAttribute(attributeName)) {
        continue;
      }

      let value = attribute.value;

      if (shouldRedactAttribute(attributeName)) {
        value = '[redacted]';
      }

      if (attributeName === 'href' || attributeName === 'src') {
        value = sanitizeUrlAttributeValue(value);
      }

      if (
        Number.isFinite(options.maxAttributeValueLength) &&
        value.length > options.maxAttributeValueLength
      ) {
        pushWarning(warnings, `${label} attribute ${attribute.name} was truncated`);
        value = value.slice(0, options.maxAttributeValueLength);
      }

      attributes[attribute.name] = value;
    }

    return attributes;
  }

  function getDirectText(element, options, warnings, label) {
    const textParts = [];

    for (const childNode of element.childNodes) {
      if (childNode.nodeType === Node.TEXT_NODE) {
        const text = normalizeWhitespace(childNode.textContent || '');

        if (text) {
          textParts.push(text);
        }
      }
    }

    return limitText(textParts.join(' '), options.maxTextLength, warnings, `${label} directText`);
  }

  function hasStructuredChildren(element) {
    if (element.children.length > 0) {
      return true;
    }

    if (element.shadowRoot && element.shadowRoot.children.length > 0) {
      return true;
    }

    return false;
  }

  function getTextFields(element, options, warnings, label) {
    const directText = getDirectText(element, options, warnings, label);
    let text = directText;

    if (!hasStructuredChildren(element)) {
      text = limitText(
        element.textContent || '',
        options.maxTextLength,
        warnings,
        `${label} text`,
      );
    }

    return {
      directText,
      text,
    };
  }

  function getElementRect(element) {
    const rect = element.getBoundingClientRect();

    return {
      x: Number(rect.x) || 0,
      y: Number(rect.y) || 0,
      width: Number(rect.width) || 0,
      height: Number(rect.height) || 0,
      top: Number(rect.top) || 0,
      left: Number(rect.left) || 0,
      bottom: Number(rect.bottom) || 0,
      right: Number(rect.right) || 0,
    };
  }

  function isVisibleElement(element) {
    if (element.hidden) {
      return false;
    }

    const computedStyle = window.getComputedStyle(element);

    if (computedStyle.display === 'none') {
      return false;
    }

    if (computedStyle.visibility === 'hidden') {
      return false;
    }

    if (computedStyle.opacity === '0') {
      return false;
    }

    const rect = element.getBoundingClientRect();

    if (rect.width <= 0 || rect.height <= 0) {
      return false;
    }

    return true;
  }

  function escapeSelectorToken(value) {
    if (globalThis.CSS && typeof globalThis.CSS.escape === 'function') {
      return globalThis.CSS.escape(value);
    }

    return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }

  function buildSelectorPart(element) {
    let part = element.tagName.toLowerCase();

    if (element.id) {
      return `#${escapeSelectorToken(element.id)}`;
    }

    if (element.classList && element.classList.length > 0) {
      const classTokens = Array.from(element.classList).slice(0, 2);

      if (classTokens.length > 0) {
        part += `.${classTokens.map(escapeSelectorToken).join('.')}`;
      }
    }

    const parent = element.parentElement;

    if (!parent) {
      return part;
    }

    let position = 0;
    let siblingCount = 0;

    for (const sibling of parent.children) {
      if (sibling.tagName === element.tagName) {
        siblingCount += 1;
        position += 1;
      }

      if (sibling === element) {
        break;
      }
    }

    if (siblingCount > 1 && position > 0) {
      part += `:nth-of-type(${position})`;
    }

    return part;
  }

  function buildSelector(element) {
    if (!(element instanceof Element)) {
      return '';
    }

    if (element.id) {
      return `#${escapeSelectorToken(element.id)}`;
    }

    const parts = [];
    let current = element;
    let depth = 0;

    while (current && current.nodeType === Node.ELEMENT_NODE && depth < 7) {
      parts.unshift(buildSelectorPart(current));

      if (current.id) {
        break;
      }

      current = current.parentElement;
      depth += 1;
    }

    return parts.join(' > ');
  }

  function escapeXPathValue(value) {
    return String(value).replace(/"/g, '\\"');
  }

  function buildXPath(element) {
    if (!(element instanceof Element)) {
      return '';
    }

    if (element.id) {
      return `//*[@id="${escapeXPathValue(element.id)}"]`;
    }

    const parts = [];
    let current = element;

    while (current && current.nodeType === Node.ELEMENT_NODE) {
      let index = 1;
      let sibling = current.previousElementSibling;

      while (sibling) {
        if (sibling.tagName === current.tagName) {
          index += 1;
        }

        sibling = sibling.previousElementSibling;
      }

      parts.unshift(`${current.tagName.toLowerCase()}[${index}]`);
      current = current.parentElement;
    }

    return `/${parts.join('/')}`;
  }

  function getElementLabel(element) {
    const labelSources = [];
    const ariaLabel = element.getAttribute('aria-label');
    const title = element.getAttribute('title');
    const text = element.textContent;

    if (ariaLabel) {
      labelSources.push(ariaLabel);
    }

    if (title) {
      labelSources.push(title);
    }

    if (text) {
      labelSources.push(text);
    }

    return normalizeWhitespace(labelSources.join(' '));
  }

  function isEditableElement(element) {
    const tagName = element.tagName.toLowerCase();

    if (element.isContentEditable) {
      return true;
    }

    if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
      return true;
    }

    return false;
  }

  function getElementType(element) {
    if (typeof element.type === 'string' && element.type) {
      return element.type.toLowerCase();
    }

    const type = element.getAttribute('type');

    if (!type) {
      return '';
    }

    return type.toLowerCase();
  }

  function hasAssociatedForm(element) {
    if ('form' in element && element.form) {
      return true;
    }

    const parentForm = element.closest('form');

    if (parentForm) {
      return true;
    }

    return false;
  }

  function isUnsafeFormControl(element) {
    const tagName = element.tagName.toLowerCase();

    if (!hasAssociatedForm(element)) {
      return false;
    }

    if (tagName === 'button') {
      if (getElementType(element) === 'button') {
        return false;
      }

      return true;
    }

    if (tagName === 'input' || tagName === 'select' || tagName === 'textarea') {
      return true;
    }

    return false;
  }

  function getControlledElement(element) {
    const ariaControls = element.getAttribute('aria-controls');
    const candidateSelectors = [];

    if (ariaControls) {
      const controlIds = ariaControls
        .split(/\s+/)
        .map((value) => value.trim())
        .filter(Boolean);

      for (const controlId of controlIds) {
        candidateSelectors.push(`#${controlId}`);
      }
    }

    const dataTarget = element.getAttribute('data-target');

    if (dataTarget) {
      candidateSelectors.push(dataTarget);
    }

    const dataBsTarget = element.getAttribute('data-bs-target');

    if (dataBsTarget) {
      candidateSelectors.push(dataBsTarget);
    }

    const href = element.getAttribute('href');

    if (href && href.startsWith('#')) {
      candidateSelectors.push(href);
    }

    for (const selector of candidateSelectors) {
      if (!selector || !selector.startsWith('#') || selector.length <= 1) {
        continue;
      }

      const controlledElement = document.getElementById(selector.slice(1));

      if (controlledElement) {
        return controlledElement;
      }
    }

    return null;
  }

  function isControlledElementCollapsed(element) {
    const controlledElement = getControlledElement(element);

    if (!controlledElement) {
      return false;
    }

    if (controlledElement.hidden) {
      return true;
    }

    if (controlledElement.getAttribute('aria-hidden') === 'true') {
      return true;
    }

    const computedStyle = window.getComputedStyle(controlledElement);

    if (computedStyle.display === 'none') {
      return true;
    }

    if (computedStyle.visibility === 'hidden') {
      return true;
    }

    const rect = controlledElement.getBoundingClientRect();

    if (rect.width <= 0 || rect.height <= 0) {
      return true;
    }

    return false;
  }

  function hasStructuredDisclosureSignal(element) {
    const tagName = element.tagName.toLowerCase();
    const role = (element.getAttribute('role') || '').toLowerCase();
    const ariaExpanded = element.getAttribute('aria-expanded');
    const dataToggle =
      (element.getAttribute('data-toggle') || element.getAttribute('data-bs-toggle') || '')
        .toLowerCase();

    if (tagName === 'summary') {
      return true;
    }

    if (ariaExpanded === 'false') {
      return true;
    }

    if (role === 'tab' && element.getAttribute('aria-selected') === 'false') {
      return true;
    }

    if (dataToggle === 'collapse' && isControlledElementCollapsed(element)) {
      return true;
    }

    if (isControlledElementCollapsed(element)) {
      return true;
    }

    return false;
  }

  function isSafeFragmentDisclosureLink(element) {
    if (element.tagName.toLowerCase() !== 'a') {
      return false;
    }

    const href = element.getAttribute('href') || '';

    if (!href.startsWith('#')) {
      return false;
    }

    if (href.length <= 1 && !hasStructuredDisclosureSignal(element)) {
      return false;
    }

    if (!hasStructuredDisclosureSignal(element)) {
      return false;
    }

    return true;
  }

  function isDangerousControl(element, label) {
    const tagName = element.tagName.toLowerCase();
    const controlType = getElementType(element);
    const associatedForm = hasAssociatedForm(element);

    if (isUnsafeFormControl(element)) {
      return true;
    }

    if (dangerousKeywords.test(label)) {
      return true;
    }

    if (tagName === 'button') {
      if (
        associatedForm &&
        (controlType === 'submit' || controlType === 'reset')
      ) {
        return true;
      }
    }

    if (tagName === 'input') {
      if (
        associatedForm &&
        controlType === 'submit' ||
        associatedForm &&
        controlType === 'reset' ||
        controlType === 'file' ||
        controlType === 'password' ||
        controlType === 'checkbox' ||
        controlType === 'radio'
      ) {
        return true;
      }
    }

    if (tagName === 'a') {
      const href = element.getAttribute('href') || '';

      if (isSafeFragmentDisclosureLink(element)) {
        return false;
      }

      if (href.startsWith('javascript:')) {
        return true;
      }

      if (href) {
        return true;
      }
    }

    return false;
  }

  function hasExpandableMarker(element, label) {
    const tagName = element.tagName.toLowerCase();
    const className =
      typeof element.className === 'string' ? element.className.toLowerCase() : '';
    const id = (element.id || '').toLowerCase();
    const ariaExpanded = element.getAttribute('aria-expanded');
    const ariaControls = element.getAttribute('aria-controls');
    const role = (element.getAttribute('role') || '').toLowerCase();
    const dataToggle =
      (element.getAttribute('data-toggle') || element.getAttribute('data-bs-toggle') || '')
        .toLowerCase();

    if (tagName === 'summary') {
      const ownerDetails = element.closest('details');

      if (ownerDetails && ownerDetails.open) {
        return false;
      }

      return true;
    }

    if (ariaExpanded === 'false') {
      return true;
    }

    if (role === 'tab' && element.getAttribute('aria-selected') === 'false') {
      return true;
    }

    if (dataToggle === 'collapse' && isControlledElementCollapsed(element)) {
      return true;
    }

    const markerText = `${className} ${id}`;
    const hasCollapsedTarget = isControlledElementCollapsed(element);

    if (
      markerText.includes('accordion') ||
      markerText.includes('collapse') ||
      markerText.includes('expand') ||
      markerText.includes('disclosure') ||
      markerText.includes('spoiler') ||
      markerText.includes('read-more') ||
      markerText.includes('show-more')
    ) {
      if (hasCollapsedTarget) {
        return true;
      }
    }

    if (!label) {
      return false;
    }

    if (
      tagName === 'button' ||
      role === 'button' ||
      tagName === 'summary' ||
      tagName === 'a'
    ) {
      if (!expandKeywords.test(label)) {
        return false;
      }

      if (hasStructuredDisclosureSignal(element)) {
        return true;
      }
    }

    return false;
  }

  function canInteractWithElement(element) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    if (element.hasAttribute('disabled')) {
      return false;
    }

    if (element.getAttribute('aria-disabled') === 'true') {
      return false;
    }

    if (isEditableElement(element)) {
      return false;
    }

    if (!isVisibleElement(element)) {
      return false;
    }

    const label = getElementLabel(element);

    if (isDangerousControl(element, label)) {
      return false;
    }

    if (!hasExpandableMarker(element, label)) {
      return false;
    }

    return true;
  }

  async function openDetails(stats) {
    const detailsElements = document.querySelectorAll('details:not([open])');

    for (const detailsElement of detailsElements) {
      detailsElement.open = true;
      stats.openedDetails += 1;
    }
  }

  async function clickExpandableElements(options, stats, warnings, seenElements) {
    const selector = [
      'summary',
      '[aria-expanded="false"]',
      '[aria-controls]',
      '[data-toggle="collapse"]',
      '[data-bs-toggle="collapse"]',
      'a[href^="#"]',
      '[role="tab"][aria-selected="false"]',
      '.accordion-button',
      '.accordion-header',
      '.ant-collapse-header',
      '.MuiAccordionSummary-root',
      '.read-more',
      '.show-more',
      '.expand',
      '.disclosure',
    ].join(',');

    const candidates = document.querySelectorAll(selector);
    let clickedThisRound = 0;

    for (const candidate of candidates) {
      if (stats.totalClicks >= options.maxTotalClicks) {
        pushWarning(warnings, 'reached max click limit');
        break;
      }

      if (clickedThisRound >= options.maxClicksPerRound) {
        break;
      }

      if (seenElements.has(candidate)) {
        continue;
      }

      if (!canInteractWithElement(candidate)) {
        continue;
      }

      seenElements.add(candidate);

      try {
        candidate.click();
        clickedThisRound += 1;
        stats.clickedExpanders += 1;
        stats.totalClicks += 1;
        await sleep(options.clickDelayMs);
      } catch (error) {
        pushWarning(warnings, `failed to click ${buildSelector(candidate)}`);
      }
    }

    return clickedThisRound;
  }

  async function autoScrollPage(options, stats) {
    if (!options.enableAutoScroll) {
      return;
    }

    if (!Number.isFinite(options.autoScrollPasses) || options.autoScrollPasses <= 0) {
      return;
    }

    const startY = window.scrollY || window.pageYOffset || 0;
    const documentHeight = Math.max(
      document.documentElement.scrollHeight || 0,
      document.body ? document.body.scrollHeight : 0,
    );

    if (documentHeight <= 0) {
      return;
    }

    for (let passIndex = 0; passIndex < options.autoScrollPasses; passIndex += 1) {
      const ratio = (passIndex + 1) / options.autoScrollPasses;
      const targetY = Math.floor(documentHeight * ratio);

      window.scrollTo(0, targetY);
      stats.autoScrollPasses += 1;
      await sleep(options.scrollDelayMs);
    }

    window.scrollTo(0, startY);
  }

  function collectElements(options, warnings) {
    const elements = [];
    const budget = {
      usedBytes: 0,
      stopped: false,
      elementLimitReached: false,
      byteLimitReached: false,
    };

    function stopForElementLimit() {
      if (!budget.elementLimitReached) {
        budget.elementLimitReached = true;
        pushWarning(warnings, 'max element limit reached, traversal truncated');
      }

      budget.stopped = true;
    }

    function stopForByteLimit() {
      if (!budget.byteLimitReached) {
        budget.byteLimitReached = true;
        pushWarning(warnings, 'max result budget reached, traversal truncated');
      }

      budget.stopped = true;
    }

    function visitElement(element, parentIndex, sourceRoot) {
      if (!(element instanceof Element)) {
        return null;
      }

      if (budget.stopped) {
        return null;
      }

      if (
        Number.isFinite(options.maxElements) &&
        elements.length >= options.maxElements
      ) {
        stopForElementLimit();
        return null;
      }

      const index = elements.length;
      const label = `${element.tagName.toLowerCase()}#${index}`;
      const textFields = getTextFields(element, options, warnings, label);
      const entry = {
        index,
        tag: element.tagName.toLowerCase(),
        text: textFields.text,
        directText: textFields.directText,
        attributes: getAttributes(element, options, warnings, label),
        selector: buildSelector(element),
        xpath: buildXPath(element),
        visible: isVisibleElement(element),
        rect: getElementRect(element),
        styleSummary: getStyleSummary(element),
        role: element.getAttribute('role') || '',
        parentIndex,
        childIndexes: [],
        sourceRoot,
      };
      const entryBytes = estimateValueSize(entry) + 24;

      if (
        Number.isFinite(options.maxResultBytes) &&
        budget.usedBytes + entryBytes > options.maxResultBytes
      ) {
        stopForByteLimit();
        return null;
      }

      elements.push(entry);
      budget.usedBytes += entryBytes;

      for (const child of element.children) {
        const childIndex = visitElement(child, index, sourceRoot);

        if (childIndex !== null) {
          entry.childIndexes.push(childIndex);
        }
      }

      if (element.shadowRoot) {
        for (const shadowChild of element.shadowRoot.children) {
          const childIndex = visitElement(shadowChild, index, 'shadow');

          if (childIndex !== null) {
            entry.childIndexes.push(childIndex);
          }
        }
      }

      return index;
    }

    if (document.documentElement) {
      visitElement(document.documentElement, -1, 'document');
    }

    return {
      elements,
      resultSizeBytes: budget.usedBytes,
    };
  }

  async function collectPage(userOptions) {
    const options = mergeOptions(userOptions);
    const warnings = [];
    const stats = {
      openedDetails: 0,
      clickedExpanders: 0,
      totalClicks: 0,
      autoScrollPasses: 0,
      elementCount: 0,
    };
    const seenElements = new WeakSet();

    await openDetails(stats);

    for (let roundIndex = 0; roundIndex < options.maxExpandRounds; roundIndex += 1) {
      const clickedCount = await clickExpandableElements(
        options,
        stats,
        warnings,
        seenElements,
      );

      await sleep(options.settleDelayMs);

      if (clickedCount === 0) {
        break;
      }
    }

    await autoScrollPage(options, stats);

    const collected = collectElements(options, warnings);
    const elements = collected.elements;
    stats.elementCount = elements.length;

    return {
      title: document.title || '',
      frameUrl: window.location.href,
      collectedAt: new Date().toISOString(),
      resultSizeBytes: collected.resultSizeBytes,
      warnings,
      stats,
      elements,
    };
  }

  // expose a reusable collector for dynamic injection
  globalThis.pagexCollector = {
    version: collectorVersion,
    collectPage,
  };
})();
