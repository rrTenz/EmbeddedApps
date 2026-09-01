import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStandardGame, serializeState } from '../src/game-engine.js';

// These tests drive the real src/app.js entry point (not a reimplementation)
// against the actual index.html markup, so the class/state contract they
// assert on is the one the shipped app produces.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

let caseId = 0;

// app.js runs its top-level wiring (querying elements, attaching listeners,
// reading persisted preferences) the moment it's imported, so each test needs
// its own DOM installed as the globals *before* import, and its own fresh
// module instance (the `?case=` query string defeats Node's ESM cache, which
// otherwise would only ever run that top-level wiring once for the whole file).
async function loadApp({ seed } = {}) {
  const dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true });
  const { window } = dom;
  global.window = window;
  global.document = window.document;
  global.localStorage = window.localStorage;
  global.HTMLElement = window.HTMLElement;
  global.Event = window.Event;
  // A no-op: none of these tests assert on the timer-display loop that
  // startTimerLoop() drives, and a real rAF binding here would recurse
  // forever (jsdom never stops calling back), leaking a live timer per test
  // that outlives this test's own window and destabilizes the whole suite.
  global.requestAnimationFrame = () => 0;
  global.cancelAnimationFrame = () => {};
  window.localStorage.clear();
  // Must run after the new window's localStorage is installed as the global
  // (app.js's persistence calls read the bare `localStorage` global), and
  // before app.js's top-level wiring runs, since resumeSavedGame() reads it.
  seed?.(window.localStorage);

  caseId += 1;
  await import(`../src/app.js?case=${caseId}`);

  const document = window.document;
  const board = document.getElementById('board');
  const centerSlot = document.getElementById('centerSlot');
  // JSDOM does not run layout, so every element's real getBoundingClientRect
  // is a zero rect; stub the two the input controller reads, matching the
  // fixture geometry already used by tests/interaction.test.js.
  board.getBoundingClientRect = () => ({ left: 0, top: 0, right: 200, bottom: 200, width: 200, height: 200 });
  centerSlot.getBoundingClientRect = () => ({ left: 78, top: 78, right: 122, bottom: 122, width: 44, height: 44 });

  const fire = (el, type, props) => {
    const ev = new window.Event(type, { bubbles: true, cancelable: true });
    Object.assign(ev, props);
    el.dispatchEvent(ev);
  };
  const tap = (el, point) => {
    fire(el, 'pointerdown', { pointerId: 1, clientX: point.x, clientY: point.y });
    fire(el, 'pointerup', { pointerId: 1, clientX: point.x, clientY: point.y });
  };

  return { window, document, board, centerSlot, fire, tap };
}

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

function hubTapPoint(centerSlot) {
  const r = centerSlot.getBoundingClientRect();
  return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
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
