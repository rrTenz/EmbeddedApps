import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COLORS, TARGET_ORDER, MODE, STANDARD_START,
  createStandardGame, createRandomGame, rotate,
  transferChuteToCenter, transferCenterToChute, isSolved,
  serializeState, targetColorFor, contextualTransfer
} from '../src/game-engine.js';

test('standard game uses the approved target order and exact layout', () => {
  assert.deepEqual(TARGET_ORDER, ['yellow','blue','red','orange','green']);
  assert.deepEqual(COLORS, TARGET_ORDER);
  assert.deepEqual(STANDARD_START, [
    [null,null,null,null,null],
    ['yellow','blue','red','green','orange'],
    ['yellow','blue','green','red','orange'],
    ['yellow','green','blue','red','orange'],
    ['yellow','red','orange','green','blue'],
    ['yellow','green','red','orange','blue']
  ]);
  const state = createStandardGame();
  assert.equal(state.mode, MODE.STANDARD);
  assert.equal(state.wheelStop, 0);
  assert.equal(state.center, null);
  assert.equal(state.moves, 0);
  assert.deepEqual(state.chutes, STANDARD_START);
  state.chutes[1][0] = 'green';
  assert.equal(STANDARD_START[1][0], 'yellow');
});

test('random game preserves color counts, chute capacities, empty passer/center and rejects solved shuffle', () => {
  let n = 0;
  const seq = [0.999, 0.001, 0.75, 0.25, 0.5];
  const randomFn = () => seq[(n++) % seq.length];
  const state = createRandomGame(randomFn);
  assert.equal(state.mode, MODE.RANDOM);
  assert.equal(state.wheelStop, 0);
  assert.equal(state.center, null);
  assert.deepEqual(state.chutes[0], [null,null,null,null,null]);
  for (let i = 1; i <= 5; i++) assert.equal(state.chutes[i].length, 5);
  const balls = state.chutes.slice(1).flat().filter(Boolean);
  assert.equal(balls.length, 25);
  for (const color of COLORS) assert.equal(balls.filter(b => b === color).length, 5);
  assert.equal(state.chutes.slice(1).every(ch => ch.every((b,i) => b === TARGET_ORDER[i])), false);
});

test('chute to center removes the innermost occupied ball without shifting and increments one move', () => {
  const state = createStandardGame();
  state.chutes[0] = ['yellow','blue',null,null,null];
  const result = transferChuteToCenter(state);
  assert.equal(result.changed, true);
  assert.equal(result.state.center, 'blue');
  assert.deepEqual(result.state.chutes[0], ['yellow',null,null,null,null]);
  assert.equal(result.state.moves, 1);
});

test('occupied center blocks chute to center without changing moves', () => {
  const state = createStandardGame();
  state.center = 'red';
  const result = transferChuteToCenter(state);
  assert.equal(result.changed, false);
  assert.equal(result.state.moves, 0);
});

test('center to chute fills the innermost available position and blocks a full chute', () => {
  let state = createStandardGame();
  state.chutes[0] = ['yellow','blue',null,null,null];
  state.center = 'green';
  let result = transferCenterToChute(state);
  assert.equal(result.changed, true);
  assert.deepEqual(result.state.chutes[0], ['yellow','blue','green',null,null]);
  assert.equal(result.state.center, null);
  assert.equal(result.state.moves, 1);

  state = createStandardGame();
  state.wheelStop = 1;
  state.center = 'green';
  result = transferCenterToChute(state);
  assert.equal(result.changed, false);
  assert.equal(result.state.center, 'green');
  assert.equal(result.state.moves, 0);
});

test('only the wheelStop chute is aligned for transfer', () => {
  const state = createStandardGame();
  state.wheelStop = 2;
  const expected = state.chutes[2][4];
  const result = transferChuteToCenter(state);
  assert.equal(result.state.center, expected);
  assert.equal(result.state.chutes[1][4], 'orange');
});

test('rotation wraps, does not increment moves, and reports unchanged rotations', () => {
  let state = createStandardGame();
  let result = rotate(state, -1);
  assert.equal(result.state.wheelStop, 5);
  assert.equal(result.state.moves, 0);
  assert.equal(result.changed, true);
  result = rotate(result.state, 6);
  assert.equal(result.state.wheelStop, 5);
  assert.equal(result.changed, false);
});

test('solved state ignores wheel orientation but requires target chutes, empty passer and empty center', () => {
  const state = createStandardGame();
  state.chutes = [
    [null,null,null,null,null],
    [...TARGET_ORDER], [...TARGET_ORDER], [...TARGET_ORDER], [...TARGET_ORDER], [...TARGET_ORDER]
  ];
  state.wheelStop = 4;
  assert.equal(isSolved(state), true);
  state.center = 'green';
  assert.equal(isSolved(state), false);
  state.center = null;
  state.chutes[0][0] = 'green';
  assert.equal(isSolved(state), false);
});

test('serializeState returns an isolated plain snapshot', () => {
  const state = createStandardGame();
  const snap = serializeState(state);
  snap.chutes[1][0] = 'green';
  assert.equal(state.chutes[1][0], 'yellow');
});

test('the target sequence, read outer to inner, is yellow, blue, red, orange, green', () => {
  assert.deepEqual(TARGET_ORDER, ['yellow', 'blue', 'red', 'orange', 'green']);
});

test('targetColorFor assigns no target color to any slot in the passer chute (index 0)', () => {
  for (let slot = 0; slot < 5; slot++) assert.equal(targetColorFor(0, slot), null);
});

test('targetColorFor assigns the full target sequence to each of the five colored chutes', () => {
  for (let chuteIndex = 1; chuteIndex <= 5; chuteIndex++) {
    const targets = Array.from({ length: 5 }, (_, slot) => targetColorFor(chuteIndex, slot));
    assert.deepEqual(targets, TARGET_ORDER);
  }
});

test('contextualTransfer moves chute -> hub when the hub is empty', () => {
  const state = createStandardGame();
  state.chutes[0] = ['yellow', 'blue', null, null, null];
  const result = contextualTransfer(state);
  assert.equal(result.changed, true);
  assert.equal(result.state.center, 'blue');
  assert.deepEqual(result.state.chutes[0], ['yellow', null, null, null, null]);
  assert.equal(result.state.moves, 1);
});

test('contextualTransfer moves hub -> chute when the hub is occupied', () => {
  const state = createStandardGame();
  state.chutes[0] = ['yellow', 'blue', null, null, null];
  state.center = 'green';
  const result = contextualTransfer(state);
  assert.equal(result.changed, true);
  assert.equal(result.state.center, null);
  assert.deepEqual(result.state.chutes[0], ['yellow', 'blue', 'green', null, null]);
  assert.equal(result.state.moves, 1);
});

test('contextualTransfer does nothing when the active chute and the hub are both empty', () => {
  const state = createStandardGame(); // chute 0 (passer, active) starts empty; center starts empty
  const result = contextualTransfer(state);
  assert.equal(result.changed, false);
  assert.equal(result.state.center, null);
  assert.equal(result.state.moves, 0);
});

test('contextualTransfer does nothing when the active chute is full and the hub is occupied', () => {
  const state = createStandardGame();
  state.wheelStop = 1; // chute 1 starts fully loaded
  state.center = 'green';
  const result = contextualTransfer(state);
  assert.equal(result.changed, false);
  assert.equal(result.state.center, 'green');
  assert.equal(result.state.moves, 0);
});
