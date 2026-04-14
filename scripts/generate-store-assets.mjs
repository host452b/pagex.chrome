import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Resvg } from '@resvg/resvg-js';

const ICON_SPECS = [
  { size: 16 },
  { size: 32 },
  { size: 48 },
  { size: 128 },
];

const PX_MATRIX = [
  '111100011110',
  '100100100001',
  '100100010010',
  '111100001100',
  '100000010010',
  '100000100001',
  '100000100001',
  '100000010010',
  '100000001100',
];
const FONT_STACK = "Georgia, 'Times New Roman', Times, serif";
const PAPER = '#f6f0e6';
const PAPER_DEEP = '#efe6d7';
const PAPER_LIGHT = '#fffaf3';
const INK = '#1f1712';
const MUTED = '#6b574e';
const ACCENT = '#ab3a2c';
const RULE = '#cfc3b6';

const SCREENSHOT_SCENES = [
  {
    fileName: 'pagex-screenshot-01-target-tab-1280x800.png',
    statusText: 'Ready',
    detailLines: ['Select a tab, reveal what matters,', 'and copy a quieter JSON record.'],
    summaryLines: ['No captured page yet.'],
    metrics: ['-', '-', '-', '-'],
    calloutTitle: 'Selected page',
    calloutLines: ['Choose the active page.', 'Then begin the reading.'],
    buttonPrimary: 'Parse',
    buttonSecondary: 'Copy JSON',
    footerText: 'Local only. Nothing is sent away.',
  },
  {
    fileName: 'pagex-screenshot-02-parsing-1280x800.png',
    statusText: 'Reading structure',
    detailLines: ['Working quietly through structure,', 'hidden sections, and frame notes.'],
    summaryLines: ['Working quietly in the background.'],
    metrics: ['4', '128', '7', '42 KB'],
    calloutTitle: 'While it works',
    calloutLines: ['Hidden sections are opening.', 'Frames are being noted.'],
    buttonPrimary: 'Parsing...',
    buttonSecondary: 'Copy JSON',
    footerText: 'Local only. Nothing is sent away.',
  },
  {
    fileName: 'pagex-screenshot-03-parse-complete-1280x800.png',
    statusText: 'Ready to copy',
    detailLines: ['The page reading is prepared.', 'Copy the JSON when you like.'],
    summaryLines: ['4 accessible frames.', '1 skipped frame. 2 warnings.'],
    metrics: ['5', '241', '9', '64 KB'],
    calloutTitle: 'Reading complete',
    calloutLines: ['Structure, text, and note fields', 'are ready for export.'],
    buttonPrimary: 'Parse',
    buttonSecondary: 'Copy JSON',
    footerText: 'Local only. Nothing is sent away.',
  },
  {
    fileName: 'pagex-screenshot-04-copy-json-1280x800.png',
    statusText: 'Ready to copy',
    detailLines: ['The page reading is prepared.', 'Copy the JSON when you like.'],
    summaryLines: ['4 accessible frames.', '1 skipped frame. 2 warnings.'],
    metrics: ['5', '241', '9', '64 KB'],
    calloutTitle: 'Copied',
    calloutLines: ['The note is now on your clipboard.', 'Paste it into your AI workflow.'],
    buttonPrimary: 'Parse',
    buttonSecondary: 'Copy JSON',
    footerText: 'Copied to clipboard.',
  },
];

function getProjectRoot() {
  return process.cwd();
}

function escapeText(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function drawRect(x, y, width, height, fill, strokeWidth, stroke) {
  let markup = `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}"`;

  if (strokeWidth > 0) {
    markup += ` stroke="${stroke}" stroke-width="${strokeWidth}"`;
  }

  markup += ' />';

  return markup;
}

function drawText(x, y, size, value, fill, weight) {
  const safeValue = escapeText(value);

  return `<text x="${x}" y="${y}" fill="${fill}" font-family="${FONT_STACK}" font-size="${size}" font-weight="${weight}" dominant-baseline="hanging">${safeValue}</text>`;
}

function drawTextLines(x, y, lineHeight, size, values, fill, weight) {
  let markup = '';

  for (let index = 0; index < values.length; index += 1) {
    markup += drawText(x, y + index * lineHeight, size, values[index], fill, weight);
  }

  return markup;
}

function createSvgDocument(width, height, innerMarkup) {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      ${innerMarkup}
    </svg>
  `;
}

function createPixelCells(matrix, startX, startY, cellSize) {
  let markup = '';

  for (let rowIndex = 0; rowIndex < matrix.length; rowIndex += 1) {
    const row = matrix[rowIndex];

    for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
      if (row[columnIndex] !== '1') {
        continue;
      }

      const x = startX + columnIndex * cellSize;
      const y = startY + rowIndex * cellSize;

      markup += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="#000000" />`;
    }
  }

  return markup;
}

function buildIconSvg(spec) {
  const vb = 128;
  const radius = 16;

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${spec.size}" height="${spec.size}" viewBox="0 0 ${vb} ${vb}">
      <rect width="${vb}" height="${vb}" rx="${radius}" fill="${ACCENT}" />
      <text x="64" y="68" text-anchor="middle" dominant-baseline="central" fill="${PAPER_LIGHT}" font-family="${FONT_STACK}" font-size="72" font-weight="700" letter-spacing="-2">PX</text>
    </svg>
  `;
}

async function renderPng(svgMarkup, width, height, outputPath) {
  const resvg = new Resvg(svgMarkup, {
    fitTo: {
      mode: 'width',
      value: width,
    },
    font: {
      loadSystemFonts: true,
      defaultFontFamily: 'Georgia',
    },
  });
  const renderedImage = resvg.render();
  const pngData = renderedImage.asPng();

  await writeFile(outputPath, pngData);
}

async function generateIcons(projectRoot) {
  const iconsDirectory = path.join(projectRoot, 'assets', 'icons');

  await mkdir(iconsDirectory, { recursive: true });

  for (const spec of ICON_SPECS) {
    const svgMarkup = buildIconSvg(spec);
    const outputPath = path.join(iconsDirectory, `pagex-${spec.size}.png`);

    await renderPng(svgMarkup, spec.size, spec.size, outputPath);
  }
}

function buildLogoPanel(x, y, size, borderWidth) {
  const innerSize = size - borderWidth * 2;
  const availableSize = innerSize - borderWidth * 2;
  const cellSize = Math.floor(availableSize / PX_MATRIX[0].length);
  const glyphWidth = PX_MATRIX[0].length * cellSize;
  const glyphHeight = PX_MATRIX.length * cellSize;
  const glyphStartX = x + borderWidth * 2 + Math.floor((availableSize - glyphWidth) / 2);
  const glyphStartY = y + borderWidth * 2 + Math.floor((availableSize - glyphHeight) / 2);
  const pixelMarkup = createPixelCells(PX_MATRIX, glyphStartX, glyphStartY, cellSize);
  const accentWidth = Math.max(8, Math.floor(size * 0.38));
  const accentHeight = Math.max(2, Math.floor(size * 0.06));

  return [
    drawRect(x, y, size, size, PAPER_DEEP, borderWidth, INK),
    drawRect(x + borderWidth, y + borderWidth, accentWidth, accentHeight, ACCENT, 0, ACCENT),
    pixelMarkup,
  ].join('');
}

function buildPromoSvg(width, height, marqueeMode) {
  let headlineLines = ['Page notes', 'clean JSON'];
  let detailLines = ['local / filtered / ready for AI'];
  let headlineSize = 38;
  let headlineLineHeight = 44;

  if (marqueeMode) {
    headlineLines = ['Page notes', 'for hidden structure'];
    detailLines = ['quiet extraction / careful output / ready for AI'];
    headlineSize = 58;
    headlineLineHeight = 68;
  }

  let logoSize = 104;
  let logoY = 114;
  let headlineY = 112;

  if (marqueeMode) {
    logoSize = 128;
    logoY = 116;
    headlineY = 108;
  }
  let innerMarkup = '';

  innerMarkup += drawRect(0, 0, width, height, PAPER, 4, RULE);
  innerMarkup += drawRect(34, 30, 184, 28, ACCENT, 0, ACCENT);
  innerMarkup += drawText(48, 36, 16, 'editor’s note / pagex', PAPER_LIGHT, 600);
  innerMarkup += drawRect(34, 74, width - 68, 1, RULE, 0, RULE);
  innerMarkup += buildLogoPanel(46, logoY, logoSize, 4);
  innerMarkup += drawTextLines(190, headlineY, headlineLineHeight, headlineSize, headlineLines, INK, 700);
  innerMarkup += drawTextLines(192, height - 88, 24, 18, detailLines, MUTED, 500);
  innerMarkup += drawRect(192, height - 102, width - 244, 2, ACCENT, 0, ACCENT);

  if (marqueeMode) {
    innerMarkup += drawRect(width - 272, 108, 196, 196, PAPER_LIGHT, 1, RULE);
    innerMarkup += drawRect(width - 272, 108, 54, 196, ACCENT, 0, ACCENT);
    innerMarkup += drawText(width - 196, 136, 28, 'PX', INK, 700);
    innerMarkup += drawTextLines(
      width - 196,
      176,
      26,
      18,
      ['frame notes', 'quiet copy', 'no page noise'],
      MUTED,
      500,
    );
  }

  return createSvgDocument(width, height, innerMarkup);
}

function buildPopupMock(scene) {
  let markup = '';
  let statusFill = 'transparent';
  let statusStroke = RULE;
  let statusTextFill = ACCENT;
  let buttonPrimaryFill = ACCENT;
  let buttonPrimaryText = PAPER_LIGHT;

  if (scene.statusText === 'Reading structure') {
    statusFill = ACCENT;
    statusStroke = ACCENT;
    statusTextFill = PAPER_LIGHT;
  }

  markup += drawRect(0, 0, 430, 620, PAPER_LIGHT, 2, RULE);
  markup += drawRect(16, 16, 398, 170, PAPER_LIGHT, 1, RULE);
  markup += drawRect(32, 32, 130, 26, ACCENT, 0, ACCENT);
  markup += drawText(44, 38, 14, 'editor’s note', PAPER_LIGHT, 500);
  markup += drawRect(234, 32, 164, 26, statusFill, 1, statusStroke);
  markup += drawText(246, 38, 14, scene.statusText, statusTextFill, 600);
  markup += buildLogoPanel(32, 78, 84, 4);
  markup += drawText(138, 84, 13, 'Page reading for careful AI work', ACCENT, 500);
  markup += drawText(138, 108, 40, 'Pagex', INK, 700);
  markup += drawTextLines(138, 146, 18, 12, scene.detailLines, MUTED, 500);

  markup += drawRect(16, 204, 398, 116, PAPER_LIGHT, 1, RULE);
  markup += drawText(32, 220, 14, 'Selected page', ACCENT, 500);
  markup += drawRect(32, 248, 366, 42, PAPER, 1, RULE);
  markup += drawText(46, 261, 16, 'Pagex / active / example.com', INK, 600);
  markup += drawRect(32, 304, 176, 40, buttonPrimaryFill, 1, buttonPrimaryFill);
  markup += drawText(78, 314, 18, scene.buttonPrimary, buttonPrimaryText, 800);
  markup += drawRect(222, 304, 176, 40, PAPER_LIGHT, 1, RULE);
  markup += drawText(244, 314, 18, scene.buttonSecondary, ACCENT, 700);

  markup += drawRect(16, 338, 398, 196, PAPER_LIGHT, 1, RULE);
  markup += drawText(32, 356, 14, 'Reading notes', ACCENT, 500);

  const metricNames = ['Frames', 'Elements', 'Clicks', 'Size'];
  const metricPositions = [
    { x: 32, y: 394 },
    { x: 222, y: 394 },
    { x: 32, y: 468 },
    { x: 222, y: 468 },
  ];

  for (let index = 0; index < metricNames.length; index += 1) {
    const metric = metricPositions[index];

    markup += drawRect(metric.x, metric.y, 176, 60, PAPER, 1, RULE);
    markup += drawText(metric.x + 12, metric.y + 10, 13, metricNames[index], ACCENT, 500);
    markup += drawText(metric.x + 12, metric.y + 30, 24, scene.metrics[index], INK, 700);
  }

  markup += drawTextLines(32, 548, 18, 13, scene.summaryLines, INK, 500);
  markup += drawRect(16, 576, 398, 20, ACCENT, 0, ACCENT);
  markup += drawText(32, 582, 12, scene.footerText, PAPER_LIGHT, 500);

  return markup;
}

function buildScreenshotSvg(scene) {
  let innerMarkup = '';

  innerMarkup += drawRect(0, 0, 1280, 800, PAPER, 4, RULE);
  innerMarkup += drawRect(36, 34, 184, 28, ACCENT, 0, ACCENT);
  innerMarkup += drawText(50, 40, 16, 'pagex / editorial mode', PAPER_LIGHT, 500);
  innerMarkup += drawRect(36, 86, 1208, 1, RULE, 0, RULE);
  innerMarkup += drawRect(60, 128, 732, 564, PAPER_LIGHT, 1, RULE);
  innerMarkup += drawText(88, 152, 14, 'Selected page', ACCENT, 500);
  innerMarkup += drawTextLines(
    88,
    182,
    54,
    42,
    ['Page structure,', 'hidden sections,', 'clean notes.'],
    INK,
    700,
  );
  innerMarkup += drawRect(88, 372, 356, 170, PAPER, 1, RULE);
  innerMarkup += drawText(106, 390, 14, 'Margin note', ACCENT, 500);
  innerMarkup += drawTextLines(
    106,
    422,
    26,
    20,
    ['Visible content', 'Expandable sections', 'Filtered attributes'],
    MUTED,
    500,
  );
  innerMarkup += drawRect(470, 372, 286, 170, PAPER_DEEP, 1, RULE);
  innerMarkup += drawText(488, 390, 14, 'Output', ACCENT, 500);
  innerMarkup += drawTextLines(
    488,
    422,
    30,
    22,
    ['Quiet reading', 'Careful export', 'JSON for AI'],
    INK,
    600,
  );
  innerMarkup += drawRect(88, 572, 668, 1, RULE, 0, RULE);
  innerMarkup += drawTextLines(
    88,
    592,
    24,
    18,
    ['Local workflow only.', 'No remote send by default.'],
    MUTED,
    500,
  );

  innerMarkup += `<g transform="translate(762, 124)">${buildPopupMock(scene)}</g>`;

  return createSvgDocument(1280, 800, innerMarkup);
}

async function generatePromoAssets(projectRoot) {
  const promoDirectory = path.join(projectRoot, 'store-assets', 'promo');
  const smallPromoPath = path.join(promoDirectory, 'pagex-small-promo-440x280.png');
  const marqueePath = path.join(promoDirectory, 'pagex-marquee-1400x560.png');

  await rm(promoDirectory, { recursive: true, force: true });
  await mkdir(promoDirectory, { recursive: true });
  await renderPng(buildPromoSvg(440, 280, false), 440, 280, smallPromoPath);
  await renderPng(buildPromoSvg(1400, 560, true), 1400, 560, marqueePath);
}

async function generateScreenshotAssets(projectRoot) {
  const screenshotsDirectory = path.join(projectRoot, 'store-assets', 'screenshots');

  await rm(screenshotsDirectory, { recursive: true, force: true });
  await mkdir(screenshotsDirectory, { recursive: true });

  for (const scene of SCREENSHOT_SCENES) {
    const screenshotPath = path.join(screenshotsDirectory, scene.fileName);
    const svgMarkup = buildScreenshotSvg(scene);

    await renderPng(svgMarkup, 1280, 800, screenshotPath);
  }
}

async function main() {
  const projectRoot = getProjectRoot();

  await generateIcons(projectRoot);
  await generatePromoAssets(projectRoot);
  await generateScreenshotAssets(projectRoot);

  console.log('Generated Pagex store assets.');
}

await main();
