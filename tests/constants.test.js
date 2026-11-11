import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PAGEX_BATCH_LIMITS,
  PAGEX_JOB_KEY,
  PAGEX_MESSAGE_TYPES,
  PAGEX_PARSE_OPTIONS,
  PAGEX_RESULT_KEY_PREFIX,
  PAGEX_STAGES,
} from '../src/shared/constants.js';

test('storage keys are namespaced and distinct', () => {
  assert.equal(PAGEX_JOB_KEY, 'pagex.job');
  assert.ok(PAGEX_RESULT_KEY_PREFIX.startsWith('pagex.'));
  assert.ok(!PAGEX_JOB_KEY.startsWith(PAGEX_RESULT_KEY_PREFIX));
});

test('PAGEX_MESSAGE_TYPES contains batch start and stop', () => {
  assert.equal(PAGEX_MESSAGE_TYPES.START_BATCH, 'pagex/start-batch');
  assert.equal(PAGEX_MESSAGE_TYPES.STOP_BATCH, 'pagex/stop-batch');
});

test('PAGEX_STAGES weights increase through the pipeline', () => {
  const weights = ['queued', 'preparing', 'injecting', 'collecting', 'finalizing'].map(
    (key) => PAGEX_STAGES[key].weight,
  );

  for (let index = 1; index < weights.length; index += 1) {
    assert.ok(weights[index] > weights[index - 1]);
  }

  assert.ok(weights.at(-1) < 1);
});

test('PAGEX_BATCH_LIMITS keeps batches bounded', () => {
  assert.ok(PAGEX_BATCH_LIMITS.maxTabs >= 1);
  assert.ok(PAGEX_BATCH_LIMITS.concurrency >= 1);
  assert.ok(PAGEX_BATCH_LIMITS.concurrency <= PAGEX_BATCH_LIMITS.maxTabs);
});

test('PAGEX_PARSE_OPTIONS is frozen and contains all required numeric fields', () => {
  assert.ok(Object.isFrozen(PAGEX_PARSE_OPTIONS));

  const requiredFields = [
    'maxExpandRounds',
    'maxClicksPerRound',
    'maxTotalClicks',
    'enableAutoScroll',
    'autoScrollPasses',
    'clickDelayMs',
    'settleDelayMs',
    'scrollDelayMs',
    'expandBudgetMs',
    'scrollBudgetMs',
    'hardTimeoutMs',
    'maxTextLength',
    'maxAttributeValueLength',
    'maxElements',
    'maxResultBytes',
  ];

  for (const field of requiredFields) {
    assert.ok(
      field in PAGEX_PARSE_OPTIONS,
      `PAGEX_PARSE_OPTIONS should contain ${field}`,
    );
  }
});

test('PAGEX_PARSE_OPTIONS cannot be modified at runtime', () => {
  assert.throws(() => {
    PAGEX_PARSE_OPTIONS.maxElements = 9999;
  }, TypeError);
});
