import test from 'node:test';
import assert from 'node:assert/strict';
import { angleFromCenter, nearestWheelStop, classifyGesture } from '../src/input-controller.js';

const rect = { left: 0, top: 0, width: 200, height: 200 };

test('angleFromCenter normalizes clockwise degrees with 6 oclock at 0', () => {
  assert.equal(Math.round(angleFromCenter(100, 200, rect)), 0);
  assert.equal(Math.round(angleFromCenter(0, 100, rect)), 90);
  assert.equal(Math.round(angleFromCenter(100, 0, rect)), 180);
  assert.equal(Math.round(angleFromCenter(200, 100, rect)), 270);
});

test('nearestWheelStop snaps and wraps around 0/360', () => {
  assert.equal(nearestWheelStop(1), 0);
  assert.equal(nearestWheelStop(359), 0);
  assert.equal(nearestWheelStop(31), 1);
  assert.equal(nearestWheelStop(89), 1);
  assert.equal(nearestWheelStop(91), 2);
});

test('gesture classification separates taps, radial transfer and tangential rotation', () => {
  assert.equal(classifyGesture({x:100,y:180},{x:102,y:182},rect), 'tap');
  assert.equal(classifyGesture({x:100,y:180},{x:100,y:135},rect), 'transfer-in');
  assert.equal(classifyGesture({x:100,y:135},{x:100,y:180},rect), 'transfer-out');
  assert.equal(classifyGesture({x:100,y:180},{x:145,y:180},rect), 'rotate');
});
