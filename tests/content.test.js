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
