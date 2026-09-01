import test from 'node:test';
import assert from 'node:assert/strict';
import { shortestSnapAngle, parseWheelDeg } from '../src/input-controller.js';
import { createStandardGame, rotate } from '../src/game-engine.js';

test('parseWheelDeg reads the current rotate() degree value, defaulting to 0 when unset', () => {
  assert.equal(parseWheelDeg('rotate(-180deg)'), -180);
  assert.equal(parseWheelDeg(''), 0);
  assert.equal(parseWheelDeg(undefined), 0);
});

test('shortestSnapAngle takes the short way around the wrap boundary (stop 5 -> stop 0) instead of a near-360deg spin', () => {
  // Naively re-deriving -wheelStop*60 fresh would jump from -300 to 0 (a 300deg spin)
  // for what is really a single clockwise step. The fix must only move 60deg.
  const next = shortestSnapAngle(-300, 0);
  assert.equal(next, -360);
  assert.equal(Math.abs(next - -300), 60);
});

test('shortestSnapAngle takes the short way around the reverse wrap boundary (stop 0 -> stop 5)', () => {
  const next = shortestSnapAngle(0, 5);
  assert.equal(next, 60);
  assert.equal(Math.abs(next - 0), 60);
});

test('shortestSnapAngle moves about 120deg for a two-stop jump', () => {
  assert.equal(shortestSnapAngle(0, 2), -120);
});

test('shortestSnapAngle is a no-op when the wheel is already at an equivalent angle for that stop', () => {
  assert.equal(shortestSnapAngle(-180, 3), -180);
  assert.equal(shortestSnapAngle(180, 3), 180); // an "unwrapped" equivalent is left alone, not renormalized
});

test('repeated clockwise one-step rotations keep the logical wheelStop normalized 0-5 while the visual angle grows unbounded', () => {
  let state = createStandardGame();
  let visualDeg = 0;
  for (let i = 0; i < 20; i++) {
    state = rotate(state, 1).state;
    const next = shortestSnapAngle(visualDeg, state.wheelStop);
    assert.equal(Math.abs(next - visualDeg), 60, `step ${i} should move exactly 60deg`);
    visualDeg = next;
    assert.ok(state.wheelStop >= 0 && state.wheelStop <= 5);
  }
  assert.equal(state.wheelStop, 2); // 20 % 6
  assert.equal(visualDeg, -1200); // continuous: -20 * 60, never re-wrapped back toward 0
});

test('repeated counterclockwise one-step rotations keep the logical wheelStop normalized 0-5 while the visual angle grows unbounded', () => {
  let state = createStandardGame();
  let visualDeg = 0;
  for (let i = 0; i < 20; i++) {
    state = rotate(state, -1).state;
    const next = shortestSnapAngle(visualDeg, state.wheelStop);
    assert.equal(Math.abs(next - visualDeg), 60, `step ${i} should move exactly 60deg`);
    visualDeg = next;
    assert.ok(state.wheelStop >= 0 && state.wheelStop <= 5);
  }
  assert.equal(state.wheelStop, 4); // ((-20 % 6) + 6) % 6
  assert.equal(visualDeg, 1200);
});
