import test from 'node:test';
import assert from 'node:assert/strict';

import { buildParseResult } from '../src/shared/parse-state.js';

test('buildParseResult merges accessible frames with skipped frames', () => {
  const result = buildParseResult({
    requestId: 'req-1',
    selectedTabId: 99,
    timestamp: '2026-04-11T12:00:00.000Z',
    accessibleFrameResults: [
      {
        frameId: 0,
        result: {
          title: 'Main page',
          frameUrl: 'https://example.com',
          resultSizeBytes: 900,
          warnings: [],
          stats: {
            elementCount: 10,
            totalClicks: 2,
          },
          elements: [{ tag: 'body' }],
        },
      },
      {
        frameId: 4,
        result: {
          title: 'Local frame',
          frameUrl: 'https://example.com/frame',
          resultSizeBytes: 300,
          warnings: ['partial visibility data'],
          stats: {
            elementCount: 3,
            totalClicks: 0,
          },
          elements: [{ tag: 'section' }],
        },
      },
    ],
    discoveredFrames: [
      { frameId: 0, url: 'https://example.com' },
      { frameId: 4, url: 'https://example.com/frame' },
      { frameId: 7, url: 'https://cross-origin.example/frame' },
    ],
  });

  assert.equal(result.requestId, 'req-1');
  assert.equal(result.selectedTabId, 99);
  assert.equal(result.title, 'Main page');
  assert.equal(result.url, 'https://example.com');
  assert.equal(result.resultSizeBytes, 1200);
  assert.equal(result.frames.length, 3);
  assert.equal(result.frames[2].skipped, true);
  assert.match(result.frames[2].warnings[0], /not accessible/);
});

test('buildParseResult keeps failed frame results as warnings instead of dropping the whole parse', () => {
  const result = buildParseResult({
    requestId: 'req-4',
    selectedTabId: 44,
    accessibleFrameResults: [
      {
        frameId: 0,
        result: {
          ok: true,
          result: {
            title: 'Main page',
            frameUrl: 'https://example.com',
            resultSizeBytes: 500,
            warnings: [],
            stats: {
              elementCount: 8,
              totalClicks: 1,
            },
            elements: [{ tag: 'main' }],
          },
        },
      },
      {
        frameId: 9,
        result: {
          ok: false,
          frameUrl: 'https://example.com/frame',
          errorMessage: 'collector crashed in child frame',
        },
      },
    ],
    discoveredFrames: [
      { frameId: 0, url: 'https://example.com' },
      { frameId: 9, url: 'https://example.com/frame' },
    ],
  });

  assert.equal(result.title, 'Main page');
  assert.equal(result.frames.length, 2);
  assert.equal(result.frames[1].failed, true);
  assert.match(result.frames[1].warnings[0], /collector crashed/);
});

test('buildParseResult flags main frame failure instead of promoting a child frame', () => {
  const result = buildParseResult({
    requestId: 'req-5',
    selectedTabId: 55,
    accessibleFrameResults: [
      {
        frameId: 0,
        result: {
          ok: false,
          frameUrl: 'https://example.com',
          errorMessage: 'main frame collector crashed',
        },
      },
      {
        frameId: 2,
        result: {
          ok: true,
          result: {
            title: 'Child frame title',
            frameUrl: 'https://example.com/child',
            resultSizeBytes: 100,
            warnings: [],
            stats: {
              elementCount: 2,
              totalClicks: 0,
            },
            elements: [{ tag: 'aside' }],
          },
        },
      },
    ],
    discoveredFrames: [
      { frameId: 0, url: 'https://example.com' },
      { frameId: 2, url: 'https://example.com/child' },
    ],
  });

  assert.equal(result.hasSuccessfulMainFrame, false);
  assert.equal(result.title, '');
  assert.equal(result.url, '');
  assert.match(result.mainFrameErrorMessage, /main frame/i);
});

test('buildParseResult handles empty accessibleFrameResults and discoveredFrames', () => {
  const result = buildParseResult({
    requestId: 'req-empty',
    selectedTabId: 1,
    accessibleFrameResults: [],
    discoveredFrames: [],
  });

  assert.equal(result.hasSuccessfulMainFrame, false);
  assert.equal(result.frames.length, 0);
});
