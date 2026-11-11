import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { JSDOM } from 'jsdom';

const contentScriptPath = path.join(process.cwd(), 'content.js');

function createDom(html) {
  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    url: 'https://example.com/articles/page',
  });

  const { window } = dom;

  window.scrollTo = () => {};
  window.requestAnimationFrame = (callback) => {
    callback();
    return 1;
  };
  window.cancelAnimationFrame = () => {};

  Object.defineProperty(window.HTMLElement.prototype, 'innerText', {
    configurable: true,
    get() {
      return this.textContent ?? '';
    },
  });

  window.HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
    const hidden = this.hidden || this.hasAttribute('hidden');

    if (hidden) {
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        bottom: 0,
        right: 0,
        width: 0,
        height: 0,
      };
    }

    return {
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: 24,
      right: 180,
      width: 180,
      height: 24,
    };
  };

  return dom;
}

async function loadCollector(dom) {
  const contentScript = await readFile(contentScriptPath, 'utf8');

  dom.window.eval(contentScript);

  assert.ok(dom.window.pagexCollector, 'expected pagexCollector on window');
  assert.equal(typeof dom.window.pagexCollector.collectPage, 'function');

  return dom.window.pagexCollector;
}

test('collectPage expands safe controls and collects shadow DOM content', async () => {
  const dom = createDom(`
    <!doctype html>
    <html>
      <body>
        <details>
          <summary>Section</summary>
          <div>Details body</div>
        </details>
        <button id="read-more" aria-expanded="false">Read more</button>
        <section id="panel" hidden>Loaded extra content</section>
        <button id="danger">Delete account</button>
        <div id="shadow-host"></div>
      </body>
    </html>
  `);

  const { window } = dom;
  const readMore = window.document.getElementById('read-more');
  const panel = window.document.getElementById('panel');
  const danger = window.document.getElementById('danger');
  const shadowHost = window.document.getElementById('shadow-host');
  const shadowRoot = shadowHost.attachShadow({ mode: 'open' });

  let dangerClicks = 0;

  shadowRoot.innerHTML = '<p data-test-id="shadow-copy">Shadow content</p>';

  readMore.addEventListener('click', () => {
    readMore.setAttribute('aria-expanded', 'true');
    panel.hidden = false;
  });

  danger.addEventListener('click', () => {
    dangerClicks += 1;
  });

  const collector = await loadCollector(dom);
  const result = await collector.collectPage({
    maxExpandRounds: 2,
    maxClicksPerRound: 10,
    enableAutoScroll: false,
    settleDelayMs: 0,
  });

  assert.equal(result.stats.openedDetails, 1);
  assert.equal(result.stats.clickedExpanders, 1);
  assert.equal(dangerClicks, 0);
  assert.ok(
    result.elements.some((element) => element.text.includes('Loaded extra content')),
    'expected expanded panel content to be collected',
  );
  assert.ok(
    result.elements.some((element) => element.text.includes('Shadow content')),
    'expected shadow DOM content to be collected',
  );
});

test('collectPage preserves hidden text and style summaries', async () => {
  const dom = createDom(`
    <!doctype html>
    <html>
      <body>
        <div id="hidden-copy" style="display:none;color:rgb(255, 0, 0);font-size:18px">
          Hidden copy for AI
        </div>
      </body>
    </html>
  `);

  const collector = await loadCollector(dom);
  const result = await collector.collectPage({
    maxExpandRounds: 0,
    enableAutoScroll: false,
    settleDelayMs: 0,
  });

  const hiddenEntry = result.elements.find(
    (element) => element.attributes.id === 'hidden-copy',
  );

  assert.ok(hiddenEntry, 'expected hidden element entry');
  assert.equal(hiddenEntry.visible, false);
  assert.match(hiddenEntry.text, /Hidden copy for AI/);
  assert.equal(hiddenEntry.styleSummary.display, 'none');
  assert.equal(hiddenEntry.styleSummary.fontSize, '18px');
});

test('collectPage expands fragment disclosure links', async () => {
  const dom = createDom(`
    <!doctype html>
    <html>
      <body>
        <a
          id="fragment-toggle"
          href="#fragment-panel"
          data-bs-toggle="collapse"
          aria-expanded="false"
        >
          Show more
        </a>
        <div id="fragment-panel" hidden>Fragment linked panel</div>
      </body>
    </html>
  `);

  const { window } = dom;
  const toggle = window.document.getElementById('fragment-toggle');
  const panel = window.document.getElementById('fragment-panel');

  toggle.addEventListener('click', (event) => {
    event.preventDefault();
    toggle.setAttribute('aria-expanded', 'true');
    panel.hidden = false;
  });

  const collector = await loadCollector(dom);
  const result = await collector.collectPage({
    maxExpandRounds: 2,
    maxClicksPerRound: 10,
    enableAutoScroll: false,
    settleDelayMs: 0,
  });

  assert.equal(result.stats.clickedExpanders, 1);
  assert.ok(
    result.elements.some((element) => element.text.includes('Fragment linked panel')),
    'expected the fragment-linked disclosure content to be collected',
  );
});

test('collectPage does not click already expanded aria-controls buttons', async () => {
  const dom = createDom(`
    <!doctype html>
    <html>
      <body>
        <button id="filters-button" aria-controls="filters-panel" aria-expanded="true">
          Manage filters
        </button>
        <section id="filters-panel">Visible filter panel</section>
      </body>
    </html>
  `);

  const { window } = dom;
  const button = window.document.getElementById('filters-button');
  let clickCount = 0;

  button.addEventListener('click', () => {
    clickCount += 1;
  });

  const collector = await loadCollector(dom);
  const result = await collector.collectPage({
    maxExpandRounds: 2,
    maxClicksPerRound: 10,
    enableAutoScroll: false,
    settleDelayMs: 0,
  });

  assert.equal(clickCount, 0);
  assert.equal(result.stats.clickedExpanders, 0);
});

test('collectPage does not click already expanded fragment disclosure links', async () => {
  const dom = createDom(`
    <!doctype html>
    <html>
      <body>
        <a
          id="expanded-fragment-toggle"
          href="#expanded-fragment-panel"
          data-bs-toggle="collapse"
        >
          Show more
        </a>
        <div id="expanded-fragment-panel">Already visible panel</div>
      </body>
    </html>
  `);

  const { window } = dom;
  const toggle = window.document.getElementById('expanded-fragment-toggle');
  let clickCount = 0;

  toggle.addEventListener('click', (event) => {
    event.preventDefault();
    clickCount += 1;
  });

  const collector = await loadCollector(dom);
  const result = await collector.collectPage({
    maxExpandRounds: 2,
    maxClicksPerRound: 10,
    enableAutoScroll: false,
    settleDelayMs: 0,
  });

  assert.equal(clickCount, 0);
  assert.equal(result.stats.clickedExpanders, 0);
});

test('collectPage does not click implicit submit buttons inside forms', async () => {
  const dom = createDom(`
    <!doctype html>
    <html>
      <body>
        <form id="search-form">
          <button id="search-more" aria-expanded="false" aria-controls="search-panel">
            Show more filters
          </button>
        </form>
        <section id="search-panel" hidden>Search filters panel</section>
      </body>
    </html>
  `);

  const { window } = dom;
  const form = window.document.getElementById('search-form');
  const button = window.document.getElementById('search-more');
  let submitCount = 0;
  let clickCount = 0;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    submitCount += 1;
  });

  button.addEventListener('click', () => {
    clickCount += 1;
  });

  const collector = await loadCollector(dom);
  const result = await collector.collectPage({
    maxExpandRounds: 2,
    maxClicksPerRound: 10,
    enableAutoScroll: false,
    settleDelayMs: 0,
  });

  assert.equal(clickCount, 0);
  assert.equal(submitCount, 0);
  assert.equal(result.stats.clickedExpanders, 0);
});

test('collectPage clicks explicit button type button disclosure inside forms', async () => {
  const dom = createDom(`
    <!doctype html>
    <html>
      <body>
        <form id="settings-form">
          <button
            id="advanced-settings"
            type="button"
            aria-expanded="false"
            aria-controls="advanced-panel"
          >
            Show advanced settings
          </button>
        </form>
        <section id="advanced-panel" hidden>Advanced form settings</section>
      </body>
    </html>
  `);

  const { window } = dom;
  const button = window.document.getElementById('advanced-settings');
  const panel = window.document.getElementById('advanced-panel');
  let clickCount = 0;

  button.addEventListener('click', () => {
    clickCount += 1;
    button.setAttribute('aria-expanded', 'true');
    panel.hidden = false;
  });

  const collector = await loadCollector(dom);
  const result = await collector.collectPage({
    maxExpandRounds: 2,
    maxClicksPerRound: 10,
    enableAutoScroll: false,
    settleDelayMs: 0,
  });

  assert.equal(clickCount, 1);
  assert.equal(result.stats.clickedExpanders, 1);
  assert.ok(
    result.elements.some((element) => element.text.includes('Advanced form settings')),
    'expected explicit disclosure button to remain supported',
  );
});

test('collectPage redacts sensitive attributes and keeps container text compact', async () => {
  const dom = createDom(`
    <!doctype html>
    <html>
      <body>
        <section id="profile-card" class="card shell" data-token="secret-token">
          <span>User profile title</span>
          <input
            id="secret-field"
            type="hidden"
            value="top-secret"
            nonce="nonce-value"
            aria-label="secret field"
          />
        </section>
      </body>
    </html>
  `);

  const collector = await loadCollector(dom);
  const result = await collector.collectPage({
    maxExpandRounds: 0,
    enableAutoScroll: false,
    settleDelayMs: 0,
  });

  const containerEntry = result.elements.find(
    (element) => element.attributes.id === 'profile-card',
  );
  const hiddenInputEntry = result.elements.find(
    (element) => element.attributes.id === 'secret-field',
  );

  assert.ok(containerEntry, 'expected section entry');
  assert.equal(containerEntry.directText, '');
  assert.equal(containerEntry.text, '');
  assert.equal(containerEntry.attributes.class, 'card shell');
  assert.equal('data-token' in containerEntry.attributes, false);

  assert.ok(hiddenInputEntry, 'expected hidden input entry');
  assert.equal(hiddenInputEntry.attributes.type, 'hidden');
  assert.equal('value' in hiddenInputEntry.attributes, false);
  assert.equal('nonce' in hiddenInputEntry.attributes, false);
});

test('collectPage truncates traversal when maxElements budget is reached', async () => {
  const itemMarkup = Array.from({ length: 12 }, (_, index) => {
    return `<div id="item-${index}">Item ${index}</div>`;
  }).join('');

  const dom = createDom(`
    <!doctype html>
    <html>
      <body>${itemMarkup}</body>
    </html>
  `);

  const collector = await loadCollector(dom);
  const result = await collector.collectPage({
    maxExpandRounds: 0,
    enableAutoScroll: false,
    settleDelayMs: 0,
    maxElements: 6,
  });

  assert.equal(result.elements.length, 6);
  assert.ok(
    result.warnings.some((warning) => warning.includes('max element limit')),
    'expected a warning for element truncation',
  );
});

test('collectPage strips query strings and hashes from exported urls', async () => {
  const dom = createDom(`
    <!doctype html>
    <html>
      <body>
        <a
          id="external-link"
          href="https://example.com/download?token=secret123&x=1#frag"
        >
          Download file
        </a>
        <img
          id="preview-image"
          src="https://cdn.example.com/image.png?signature=abc123#hero"
          alt="preview"
        />
      </body>
    </html>
  `);

  const collector = await loadCollector(dom);
  const result = await collector.collectPage({
    maxExpandRounds: 0,
    enableAutoScroll: false,
    settleDelayMs: 0,
  });

  const linkEntry = result.elements.find(
    (element) => element.attributes.id === 'external-link',
  );
  const imageEntry = result.elements.find(
    (element) => element.attributes.id === 'preview-image',
  );

  assert.ok(linkEntry, 'expected anchor entry');
  assert.ok(imageEntry, 'expected image entry');
  assert.equal(linkEntry.attributes.href, 'https://example.com/download');
  assert.equal(imageEntry.attributes.src, 'https://cdn.example.com/image.png');
});

function buildExpanderPage(count) {
  const buttons = Array.from(
    { length: count },
    (_, index) =>
      `<button id="b${index}" aria-expanded="false" aria-controls="p${index}">Show more ${index}</button>` +
      `<section id="p${index}" hidden>Panel ${index}</section>`,
  ).join('');

  return `<!doctype html><html><body>${buttons}</body></html>`;
}

function wireExpanders(window, count) {
  for (let index = 0; index < count; index += 1) {
    const button = window.document.getElementById(`b${index}`);
    button.addEventListener('click', () => {
      button.setAttribute('aria-expanded', 'true');
      window.document.getElementById(`p${index}`).hidden = false;
    });
  }
}

test('collectPage stops expanding when the time budget runs out but still returns content', async () => {
  const dom = createDom(buildExpanderPage(10));
  wireExpanders(dom.window, 10);

  const collector = await loadCollector(dom);
  const result = await collector.collectPage({
    clickDelayMs: 40,
    settleDelayMs: 0,
    enableAutoScroll: false,
    expandBudgetMs: 60,
  });

  assert.ok(result.stats.clickedExpanders >= 1);
  assert.ok(result.stats.clickedExpanders < 10, 'expected the budget to cut the expand loop short');
  assert.ok(result.warnings.some((warning) => warning.includes('expand time budget')));
  assert.ok(result.elements.length > 0);
});

test('collectPage can be aborted mid-run', async () => {
  const dom = createDom(buildExpanderPage(5));
  wireExpanders(dom.window, 5);

  const collector = await loadCollector(dom);
  const pending = collector.collectPage({
    clickDelayMs: 200,
    settleDelayMs: 0,
    enableAutoScroll: false,
  });

  await new Promise((resolve) => setTimeout(resolve, 20));
  collector.abort();

  await assert.rejects(pending, /collection cancelled/);
});

test('collectPage in a hidden tab avoids timer delays and flags the result', async () => {
  const dom = createDom(buildExpanderPage(5));
  wireExpanders(dom.window, 5);
  Object.defineProperty(dom.window.document, 'visibilityState', {
    configurable: true,
    get: () => 'hidden',
  });

  const collector = await loadCollector(dom);
  const started = Date.now();
  const result = await collector.collectPage({
    clickDelayMs: 2000,
    settleDelayMs: 2000,
    scrollDelayMs: 2000,
    autoScrollPasses: 2,
  });

  assert.ok(Date.now() - started < 1500, 'hidden tabs should not wait on throttled timers');
  assert.equal(result.pageHidden, true);
  assert.equal(result.stats.clickedExpanders, 5);
  assert.ok(result.warnings.some((warning) => warning.includes('background tab')));
});

test('content.js default options stay in sync with PAGEX_PARSE_OPTIONS', async () => {
  const { PAGEX_PARSE_OPTIONS } = await import('../src/shared/constants.js');
  const source = await readFile(contentScriptPath, 'utf8');
  const block = source.slice(
    source.indexOf('const defaultOptions = {'),
    source.indexOf('};', source.indexOf('const defaultOptions = {')),
  );
  const parsed = {};

  for (const match of block.matchAll(/^\s+(\w+):\s*([\w.]+),$/gm)) {
    parsed[match[1]] = match[2] === 'true' ? true : match[2] === 'false' ? false : Number(match[2]);
  }

  assert.deepEqual(parsed, { ...PAGEX_PARSE_OPTIONS });
});

test('abort is scoped to a job token and sticky for runs that have not started', async () => {
  const dom = createDom(buildExpanderPage(3));
  wireExpanders(dom.window, 3);

  const collector = await loadCollector(dom);
  const options = { clickDelayMs: 0, settleDelayMs: 0, enableAutoScroll: false };

  collector.abort('job-old');
  const result = await collector.collectPage({ ...options, runToken: 'job-new' });
  assert.equal(result.stats.clickedExpanders, 3, 'an older job abort must not cancel a new job');

  collector.abort('job-late');
  await assert.rejects(
    collector.collectPage({ ...options, runToken: 'job-late' }),
    /collection cancelled/,
  );
});
