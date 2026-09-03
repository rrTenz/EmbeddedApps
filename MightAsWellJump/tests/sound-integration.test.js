import test from 'node:test';
import assert from 'node:assert/strict';
import { createStandardGame, serializeState, TARGET_ORDER, MODE } from '../src/game-engine.js';
import { makeFakeLeaderboardModule } from './helpers/fake-leaderboard.js';
import { makeFakeAudioModule } from './helpers/fake-audio.js';
import { loadApp, hubTapPoint } from './helpers/app-harness.js';

// Every test in this file drives the real src/app.js entry point end to end
// (real game-engine logic, real input-controller gesture classification) —
// only leaderboard-service.js (never depends on live Firebase, per this
// project's testing rules) and audio.js (never depends on real Web Audio or
// media output, per this task's requirement) are mocked.
function mockModules(t, { audioHandlers, leaderboardHandlers } = {}) {
  const leaderboard = makeFakeLeaderboardModule(leaderboardHandlers);
  const audio = makeFakeAudioModule(audioHandlers);
  t.mock.module('../src/leaderboard-service.js', { namedExports: leaderboard.namedExports });
  t.mock.module('../src/audio.js', { namedExports: audio.namedExports });
  return { leaderboard, audio };
}

function seedSoundPref(storage, enabled) {
  storage.setItem('mightAsWellJump.pref.sound', JSON.stringify(enabled));
}

// A fresh, resumable, in-progress game at wheelStop 0 (the passer chute
// aligned) — used for transfer/rotation sound tests that don't need to
// actually win. `passerBall` defaults to a real ball so a tap on the
// passer chute is a genuine, successful transfer by default; pass `null`
// explicitly for the invalid (empty chute + empty hub) case. `center` seeds
// a ball already sitting in the hub, for center-to-chute ("out") scenarios.
function seedResumableGame({ mode = MODE.STANDARD, sound, passerBall = 'yellow', center = null } = {}) {
  return storage => {
    const state = createStandardGame();
    state.mode = mode;
    state.chutes[0][0] = passerBall;
    state.center = center;
    state.started = true;
    if (sound !== undefined) seedSoundPref(storage, sound);
    storage.setItem(
      'mightAsWellJump.activeGame.v1',
      JSON.stringify({ version: 1, state: serializeState(state), startedAtEpochMs: Date.now(), savedAtEpochMs: Date.now() })
    );
  };
}

// One contextual transfer away from winning (mirrors the fixture already
// proven correct in tests/win-dialog.test.js): every normal chute is
// already solved except the last, which is missing only its final slot; the
// hub already holds the completing ball; the wheel is aligned to that
// chute.
function seedNearWinGame({ mode = MODE.STANDARD, sound } = {}) {
  return storage => {
    const state = createStandardGame();
    state.mode = mode;
    for (let chuteIndex = 1; chuteIndex <= 5; chuteIndex++) {
      state.chutes[chuteIndex] = [...TARGET_ORDER];
    }
    state.chutes[5][4] = null;
    state.center = 'green';
    state.wheelStop = 5;
    state.moves = 100;
    state.started = true;
    if (sound !== undefined) seedSoundPref(storage, sound);
    storage.setItem(
      'mightAsWellJump.activeGame.v1',
      JSON.stringify({ version: 1, state: serializeState(state), startedAtEpochMs: Date.now() - 5000, savedAtEpochMs: Date.now() })
    );
  };
}

test('sound defaults off: a successful transfer with no stored preference plays nothing', async (t) => {
  const { audio } = mockModules(t);
  const { document, board, tap } = await loadApp({ seed: seedResumableGame() }); // no `sound` key seeded at all
  document.getElementById('resumeBtn').click();
  assert.equal(document.getElementById('soundToggle').getAttribute('aria-pressed'), 'false');

  tap(board, { x: 100, y: 176 }); // near-bottom, within the passer chute's transfer zone
  assert.equal(audio.calls.playTransfer.length, 0);
});

test('the sound preference persists: a stored "on" preference is honored on the next load, driving real playback', async (t) => {
  const { audio } = mockModules(t);
  const { document, board, tap } = await loadApp({ seed: seedResumableGame({ sound: true }) });
  document.getElementById('resumeBtn').click();
  assert.equal(document.getElementById('soundToggle').getAttribute('aria-pressed'), 'true');

  tap(board, { x: 100, y: 176 });
  assert.equal(audio.calls.playTransfer.length, 1);
});

test('toggling sound on via the existing control (no second control) enables playback immediately', async (t) => {
  const { audio } = mockModules(t);
  const { document, board, tap } = await loadApp({ seed: seedResumableGame() });
  document.getElementById('resumeBtn').click();

  document.getElementById('soundToggle').click();
  assert.equal(document.getElementById('soundToggle').getAttribute('aria-pressed'), 'true');
  assert.equal(document.getElementById('soundToggleIntro').getAttribute('aria-pressed'), 'true');

  tap(board, { x: 100, y: 176 });
  assert.equal(audio.calls.playTransfer.length, 1);
});

test('an invalid transfer attempt (empty chute, empty hub) plays no sound', async (t) => {
  const { audio } = mockModules(t);
  const { document, board, tap } = await loadApp({ seed: seedResumableGame({ sound: true, passerBall: null }) });
  document.getElementById('resumeBtn').click();

  const movesBefore = document.getElementById('moves').textContent;
  tap(board, { x: 100, y: 176 }); // passer chute empty, hub empty -> no-op
  assert.equal(document.getElementById('moves').textContent, movesBefore, 'sanity: this tap must not have registered as a move');
  assert.equal(audio.calls.playTransfer.length, 0);
  assert.equal(audio.calls.playSnap, 0);
  assert.equal(audio.calls.playWin, 0);
});

test('a genuinely successful transfer (ball actually moves) plays exactly one transfer sound', async (t) => {
  const { audio } = mockModules(t);
  const { document, board, tap } = await loadApp({ seed: seedResumableGame({ sound: true }) });
  document.getElementById('resumeBtn').click();

  const movesBefore = document.getElementById('moves').textContent;
  tap(board, { x: 100, y: 176 });
  assert.notEqual(document.getElementById('moves').textContent, movesBefore, 'sanity: the transfer must have actually happened');
  assert.equal(audio.calls.playTransfer.length, 1);
  assert.equal(audio.calls.playSnap, 0);
});

// --- color / direction: the actual moved ball's color and the real transfer direction ---

test('a chute -> center transfer passes the moved ball\'s real color and direction "in"', async (t) => {
  const { audio } = mockModules(t);
  const { document, board, tap } = await loadApp({ seed: seedResumableGame({ sound: true, passerBall: 'blue' }) });
  document.getElementById('resumeBtn').click();

  tap(board, { x: 100, y: 176 }); // hub is empty -> contextual transfer resolves 'in'
  assert.equal(audio.calls.playTransfer.length, 1);
  assert.deepEqual(audio.calls.playTransfer[0], { color: 'blue', direction: 'in' });
});

test('a center -> chute transfer passes the moved ball\'s real color and direction "out"', async (t) => {
  const { audio } = mockModules(t);
  // Passer chute empty, hub already holding a red ball -> a contextual tap
  // resolves 'out' (hub occupied) and moves that exact ball into the chute.
  const { document, board, tap } = await loadApp({ seed: seedResumableGame({ sound: true, passerBall: null, center: 'red' }) });
  document.getElementById('resumeBtn').click();

  tap(board, { x: 100, y: 176 });
  assert.equal(audio.calls.playTransfer.length, 1);
  assert.deepEqual(audio.calls.playTransfer[0], { color: 'red', direction: 'out' });
});

for (const mode of [MODE.STANDARD, MODE.RANDOM]) {
  test(`${mode} mode: chute -> center and center -> chute pass identical color/direction shapes (Standard and Random behave the same)`, async (t) => {
    const { audio } = mockModules(t);
    const inApp = await loadApp({ seed: seedResumableGame({ mode, sound: true, passerBall: 'green' }) });
    inApp.document.getElementById('resumeBtn').click();
    inApp.tap(inApp.board, { x: 100, y: 176 });
    assert.deepEqual(audio.calls.playTransfer[0], { color: 'green', direction: 'in' });
  });

  test(`${mode} mode: center -> chute passes the correct direction (Standard and Random behave the same)`, async (t) => {
    const { audio } = mockModules(t);
    const outApp = await loadApp({ seed: seedResumableGame({ mode, sound: true, passerBall: null, center: 'orange' }) });
    outApp.document.getElementById('resumeBtn').click();
    outApp.tap(outApp.board, { x: 100, y: 176 });
    assert.deepEqual(audio.calls.playTransfer[0], { color: 'orange', direction: 'out' });
  });
}

test('a changed wheel-stop snap plays exactly one snap sound', async (t) => {
  const { audio } = mockModules(t);
  const { document } = await loadApp({ seed: seedResumableGame({ sound: true }) });
  document.getElementById('resumeBtn').click();

  document.getElementById('rotateRight').click(); // wheelStop 0 -> 1, a real change
  assert.equal(audio.calls.playSnap, 1);
  assert.equal(audio.calls.playTransfer.length, 0);
});

test('a same-stop "snap" (net-zero rotation) plays no snap sound', async (t) => {
  const { audio } = mockModules(t);
  const { document, board, tap } = await loadApp({ seed: seedResumableGame({ sound: true }) });
  document.getElementById('resumeBtn').click();

  // A plain tap (zero pointer movement) is classified as a non-rotate
  // gesture by input-controller.js, so it always resolves to onRotateStop(0)
  // -> rotate(state, 0) -> wheelStop unchanged -> result.changed === false.
  // Tapped well away from both the hub and the active chute's transfer zone
  // so this cannot also register as a transfer.
  tap(board, { x: 170, y: 30 });
  assert.equal(audio.calls.playSnap, 0);
});

test('rotation buttons and a real drag-release both fire the snap sound consistently on an actual change', async (t) => {
  const { audio } = mockModules(t);
  const { document, board, fire } = await loadApp({ seed: seedResumableGame({ sound: true }) });
  document.getElementById('resumeBtn').click();

  document.getElementById('rotateRight').click(); // button path: 0 -> 1
  assert.equal(audio.calls.playSnap, 1);

  // Drag path: a real pointerdown/pointermove/pointerup rotate gesture,
  // classified 'rotate' by input-controller.js, released ~60deg further.
  const rect = board.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const start = { x: cx, y: cy + 80 }; // angle 0 (6 o'clock)
  const end = { x: cx - 80 * Math.sin(Math.PI / 3), y: cy + 80 * Math.cos(Math.PI / 3) }; // +60deg
  fire(board, 'pointerdown', { pointerId: 1, clientX: start.x, clientY: start.y });
  fire(board, 'pointermove', { pointerId: 1, clientX: end.x, clientY: end.y });
  fire(board, 'pointerup', { pointerId: 1, clientX: end.x, clientY: end.y });

  assert.equal(audio.calls.playSnap, 2, 'expected the drag-release rotation to also fire exactly one additional snap sound');
});

test('winning plays exactly one win sound (starts the cheer exactly once)', async (t) => {
  const { audio } = mockModules(t);
  const { document, board, tap, centerSlot } = await loadApp({ seed: seedNearWinGame({ sound: true }) });
  document.getElementById('resumeBtn').click();

  tap(board, hubTapPoint(centerSlot));
  assert.equal(audio.calls.playWin, 1);
});

test('winning with Sound OFF does not start the cheer', async (t) => {
  const { audio } = mockModules(t);
  const { document, board, tap, centerSlot } = await loadApp({ seed: seedNearWinGame({ sound: false }) });
  document.getElementById('resumeBtn').click();

  tap(board, hubTapPoint(centerSlot));
  assert.equal(audio.calls.playWin, 0);
});

test('sounds do not fire when disabled, across transfer, snap, and win in one completed run', async (t) => {
  const { audio } = mockModules(t);
  const { document, board, centerSlot, tap } = await loadApp({ seed: seedNearWinGame({ sound: false }) });
  document.getElementById('resumeBtn').click();

  document.getElementById('rotateRight').click();
  document.getElementById('rotateLeft').click(); // back to the winning chute's stop
  tap(board, hubTapPoint(centerSlot)); // completes the puzzle

  assert.equal(audio.calls.playSnap, 0);
  assert.equal(audio.calls.playTransfer.length, 0);
  assert.equal(audio.calls.playWin, 0);
});

test('an audio failure does not break gameplay: the transfer still completes and updates state', async (t) => {
  const { audio } = mockModules(t, { audioHandlers: { throwOn: 'playTransfer' } });
  const { document, board, tap } = await loadApp({ seed: seedResumableGame({ sound: true }) });
  document.getElementById('resumeBtn').click();

  const movesBefore = document.getElementById('moves').textContent;
  assert.doesNotThrow(() => tap(board, { x: 100, y: 176 }));
  assert.notEqual(document.getElementById('moves').textContent, movesBefore, 'the game move must still register despite the audio failure');
  assert.equal(audio.calls.playTransfer.length, 1, 'the (failing) sound call still happened, it just could not be allowed to break the game');
});

test('a rejected/failed cheer playback cannot break the win flow: the dialog still opens normally', async (t) => {
  mockModules(t, { audioHandlers: { throwOn: 'playWin' } });
  const { document, board, tap, centerSlot } = await loadApp({ seed: seedNearWinGame({ sound: true }) });
  document.getElementById('resumeBtn').click();

  assert.doesNotThrow(() => tap(board, hubTapPoint(centerSlot)));
  assert.equal(document.getElementById('winDialog').open, true);
});

test('starting another game after a win stops any still-playing cheer', async (t) => {
  const { audio } = mockModules(t);
  const { document, board, tap, centerSlot } = await loadApp({ seed: seedNearWinGame({ sound: true }) });
  document.getElementById('resumeBtn').click();
  tap(board, hubTapPoint(centerSlot)); // win, cheer starts
  assert.equal(audio.calls.playWin, 1);

  document.getElementById('playAgainBtn').click();
  assert.ok(audio.calls.stopWin >= 1, 'expected Play Again to stop any in-progress cheer');
});

for (const mode of [MODE.STANDARD, MODE.RANDOM]) {
  test(`${mode} mode wins play exactly one win sound (Standard and Random behave the same)`, async (t) => {
    const { audio } = mockModules(t);
    const { document, board, tap, centerSlot } = await loadApp({ seed: seedNearWinGame({ mode, sound: true }) });
    document.getElementById('resumeBtn').click();

    tap(board, hubTapPoint(centerSlot));
    assert.equal(audio.calls.playWin, 1);
  });
}
