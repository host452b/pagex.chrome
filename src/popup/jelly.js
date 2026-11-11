// Jelly motion for the popup, inspired by the Swarm site's cursor engine:
// everything is a small physics simulation stepped once per animation frame
// (springs with overshoot, press-squash on click, leaning into motion)
// rather than fixed CSS keyframes. The loop only runs while something moves.

const MAX_DT = 0.05;
const SVG_NS = 'http://www.w3.org/2000/svg';

export const SPRINGS = Object.freeze({
  squash: { stiffness: 380, damping: 9 },
  shake: { stiffness: 520, damping: 13 },
  progress: { stiffness: 120, damping: 13 },
  count: { stiffness: 140, damping: 2 * Math.sqrt(140) },
  agent: { stiffness: 55, damping: 8.5 },
});

/** Semi-implicit Euler step of a damped spring toward `target`. */
export function stepSpring(state, target, dt, { stiffness, damping }) {
  const force = stiffness * (target - state.value) - damping * state.velocity;
  state.velocity += force * dt;
  state.value += state.velocity * dt;

  return state;
}

export function isSpringAtRest(state, target, epsilon = 0.001) {
  return Math.abs(target - state.value) < epsilon && Math.abs(state.velocity) < epsilon * 10;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

const AGENT_COLORS = ['#ab3a2c', '#3f5a8c', '#b07a1f', '#2f6b45', '#7a3b69'];

// Own cursor geometry (24×24). `hotspot` is the point that sits on (x, y).
const AGENT_SHAPES = {
  arrow: {
    hotspot: [4, 3],
    build: (g, color, path) => {
      g.appendChild(path('M4 3 L4 19.5 L8.6 15.2 L11.6 21.4 L14.4 20.1 L11.5 14 L17.6 13.6 Z', {
        fill: color,
        stroke: '#fff',
        'stroke-width': '1.5',
        'stroke-linejoin': 'round',
      }));
    },
  },
  ibeam: {
    hotspot: [12, 12],
    build: (g, color, path) => {
      const d = 'M8.5 4.5 H15.5 M12 4.5 V19.5 M8.5 19.5 H15.5';
      g.appendChild(path(d, { fill: 'none', stroke: '#fff', 'stroke-width': '4', 'stroke-linecap': 'round' }));
      g.appendChild(path(d, { fill: 'none', stroke: color, 'stroke-width': '1.8', 'stroke-linecap': 'round' }));
    },
  },
  pen: {
    hotspot: [3, 3],
    build: (g, color, path) => {
      g.appendChild(path('M3 3 L13.5 6.5 L19 12 L12 19 L6.5 13.5 Z', {
        fill: color,
        stroke: '#fff',
        'stroke-width': '1.5',
        'stroke-linejoin': 'round',
      }));
      g.appendChild(path('M3.6 3.6 L9.4 9.4', { fill: 'none', stroke: '#fff', 'stroke-width': '1.3', 'stroke-linecap': 'round' }));
      g.appendChild(path('M17.5 16.5 L21 20', { fill: 'none', stroke: color, 'stroke-width': '3', 'stroke-linecap': 'round' }));
    },
  },
};

function makePath(doc, d, attributes) {
  const element = doc.createElementNS(SVG_NS, 'path');
  element.setAttribute('d', d);

  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }

  return element;
}

const MODE_SHAPES = {
  collecting: 'ibeam',
  finalizing: 'pen',
};

/**
 * @param {HTMLElement} root  positioned container the agents fly over
 * @param {{ clip?: HTMLElement }} [options]  scroll box whose visible area bounds row targets
 */
export function createMotion(root, { clip = null } = {}) {
  const win = root.ownerDocument.defaultView;
  const reduced =
    typeof win.requestAnimationFrame !== 'function' ||
    (typeof win.matchMedia === 'function' &&
      win.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const animators = new Set();
  let frame = 0;
  let lastFrameAt = null;
  let time = 0;

  function tick(now) {
    const dt = lastFrameAt === null ? 1 / 60 : clamp((now - lastFrameAt) / 1000, 0, MAX_DT);
    lastFrameAt = now;
    time += dt;

    for (const animator of [...animators]) {
      if (!animator(dt, time)) {
        animators.delete(animator);
      }
    }

    if (animators.size > 0) {
      frame = win.requestAnimationFrame(tick);
    } else {
      frame = 0;
      lastFrameAt = null;
    }
  }

  function run(animator) {
    animators.add(animator);

    if (!frame) {
      frame = win.requestAnimationFrame(tick);
    }
  }

  if (!reduced) {
    root.classList.add('motion-on');
  }

  // ── Jiggle: squash-and-stretch or a sideways "no" shake ──────────────

  const jiggles = new WeakMap();

  function jiggle(element, { strength = 1, kind = 'squash', delay = 0 } = {}) {
    if (reduced || !element) {
      return;
    }

    if (delay > 0) {
      win.setTimeout(() => jiggle(element, { strength, kind }), delay * 1000);
      return;
    }

    let state = jiggles.get(element);

    if (!state || state.kind !== kind) {
      // Cap the wobble in pixels, so a wide row squishes as gently as a chip.
      const width = Math.max(element.offsetWidth || 0, 1);
      const height = Math.max(element.offsetHeight || 0, 1);
      state = {
        value: 0,
        velocity: 0,
        kind,
        active: false,
        sx: Math.min(1, 10 / (width * 0.16)),
        sy: Math.min(1, 8 / (height * 0.16)),
      };
      jiggles.set(element, state);
    }

    state.velocity += (kind === 'shake' ? 70 : 3.2) * strength;

    if (state.active) {
      return;
    }

    state.active = true;
    run((dt) => {
      stepSpring(state, 0, dt, SPRINGS[kind]);

      if (isSpringAtRest(state, 0, kind === 'shake' ? 0.05 : 0.0008)) {
        state.value = 0;
        state.velocity = 0;
        state.active = false;
        element.style.transform = '';
        return false;
      }

      if (kind === 'shake') {
        element.style.transform = `translateX(${state.value.toFixed(2)}px)`;
      } else {
        const v = clamp(state.value, -0.16, 0.16);
        element.style.transform = `scale(${(1 + v * state.sx).toFixed(4)}, ${(1 - v * state.sy).toFixed(4)})`;
      }

      return true;
    });
  }

  // ── Progress bar: spring-driven width with a little vertical wobble ──

  const progressStates = new WeakMap();

  function progress(element, fraction) {
    const target = clamp(fraction, 0, 1);

    if (reduced) {
      element.style.width = `${target * 100}%`;
      return;
    }

    let state = progressStates.get(element);

    if (!state) {
      state = { value: 0, velocity: 0, target, active: false };
      progressStates.set(element, state);
    }

    state.target = target;

    if (state.active) {
      return;
    }

    state.active = true;
    run((dt) => {
      stepSpring(state, state.target, dt, SPRINGS.progress);

      const done = isSpringAtRest(state, state.target, 0.0005);

      if (done) {
        state.value = state.target;
        state.velocity = 0;
      }

      element.style.width = `${clamp(state.value, 0, 1.03) * 100}%`;
      element.style.transform = `scaleY(${(1 + Math.min(0.9, Math.abs(state.velocity) * 0.9)).toFixed(3)})`;

      if (done) {
        element.style.transform = '';
        state.active = false;
        return false;
      }

      return true;
    });
  }

  function resetProgress(element) {
    const state = progressStates.get(element);

    if (state) {
      state.value = 0;
      state.velocity = 0;
      state.target = 0;
    }

    element.style.width = '0%';
  }

  // ── Numbers that roll to their new value ─────────────────────────────

  const counters = new WeakMap();

  function countTo(element, value, format = (n) => String(Math.round(n))) {
    let state = counters.get(element);

    if (!state) {
      state = { value: 0, velocity: 0, target: 0, active: false, format };
      counters.set(element, state);
    }

    state.format = format;

    if (reduced || (state.target === value && !state.active)) {
      state.value = value;
      state.target = value;
      element.textContent = format(value);
      return;
    }

    state.target = value;

    if (state.active) {
      return;
    }

    state.active = true;
    run((dt) => {
      if (!state.active) {
        return false;
      }

      stepSpring(state, state.target, dt, SPRINGS.count);

      const done = isSpringAtRest(state, state.target, 0.5);

      if (done) {
        state.value = state.target;
        state.velocity = 0;
        state.active = false;
      }

      element.textContent = state.format(Math.max(0, state.value));

      return !done;
    });
  }

  /** Shows plain text (e.g. "–") and stops any roll in progress. */
  function setText(element, text) {
    const state = counters.get(element);

    if (state) {
      state.active = false;
      state.value = 0;
      state.velocity = 0;
      state.target = 0;
    }

    element.textContent = text;
  }

  // ── Agents: little cursors that fly to rows being read ───────────────

  const layer = root.ownerDocument.createElement('div');
  layer.className = 'swarm';
  layer.setAttribute('aria-hidden', 'true');

  if (!reduced) {
    root.appendChild(layer);
  }

  const agents = new Map();
  let spawnCount = 0;
  let pointer = null;
  let agentLoopActive = false;

  root.addEventListener('pointermove', (event) => {
    const box = root.getBoundingClientRect();
    pointer = { x: event.clientX - box.left, y: event.clientY - box.top };
  });
  root.addEventListener('pointerleave', () => {
    pointer = null;
  });

  function createAgentElement(color) {
    const element = root.ownerDocument.createElement('div');
    element.className = 'swarm__agent';

    const svg = root.ownerDocument.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '24');
    svg.setAttribute('height', '24');

    const groups = {};

    for (const [name, shape] of Object.entries(AGENT_SHAPES)) {
      const group = root.ownerDocument.createElementNS(SVG_NS, 'g');
      shape.build(group, color, (d, attributes) => makePath(root.ownerDocument, d, attributes));
      group.style.display = name === 'arrow' ? '' : 'none';
      svg.appendChild(group);
      groups[name] = group;
    }

    element.appendChild(svg);
    layer.appendChild(element);

    return { element, groups };
  }

  function spawnAgent(key) {
    const box = root.getBoundingClientRect();
    const fromLeft = spawnCount % 2 === 0;
    const color = AGENT_COLORS[spawnCount % AGENT_COLORS.length];
    const { element, groups } = createAgentElement(color);

    spawnCount += 1;

    const agent = {
      key,
      x: fromLeft ? -28 : box.width + 28,
      y: box.height * (0.25 + Math.random() * 0.4),
      vx: 0,
      vy: 0,
      angle: 0,
      press: 0,
      shape: 'arrow',
      phase: Math.random() * Math.PI * 2,
      nextClickAt: 0,
      task: null,
      leaving: false,
      exitX: fromLeft ? -40 : box.width + 40,
      element,
      groups,
    };

    agents.set(key, agent);

    return agent;
  }

  function setShape(agent, shape) {
    if (agent.shape === shape) {
      return;
    }

    agent.groups[agent.shape].style.display = 'none';
    agent.groups[shape].style.display = '';
    agent.shape = shape;
  }

  function targetFor(agent, rootBox, now) {
    if (agent.leaving || !agent.task || !agent.task.element.isConnected) {
      return { x: agent.exitX, y: agent.y + agent.vy * 0.05 };
    }

    const box = agent.task.element.getBoundingClientRect();
    const wanderX = Math.sin(now * 1.7 + agent.phase) * 14;
    const wanderY = Math.cos(now * 2.3 + agent.phase) * 4;
    let x;
    let y = box.top + box.height / 2 + wanderY;

    if (agent.task.mode === 'celebrate') {
      x = box.left + box.width * (0.35 + 0.3 * ((agent.slot ?? 0) % 3) / 2) + wanderX * 0.3;
      y = box.top + box.height * 0.6 + wanderY * 0.5;
    } else {
      x = box.right - 78 + wanderX;
    }

    if (clip && agent.task.mode !== 'celebrate') {
      const clipBox = clip.getBoundingClientRect();
      y = clamp(y, clipBox.top + 8, clipBox.bottom - 8);
    }

    return { x: x - rootBox.left, y: y - rootBox.top };
  }

  function stepAgents(dt, now) {
    const rootBox = root.getBoundingClientRect();

    for (const agent of [...agents.values()]) {
      const target = targetFor(agent, rootBox, now);
      const { stiffness, damping } = SPRINGS.agent;
      let ax = stiffness * (target.x - agent.x) - damping * agent.vx;
      let ay = stiffness * (target.y - agent.y) - damping * agent.vy;
      const accel = Math.hypot(ax, ay);
      const maxAccel = agent.leaving ? 5200 : 3800;

      if (accel > maxAccel) {
        ax *= maxAccel / accel;
        ay *= maxAccel / accel;
      }

      agent.vx += ax * dt;
      agent.vy += ay * dt;

      const speed = Math.hypot(agent.vx, agent.vy);
      const maxSpeed = 820;

      if (speed > maxSpeed) {
        agent.vx *= maxSpeed / speed;
        agent.vy *= maxSpeed / speed;
      }

      // Get out of the way of the user's pointer.
      if (pointer) {
        const dx = agent.x - pointer.x;
        const dy = agent.y - pointer.y;
        const distance = Math.hypot(dx, dy) || 0.01;

        if (distance < 34) {
          agent.vx += (dx / distance) * 240;
          agent.vy += (dy / distance) * 240;
        }
      }

      agent.x += agent.vx * dt;
      agent.y += agent.vy * dt;

      const arrived = Math.hypot(target.x - agent.x, target.y - agent.y) < 16;

      if (agent.task && !agent.leaving) {
        setShape(agent, MODE_SHAPES[agent.task.mode] || 'arrow');

        if (agent.task.mode === 'celebrate') {
          if (arrived && !agent.clicked) {
            agent.clicked = true;
            agent.press = 1;
            agent.leaveAt = now + 0.35 + (agent.slot ?? 0) * 0.08;
            jiggle(agent.task.element, { strength: 1.1 });
          }

          if (agent.clicked && now >= agent.leaveAt) {
            agent.leaving = true;
            setShape(agent, 'arrow');
          }
        } else if (arrived && now >= agent.nextClickAt) {
          agent.press = 1;
          agent.nextClickAt = now + 0.7 + Math.random() * 0.7;

          if (agent.task.pressTarget) {
            jiggle(agent.task.pressTarget, { strength: 0.45 });
          }
        }
      } else {
        setShape(agent, 'arrow');
      }

      agent.press = Math.max(0, agent.press - dt * 6);

      const lean = clamp(agent.vx * 0.035, -24, 24);
      agent.angle += (lean - agent.angle) * Math.min(1, dt * 10);

      const stretch = Math.min(0.2, speed / 3200);
      const squish = 1 - agent.press * 0.14;
      const [hx, hy] = AGENT_SHAPES[agent.shape].hotspot;

      agent.element.style.transformOrigin = `${hx}px ${hy}px`;
      agent.element.style.transform =
        `translate(${(agent.x - hx).toFixed(1)}px, ${(agent.y - hy).toFixed(1)}px) ` +
        `rotate(${agent.angle.toFixed(1)}deg) ` +
        `scale(${(squish * (1 + stretch)).toFixed(3)}, ${(squish * (1 - stretch * 0.6)).toFixed(3)})`;

      const outside = agent.x < -36 || agent.x > rootBox.width + 36;

      if (agent.leaving && outside) {
        agent.element.remove();
        agents.delete(agent.key);
      }
    }

    agentLoopActive = agents.size > 0;

    return agentLoopActive;
  }

  function ensureAgentLoop() {
    if (!agentLoopActive && agents.size > 0) {
      agentLoopActive = true;
      run(stepAgents);
    }
  }

  /**
   * Keeps one agent per active task. Tasks: { key, element, mode, pressTarget }.
   * Agents whose task disappeared fly off, or are reused for a new task.
   */
  function syncAgents(tasks) {
    if (reduced) {
      return;
    }

    const wanted = new Map(tasks.filter((task) => task.element).map((task) => [String(task.key), task]));

    for (const agent of agents.values()) {
      if (!wanted.has(agent.key) && agent.task?.mode !== 'celebrate') {
        agent.leaving = true;
        agent.task = null;
      }
    }

    for (const [key, task] of wanted) {
      let agent = agents.get(key);

      if (!agent) {
        // Reuse a worker that is on its way out: it walks over to the next task.
        const spare = [...agents.values()].find((candidate) => candidate.leaving);

        if (spare) {
          agents.delete(spare.key);
          spare.key = key;
          agents.set(key, spare);
          agent = spare;
        } else {
          agent = spawnAgent(key);
        }
      }

      agent.leaving = false;
      agent.task = task;
    }

    ensureAgentLoop();
  }

  /** All agents gather on `element`, click it once, then leave. */
  function celebrate(element) {
    if (reduced || !element) {
      jiggle(element, { strength: 1 });
      return;
    }

    let slot = 0;

    for (const agent of agents.values()) {
      agent.leaving = false;
      agent.clicked = false;
      agent.slot = slot;
      agent.task = { element, mode: 'celebrate' };
      slot += 1;
    }

    if (agents.size === 0) {
      jiggle(element, { strength: 1.1 });
    }

    ensureAgentLoop();
  }

  return {
    reduced,
    jiggle,
    progress,
    resetProgress,
    countTo,
    setText,
    syncAgents,
    celebrate,
    get agentCount() {
      return agents.size;
    },
  };
}
