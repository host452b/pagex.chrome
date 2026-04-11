import test from 'node:test';
import assert from 'node:assert/strict';

import { createParseSingleFlight } from '../src/shared/parse-single-flight.js';

test('createParseSingleFlight rejects concurrent starts until the active request finishes', () => {
  const gate = createParseSingleFlight();

  const first = gate.start({
    requestId: 'req-1',
    tabId: 101,
  });

  assert.equal(first.ok, true);
  assert.equal(gate.getActive().requestId, 'req-1');

  const second = gate.start({
    requestId: 'req-2',
    tabId: 202,
  });

  assert.equal(second.ok, false);
  assert.equal(second.activeRequest.requestId, 'req-1');

  gate.finish('req-1');

  const third = gate.start({
    requestId: 'req-3',
    tabId: 303,
  });

  assert.equal(third.ok, true);
  assert.equal(gate.getActive().requestId, 'req-3');
});
