import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createInputController, shortestSnapAngle, parseWheelDeg } from '../src/input-controller.js';
import { createStandardGame, rotate, transferChuteToCenter, transferCenterToChute, contextualTransfer } from '../src/game-engine.js';

// Geometric helper: the inverse of angleFromCenter (0=down/6 o'clock, clockwise-positive),
// used only to build test fixtures — not a mirror of any implementation internal.
function pointAtAngle(rect, angleDeg, radius) {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx - radius * Math.sin(rad), y: cy + radius * Math.cos(rad) };
}

function mod(n, m) { return ((n % m) + m) % m; }

const transformDeg = el => parseWheelDeg(el.style.transform);

function setup({ startStop = 0, center = null } = {}) {
  const dom = new JSDOM('<!doctype html><div id="board"><div id="wheel"></div><button id="centerSlot"></button></div>');
  const { window } = dom;
  const { document } = window;
  const board = document.getElementById('board');
  const wheel = document.getElementById('wheel');
  const centerSlot = document.getElementById('centerSlot');
  const rect = { left: 0, top: 0, right: 200, bottom: 200, width: 200, height: 200 };
  board.getBoundingClientRect = () => rect;
  centerSlot.getBoundingClientRect = () => ({ left: 78, top: 78, right: 122, bottom: 122, width: 44, height: 44 });
  wheel.dataset.stop = String(startStop);
  wheel.style.transform = `rotate(${-startStop * 60}deg)`;

  let state = createStandardGame();
  state.wheelStop = startStop;
  state.center = center;

  let started = false;
  const calls = { rotate: [], chuteToCenter: 0, centerToChute: 0, transfer: 0 };
  const onRotateStop = deltaStops => {
    calls.rotate.push(deltaStops);
    const result = rotate(state, deltaStops);
    state = result.state;
    wheel.dataset.stop = String(state.wheelStop);
    wheel.style.transform = `rotate(${shortestSnapAngle(parseWheelDeg(wheel.style.transform), state.wheelStop)}deg)`;
    if (result.changed) started = true;
  };
  const onChuteToCenter = () => {
    calls.chuteToCenter += 1;
    const result = transferChuteToCenter(state);
    state = result.state;
    if (result.changed) started = true;
  };
  const onCenterToChute = () => {
    calls.centerToChute += 1;
    const result = transferCenterToChute(state);
    state = result.state;
    if (result.changed) started = true;
  };
  // Contextual tap: direction is decided by hub occupancy, not by which of
  // the two zones (chute vs hub) was actually tapped.
  const onTransfer = () => {
    calls.transfer += 1;
    const result = contextualTransfer(state);
    state = result.state;
    if (result.changed) started = true;
  };

  createInputController({ board, wheel, centerSlot, onRotateStop, onChuteToCenter, onCenterToChute, onTransfer, isEnabled: () => true });

  return {
    board, wheel, centerSlot, rect, calls,
    getState: () => state,
    isStarted: () => started,
    onRotateStop,
    fire: (el, type, props) => {
      const ev = new window.Event(type, { bubbles: true, cancelable: true });
      Object.assign(ev, props);
      el.dispatchEvent(ev);
    }
  };
}

test('clockwise drag rotates the live wheel preview clockwise (positive CSS degrees)', () => {
  const { wheel, rect, fire, board } = setup();
  const start = pointAtAngle(rect, 90, 80);
  const end = pointAtAngle(rect, 150, 80); // 60deg further clockwise
  fire(board, 'pointerdown', { pointerId: 1, clientX: start.x, clientY: start.y });
  fire(board, 'pointermove', { pointerId: 1, clientX: end.x, clientY: end.y });
  const deg = transformDeg(wheel);
  assert.equal(Math.round(deg), 60, `expected clockwise live preview (+60deg), got ${deg}`);
});

test('counterclockwise drag rotates the live wheel preview counterclockwise (negative CSS degrees)', () => {
  const { wheel, rect, fire, board } = setup();
  const start = pointAtAngle(rect, 150, 80);
  const end = pointAtAngle(rect, 90, 80); // 60deg further counterclockwise
  fire(board, 'pointerdown', { pointerId: 1, clientX: start.x, clientY: start.y });
  fire(board, 'pointermove', { pointerId: 1, clientX: end.x, clientY: end.y });
  const deg = transformDeg(wheel);
  assert.equal(Math.round(deg), -60, `expected counterclockwise live preview (-60deg), got ${deg}`);
});

test('a rotate drag snaps to the nearest 60-degree stop on release and updates wheelStop', () => {
  const { wheel, rect, fire, board, getState, calls } = setup();
  const start = pointAtAngle(rect, 90, 80);
  const end = pointAtAngle(rect, 150, 80);
  fire(board, 'pointerdown', { pointerId: 1, clientX: start.x, clientY: start.y });
  fire(board, 'pointermove', { pointerId: 1, clientX: end.x, clientY: end.y });
  fire(board, 'pointerup', { pointerId: 1, clientX: end.x, clientY: end.y });
  assert.deepEqual(calls.rotate, [-1]);
  assert.equal(getState().wheelStop, 5);
  assert.equal(wheel.dataset.stop, '5');
  assert.equal(mod(Math.round(transformDeg(wheel)), 60), 0);
});

test('a tiny drag that resolves back to the same stop still snaps cleanly', () => {
  const { wheel, rect, fire, board, getState, calls } = setup();
  const start = pointAtAngle(rect, 90, 80);
  const jiggle = { x: start.x + 15, y: start.y }; // > tapPx(10), < minimumGesturePx(22) => classified 'rotate'
  fire(board, 'pointerdown', { pointerId: 1, clientX: start.x, clientY: start.y });
  fire(board, 'pointermove', { pointerId: 1, clientX: jiggle.x, clientY: jiggle.y });
  fire(board, 'pointerup', { pointerId: 1, clientX: start.x, clientY: start.y }); // back to start -> 'tap'
  assert.equal(mod(Math.round(transformDeg(wheel)), 60), 0, 'wheel left unsnapped after a tap that followed a small rotate jiggle');
  assert.equal(getState().wheelStop, 0);
  assert.equal(calls.chuteToCenter, 0);
  assert.equal(calls.centerToChute, 0);
});

test('a drag that resolves to a transfer-sector release still snaps the wheel to a 60-degree stop', () => {
  const { wheel, rect, fire, board, calls } = setup();
  const start = pointAtAngle(rect, 10, 80); // near bottom
  const dirty = { x: start.x + 20, y: start.y }; // rotate-classified nudge, dirties the live transform
  const release = pointAtAngle(rect, 10, 20); // strong radial-inward release -> transfer-in
  fire(board, 'pointerdown', { pointerId: 1, clientX: start.x, clientY: start.y });
  fire(board, 'pointermove', { pointerId: 1, clientX: dirty.x, clientY: dirty.y });
  fire(board, 'pointerup', { pointerId: 1, clientX: release.x, clientY: release.y });
  assert.equal(mod(Math.round(transformDeg(wheel)), 60), 0, 'wheel left at an unsnapped angle after a transfer-classified release');
  assert.equal(calls.chuteToCenter, 1);
});

test('pointercancel snaps the wheel back without committing a transfer', () => {
  const { wheel, rect, fire, board, calls } = setup();
  const start = pointAtAngle(rect, 10, 80);
  const dirty = { x: start.x + 20, y: start.y };
  const cancelPoint = pointAtAngle(rect, 10, 20);
  fire(board, 'pointerdown', { pointerId: 1, clientX: start.x, clientY: start.y });
  fire(board, 'pointermove', { pointerId: 1, clientX: dirty.x, clientY: dirty.y });
  fire(board, 'pointercancel', { pointerId: 1, clientX: cancelPoint.x, clientY: cancelPoint.y });
  assert.equal(mod(Math.round(transformDeg(wheel)), 60), 0);
  assert.equal(calls.chuteToCenter, 0);
  assert.equal(calls.centerToChute, 0);
});

test('release with coordinates far outside the board bounds still resolves and snaps (pointer-capture path)', () => {
  const { wheel, rect, fire, board, calls } = setup();
  const start = pointAtAngle(rect, 90, 80);
  const farOutside = pointAtAngle(rect, 150, 5000); // same angle as a normal rotate end, but way outside the rect
  fire(board, 'pointerdown', { pointerId: 1, clientX: start.x, clientY: start.y });
  fire(board, 'pointermove', { pointerId: 1, clientX: farOutside.x, clientY: farOutside.y });
  fire(board, 'pointerup', { pointerId: 1, clientX: farOutside.x, clientY: farOutside.y });
  assert.equal(mod(Math.round(transformDeg(wheel)), 60), 0);
  assert.deepEqual(calls.rotate, [-1]);
});

function hubTapPoint(centerSlot) {
  const r = centerSlot.getBoundingClientRect();
  return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
}

function tap(fire, board, point) {
  fire(board, 'pointerdown', { pointerId: 1, clientX: point.x, clientY: point.y });
  fire(board, 'pointerup', { pointerId: 1, clientX: point.x, clientY: point.y });
}

test('center empty + tap active chute => chute -> hub', () => {
  const { rect, fire, board, calls, getState } = setup();
  getState().chutes[0] = ['yellow', 'blue', null, null, null]; // passer chute is active at stop 0
  tap(fire, board, pointAtAngle(rect, 10, 80)); // near bottom, outside the hub
  assert.equal(calls.transfer, 1);
  assert.equal(getState().center, 'blue');
  assert.equal(getState().moves, 1);
});

test('center empty + tap hub => chute -> hub', () => {
  const { fire, board, centerSlot, calls, getState } = setup();
  getState().chutes[0] = ['yellow', 'blue', null, null, null];
  tap(fire, board, hubTapPoint(centerSlot));
  assert.equal(calls.transfer, 1);
  assert.equal(getState().center, 'blue');
  assert.equal(getState().moves, 1);
});

test('center occupied + tap active chute => hub -> chute', () => {
  const { rect, fire, board, calls, getState } = setup({ center: 'green' });
  getState().chutes[0] = ['yellow', 'blue', null, null, null];
  tap(fire, board, pointAtAngle(rect, 10, 80));
  assert.equal(calls.transfer, 1);
  assert.equal(getState().center, null);
  assert.ok(getState().chutes[0].includes('green'));
  assert.equal(getState().moves, 1);
});

test('center occupied + tap hub => hub -> chute', () => {
  const { fire, board, centerSlot, calls, getState } = setup({ center: 'green' });
  getState().chutes[0] = ['yellow', 'blue', null, null, null];
  tap(fire, board, hubTapPoint(centerSlot));
  assert.equal(calls.transfer, 1);
  assert.equal(getState().center, null);
  assert.ok(getState().chutes[0].includes('green'));
  assert.equal(getState().moves, 1);
});

test('empty active chute + empty hub => tap is dispatched but produces no state or move change', () => {
  const { rect, fire, board, calls, getState, isStarted } = setup(); // passer chute (active) and hub both start empty
  tap(fire, board, pointAtAngle(rect, 10, 80));
  assert.equal(calls.transfer, 1);
  assert.equal(getState().center, null);
  assert.equal(getState().moves, 0);
  assert.equal(isStarted(), false, 'an invalid transfer must not start the timer');
});

test('full active chute + occupied hub => tap is dispatched but produces no state or move change', () => {
  const { fire, board, centerSlot, calls, getState, isStarted } = setup({ startStop: 1, center: 'green' }); // chute 1 starts full
  tap(fire, board, hubTapPoint(centerSlot));
  assert.equal(calls.transfer, 1);
  assert.equal(getState().center, 'green');
  assert.equal(getState().moves, 0);
  assert.equal(isStarted(), false, 'an invalid transfer must not start the timer');
});

test('a successful contextual transfer counts exactly one move and starts the timer', () => {
  const { rect, fire, board, getState, isStarted } = setup();
  getState().chutes[0] = ['yellow', null, null, null, null];
  tap(fire, board, pointAtAngle(rect, 10, 80));
  assert.equal(getState().moves, 1);
  assert.equal(isStarted(), true);
});

test('a tap outside the transfer zone triggers no transfer and no move', () => {
  const { rect, fire, board, calls, getState } = setup();
  const tapPoint = pointAtAngle(rect, 90, 80); // left side, well away from the active chute / hub
  fire(board, 'pointerdown', { pointerId: 1, clientX: tapPoint.x, clientY: tapPoint.y });
  fire(board, 'pointerup', { pointerId: 1, clientX: tapPoint.x, clientY: tapPoint.y });
  assert.equal(calls.transfer, 0);
  assert.equal(calls.chuteToCenter, 0);
  assert.equal(calls.centerToChute, 0);
  assert.equal(getState().moves, 0);
});

test('the transfer zone stays within the active chute\'s own 60deg slice and does not reach a neighboring chute', () => {
  const { rect, fire, board, calls } = setup();
  fire(board, 'pointerdown', { pointerId: 1, clientX: pointAtAngle(rect, 29, 80).x, clientY: pointAtAngle(rect, 29, 80).y });
  fire(board, 'pointerup', { pointerId: 1, clientX: pointAtAngle(rect, 29, 80).x, clientY: pointAtAngle(rect, 29, 80).y });
  assert.equal(calls.transfer, 1, '29deg (within the active chute\'s own half-slice) should still register as a transfer tap');

  const { fire: fire2, board: board2, calls: calls2 } = setup();
  const p = pointAtAngle(rect, 31, 80);
  fire2(board2, 'pointerdown', { pointerId: 1, clientX: p.x, clientY: p.y });
  fire2(board2, 'pointerup', { pointerId: 1, clientX: p.x, clientY: p.y });
  assert.equal(calls2.transfer, 0, '31deg (past the midpoint to the neighboring chute) must not register as a transfer tap');
});

test('an outward radial swipe still dispatches center-to-chute (existing swipe behavior preserved)', () => {
  const { rect, fire, board, calls, getState } = setup({ center: 'red' });
  const start = pointAtAngle(rect, 10, 20);
  const end = pointAtAngle(rect, 10, 80);
  fire(board, 'pointerdown', { pointerId: 1, clientX: start.x, clientY: start.y });
  fire(board, 'pointerup', { pointerId: 1, clientX: end.x, clientY: end.y });
  assert.equal(calls.centerToChute, 1);
  assert.equal(calls.chuteToCenter, 0);
  assert.equal(getState().center, null);
});

test('the wheel remains rotatable while the center holds a ball', () => {
  const { wheel, rect, fire, board, getState, calls } = setup({ center: 'yellow' });
  const start = pointAtAngle(rect, 90, 80);
  const end = pointAtAngle(rect, 150, 80);
  fire(board, 'pointerdown', { pointerId: 1, clientX: start.x, clientY: start.y });
  fire(board, 'pointermove', { pointerId: 1, clientX: end.x, clientY: end.y });
  fire(board, 'pointerup', { pointerId: 1, clientX: end.x, clientY: end.y });
  assert.deepEqual(calls.rotate, [-1]);
  assert.equal(getState().wheelStop, 5);
  assert.equal(getState().center, 'yellow');
  assert.equal(mod(Math.round(transformDeg(wheel)), 60), 0);
});

test('six successive clockwise one-step rotations stay continuous across the wrap boundary (rotate-button path)', () => {
  const { wheel, getState, onRotateStop } = setup({ startStop: 4 }); // wraps after 2 steps
  const degs = [transformDeg(wheel)];
  for (let i = 0; i < 6; i++) {
    onRotateStop(1);
    degs.push(transformDeg(wheel));
  }
  for (let i = 1; i < degs.length; i++) {
    assert.equal(degs[i] - degs[i - 1], -60, `step ${i} moved ${degs[i] - degs[i - 1]}deg instead of -60deg`);
  }
  assert.equal(getState().wheelStop, 4); // (4 + 6) % 6
});

test('six successive counterclockwise one-step rotations stay continuous across the wrap boundary (rotate-button path)', () => {
  const { wheel, getState, onRotateStop } = setup({ startStop: 1 }); // wraps after 1 step
  const degs = [transformDeg(wheel)];
  for (let i = 0; i < 6; i++) {
    onRotateStop(-1);
    degs.push(transformDeg(wheel));
  }
  for (let i = 1; i < degs.length; i++) {
    assert.equal(degs[i] - degs[i - 1], 60, `step ${i} moved ${degs[i] - degs[i - 1]}deg instead of +60deg`);
  }
  assert.equal(getState().wheelStop, 1); // (1 - 6 + 12) % 6
});
