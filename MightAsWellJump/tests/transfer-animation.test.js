import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { playTransferFlight } from '../src/transfer-animation.js';

function makeContainer() {
  const dom = new JSDOM('<!doctype html><div id="board"></div>');
  return dom.window.document.getElementById('board');
}

test('playTransferFlight appends a colored, direction-tagged flight ball', () => {
  const container = makeContainer();
  playTransferFlight({ container, color: 'blue', direction: 'in', duration: 10 });
  const ball = container.querySelector('.flight-ball');
  assert.ok(ball, 'expected a flight-ball element to be appended');
  assert.ok(ball.classList.contains('flight-in'));
  assert.ok(ball.classList.contains('ball'));
  assert.ok(ball.classList.contains('blue'));
});

test('playTransferFlight removes its element after the animation duration elapses, without being asked', async () => {
  const container = makeContainer();
  playTransferFlight({ container, color: 'red', direction: 'out', duration: 10 });
  assert.equal(container.querySelectorAll('.flight-ball').length, 1);
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(container.querySelectorAll('.flight-ball').length, 0);
});

test('playTransferFlight cleans up immediately under reduced motion, without waiting for a timer', () => {
  const container = makeContainer();
  playTransferFlight({ container, color: 'green', direction: 'in', duration: 10000, reducedMotion: true });
  assert.equal(container.querySelectorAll('.flight-ball').length, 0);
});

test('overlapping flights are independent: each manages its own element and cleanup', async () => {
  const container = makeContainer();
  const long = playTransferFlight({ container, color: 'yellow', direction: 'in', duration: 300 });
  playTransferFlight({ container, color: 'orange', direction: 'out', duration: 10 });
  assert.equal(container.querySelectorAll('.flight-ball').length, 2);
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(container.querySelectorAll('.flight-ball').length, 1, 'the short flight should have cleaned itself up already');
  long.cancel();
  assert.equal(container.querySelectorAll('.flight-ball').length, 0);
});

test('playTransferFlight is a no-op when no container is provided', () => {
  const handle = playTransferFlight({ container: null, color: 'blue', direction: 'in' });
  assert.doesNotThrow(() => handle.cancel());
});
