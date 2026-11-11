import { calculateScrollPositions } from '../shared/screenshot-utils.js';

const SCROLLBAR_CSS =
  '::-webkit-scrollbar{display:none!important}*{scrollbar-width:none!important}';
const MAX_CANVAS_DIM = 16384;
// chrome.tabs.captureVisibleTab allows 2 calls per second.
const MIN_CAPTURE_INTERVAL_MS = 550;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = dataUrl;
  });
}

async function runInTab(tabId, func, args = []) {
  const [entry] = await chrome.scripting.executeScript({
    target: { tabId },
    func,
    args,
  });

  return entry ? entry.result : undefined;
}

// Runs in the page: lets SPA scroll containers participate in document
// scrolling so the whole page can be captured, and records what to restore.
function unfoldPage() {
  const viewportHeight = window.innerHeight;
  const saved = [];
  const measure = () =>
    Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
  let scrollHeight = measure();

  const unfold = (element) => {
    saved.push({ element, css: element.style.cssText });
    element.style.setProperty('overflow', 'visible', 'important');
    element.style.setProperty('height', 'auto', 'important');
    element.style.setProperty('max-height', 'none', 'important');
  };

  if (scrollHeight <= viewportHeight + 1) {
    unfold(document.documentElement);
    unfold(document.body);

    let target = null;
    let maxScroll = 0;

    for (const element of document.querySelectorAll('*')) {
      if (element === document.documentElement || element === document.body) {
        continue;
      }

      const style = getComputedStyle(element);

      if (
        (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
        element.scrollHeight > element.clientHeight + 10 &&
        element.scrollHeight > maxScroll
      ) {
        maxScroll = element.scrollHeight;
        target = element;
      }
    }

    if (target) {
      unfold(target);

      for (
        let ancestor = target.parentElement;
        ancestor && ancestor !== document.documentElement;
        ancestor = ancestor.parentElement
      ) {
        unfold(ancestor);
      }
    }

    scrollHeight = measure();
  }

  window.__pagexSaved = saved;

  return {
    scrollHeight,
    viewportHeight,
    viewportWidth: window.innerWidth,
    originalScrollX: window.scrollX,
    originalScrollY: window.scrollY,
    devicePixelRatio: window.devicePixelRatio || 1,
  };
}

function hideFixedElements() {
  window.__pagexFixedEls = [];

  for (const element of document.querySelectorAll('*')) {
    const position = getComputedStyle(element).position;

    if (position === 'fixed' || position === 'sticky') {
      window.__pagexFixedEls.push({ element, visibility: element.style.visibility });
      element.style.setProperty('visibility', 'hidden', 'important');
    }
  }
}

function restorePage(scrollX, scrollY) {
  for (const { element, visibility } of window.__pagexFixedEls || []) {
    if (visibility) {
      element.style.visibility = visibility;
    } else {
      element.style.removeProperty('visibility');
    }
  }

  delete window.__pagexFixedEls;

  for (const { element, css } of window.__pagexSaved || []) {
    element.style.cssText = css;
  }

  delete window.__pagexSaved;

  if (Number.isFinite(scrollX) && Number.isFinite(scrollY)) {
    window.scrollTo(scrollX, scrollY);
  }
}

function hasLoadingImagesNearViewport() {
  const viewportHeight = window.innerHeight;

  for (const image of document.querySelectorAll('img[src]')) {
    const rect = image.getBoundingClientRect();

    if (rect.bottom > 0 && rect.top < viewportHeight * 2 && !image.complete) {
      return true;
    }
  }

  return false;
}

/**
 * Scrolls through the tab and stitches viewport captures into one PNG.
 * @returns {Promise<{ blob: Blob | null, truncated: boolean }>}
 */
export async function captureFullPage(tabId, { onProgress } = {}) {
  let dims = null;

  await chrome.tabs.update(tabId, { active: true });
  await delay(200);
  await chrome.scripting.insertCSS({ target: { tabId }, css: SCROLLBAR_CSS });

  try {
    dims = await runInTab(tabId, unfoldPage);

    // Pre-scroll to trigger lazy content, then re-measure.
    await runInTab(tabId, (height) => window.scrollTo(0, height), [dims.scrollHeight]);
    await delay(500);
    await runInTab(tabId, () => window.scrollTo(0, 0));
    await delay(300);

    const measuredHeight = await runInTab(tabId, () =>
      Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
    );
    const scrollHeight = Math.max(dims.scrollHeight, measuredHeight || 0);

    let scale = dims.devicePixelRatio;

    if (dims.viewportWidth * scale > MAX_CANVAS_DIM) {
      scale = MAX_CANVAS_DIM / dims.viewportWidth;
    }

    if (scrollHeight * scale > MAX_CANVAS_DIM) {
      scale = MAX_CANVAS_DIM / scrollHeight;
    }

    scale = Math.max(scale, 0.5);

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(dims.viewportWidth * scale);
    canvas.height = Math.min(Math.round(scrollHeight * scale), MAX_CANVAS_DIM);

    const context = canvas.getContext('2d');
    const capturePageHeight = canvas.height / scale;
    const truncated = capturePageHeight + 1 < scrollHeight;
    const positions = calculateScrollPositions(capturePageHeight, dims.viewportHeight);
    const drawWidth = Math.round(dims.viewportWidth * scale);
    const drawHeight = Math.round(dims.viewportHeight * scale);
    let lastCaptureAt = 0;

    for (let index = 0; index < positions.length; index += 1) {
      if (onProgress) {
        onProgress(index + 1, positions.length);
      }

      await runInTab(tabId, (y) => window.scrollTo(0, y), [positions[index]]);
      await delay(300);

      if (await runInTab(tabId, hasLoadingImagesNearViewport)) {
        await delay(1200);
      }

      const sinceLast = Date.now() - lastCaptureAt;

      if (sinceLast < MIN_CAPTURE_INTERVAL_MS) {
        await delay(MIN_CAPTURE_INTERVAL_MS - sinceLast);
      }

      const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
      lastCaptureAt = Date.now();

      const actualY = await runInTab(tabId, () => window.scrollY);
      const image = await loadImage(dataUrl);
      context.drawImage(image, 0, Math.round(actualY * scale), drawWidth, drawHeight);

      // Fixed/sticky bars should appear once, at the top of the image.
      if (index === 0 && positions.length > 1) {
        await runInTab(tabId, hideFixedElements);
      }
    }

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));

    return { blob, truncated };
  } finally {
    try {
      await runInTab(tabId, restorePage, [
        dims ? dims.originalScrollX : NaN,
        dims ? dims.originalScrollY : NaN,
      ]);
    } catch {
      // Tab closed or permission revoked: nothing to restore.
    }

    try {
      await chrome.scripting.removeCSS({ target: { tabId }, css: SCROLLBAR_CSS });
    } catch {
      // Same.
    }
  }
}
