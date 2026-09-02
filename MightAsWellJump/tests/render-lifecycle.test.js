import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createStandardGame, serializeState } from '../src/game-engine.js';
import { makeFakeLeaderboardModule } from './helpers/fake-leaderboard.js';
import { loadApp } from './helpers/app-harness.js';

// These tests drive the real src/app.js entry point (not a reimplementation)
// against the actual index.html markup, so the class/state contract they
// assert on is the one the shipped app produces.

// app.js loads the leaderboard on import; none of these render/transfer/
// rotation tests exercise leaderboard behavior, so a single inert fake here
// keeps this whole file off the network (see leaderboard-section.test.js and
// win-dialog.test.js for the leaderboard/share behavior itself).
mock.module('../src/leaderboard-service.js', { namedExports: makeFakeLeaderboardModule().namedExports });

// Seeds a resumable saved game so a test can reach an input-enabled board
// without waiting through the real ~1.1s initial-deal animation, which is
// only exercised by the dedicated setup test below.
function seedResumableGame({ passerBall = 'yellow' } = {}) {
  return storage => {
    const state = createStandardGame();
    state.chutes[0][0] = passerBall; // passer chute (index 0) is active at wheelStop 0
    state.started = true;
    storage.setItem(
      'mightAsWellJump.activeGame.v1',
      JSON.stringify({ version: 1, state: serializeState(state), startedAtEpochMs: Date.now(), savedAtEpochMs: Date.now() })
    );
  };
}

test('initial new-game setup still uses the setup/reveal path', async () => {
  const { document } = await loadApp();
  document.getElementById('standardBtn').click();

  // The synchronous portion of beginGame() (including renderBoard({setup:true}))
  // has already run by the time click() returns.
  assert.ok(document.body.classList.contains('setting-up'), 'expected setting-up on the initial deal');
  const balls = [...document.querySelectorAll('.ball')];
  assert.ok(balls.length > 0, 'expected balls to be rendered for a new standard game');
  assert.ok(balls.every(b => !b.classList.contains('reveal')), 'no ball should be revealed yet, before the staggered timers fire');

  await new Promise(resolve => setTimeout(resolve, 160));
  const revealedNow = [...document.querySelectorAll('.ball')].filter(b => b.classList.contains('reveal'));
  assert.ok(revealedNow.length > 0, 'expected at least the first staggered ball to have gained .reveal by ~160ms');
});

test('a normal transfer render is not in setup mode', async () => {
  const { document, board, tap } = await loadApp({ seed: seedResumableGame() });
  document.getElementById('resumeBtn').click();

  assert.equal(document.body.classList.contains('setting-up'), false, 'resuming a game must not enter setup mode');

  const before = document.getElementById('moves').textContent;
  tap(board, { x: 100, y: 176 }); // near-bottom, within the active (passer) chute's zone
  assert.notEqual(document.getElementById('moves').textContent, before, 'expected the tap to register as a real transfer');
  assert.equal(document.body.classList.contains('setting-up'), false, 'a normal transfer must never add setting-up to the board/body');
});

test('normal transfer-created stationary balls do not carry the reveal class or need it to be visible', async () => {
  const { document, board, tap } = await loadApp({ seed: seedResumableGame() });
  document.getElementById('resumeBtn').click();

  tap(board, { x: 100, y: 176 }); // chute -> hub transfer

  const staleClasses = [...document.querySelectorAll('.ball')].filter(b => b.classList.contains('reveal'));
  assert.deepEqual(staleClasses, [], 'stationary balls rendered by a transfer must not depend on .reveal to be visible');
});

test('rotation-only interaction does not rebuild the ball DOM nodes', async () => {
  const { document, board } = await loadApp({ seed: seedResumableGame({ passerBall: null }) });
  document.getElementById('resumeBtn').click();

  const before = [...document.querySelectorAll('.ball')];
  assert.ok(before.length > 0, 'expected a standard game to have rendered balls');

  document.getElementById('rotateRight').click();

  const after = [...document.querySelectorAll('.ball')];
  assert.equal(after.length, before.length);
  assert.ok(before.every((el, i) => el === after[i]), 'rotation must reuse the same ball DOM nodes, not recreate them');
});
