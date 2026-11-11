import test from 'node:test';
import assert from 'node:assert/strict';

import { JSDOM } from 'jsdom';

import { SPRINGS, createMotion, isSpringAtRest, stepSpring } from '../src/popup/jelly.js';

function simulate(spring, target, seconds, dt = 1 / 60) {
  const state = { value: 0, velocity: 0 };
  let peak = 0;

  for (let elapsed = 0; elapsed < seconds; elapsed += dt) {
    stepSpring(state, target, dt, spring);
    peak = Math.max(peak, state.value);
  }

  return { state, peak };
}

test('jelly springs overshoot, then settle on the target', () => {
  const { state, peak } = simulate(SPRINGS.progress, 1, 3);

  assert.ok(peak > 1.01, `expected overshoot, peak was ${peak}`);
  assert.ok(isSpringAtRest(state, 1, 0.001));
});

test('the counter spring is critically damped and never overshoots', () => {
  const { state, peak } = simulate(SPRINGS.count, 100, 3);

  assert.ok(peak <= 100.0001, `numbers must not roll past their value, peak was ${peak}`);
  assert.ok(Math.abs(state.value - 100) < 0.5);
});

test('springs stay stable at the largest frame step the loop allows', () => {
  for (const spring of Object.values(SPRINGS)) {
    const { state } = simulate(spring, 1, 6, 0.05);
    assert.ok(Number.isFinite(state.value) && Math.abs(state.value - 1) < 0.01);
  }
});

function createDomWithFrames({ reduced = false } = {}) {
  const dom = new JSDOM('<!doctype html><main id="app"><ul id="list"><li id="row">Row</li></ul><button id="btn">Go</button></main>');
  const { window } = dom;
  const callbacks = [];
  let now = 0;

  window.requestAnimationFrame = (callback) => {
    callbacks.push(callback);
    return callbacks.length;
  };
  window.matchMedia = () => ({ matches: reduced });
  window.HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
    return { top: 0, left: 0, right: 420, bottom: 40, width: 420, height: 40, x: 0, y: 0 };
  };

  const flush = (frames) => {
    for (let index = 0; index < frames && callbacks.length > 0; index += 1) {
      now += 16;
      callbacks.splice(0).forEach((callback) => callback(now));
    }
  };

  return { window, document: window.document, flush, pending: () => callbacks.length };
}

test('jiggle squashes an element and restores it once at rest, then the loop stops', () => {
  const { document, flush, pending } = createDomWithFrames();
  const motion = createMotion(document.getElementById('app'));
  const row = document.getElementById('row');

  motion.jiggle(row);
  flush(2);
  assert.match(row.style.transform, /^scale\(/);

  flush(240);
  assert.equal(row.style.transform, '');
  assert.equal(pending(), 0, 'no frames are requested while idle');
});

test('agents fly in for running tasks and leave when the job ends', () => {
  const { document, flush } = createDomWithFrames();
  const app = document.getElementById('app');
  const motion = createMotion(app, { clip: document.getElementById('list') });
  const row = document.getElementById('row');

  motion.syncAgents([{ key: 1, element: row, mode: 'collecting', pressTarget: row }]);
  assert.equal(app.querySelectorAll('.swarm__agent').length, 1);

  flush(90);
  const agent = app.querySelector('.swarm__agent');
  assert.match(agent.style.transform, /translate\(/);
  assert.equal(agent.querySelectorAll('g')[1].style.display, '', 'reading shows the I-beam cursor');

  motion.syncAgents([]);
  flush(400);
  assert.equal(motion.agentCount, 0);
  assert.equal(app.querySelectorAll('.swarm__agent').length, 0);
});

test('a finished worker is reused for the next task instead of spawning another', () => {
  const { document, flush } = createDomWithFrames();
  const app = document.getElementById('app');
  const motion = createMotion(app);
  const row = document.getElementById('row');

  motion.syncAgents([{ key: 1, element: row, mode: 'collecting' }]);
  flush(30);
  motion.syncAgents([{ key: 2, element: row, mode: 'injecting' }]);

  assert.equal(motion.agentCount, 1);
  assert.equal(app.querySelectorAll('.swarm__agent').length, 1);
});

test('reduced motion turns every effect into an instant update', () => {
  const { document, pending } = createDomWithFrames({ reduced: true });
  const app = document.getElementById('app');
  const motion = createMotion(app);
  const fill = document.createElement('span');
  const value = document.createElement('span');

  motion.jiggle(document.getElementById('row'));
  motion.progress(fill, 0.5);
  motion.countTo(value, 1234, (n) => String(Math.round(n)));
  motion.syncAgents([{ key: 1, element: document.getElementById('row'), mode: 'collecting' }]);

  assert.equal(fill.style.width, '50%');
  assert.equal(value.textContent, '1234');
  assert.equal(app.querySelector('.swarm'), null);
  assert.equal(app.classList.contains('motion-on'), false);
  assert.equal(pending(), 0);
});
