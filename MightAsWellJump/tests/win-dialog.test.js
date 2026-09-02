import test from 'node:test';
import assert from 'node:assert/strict';
import { createStandardGame, serializeState, TARGET_ORDER } from '../src/game-engine.js';
import { makeFakeLeaderboardModule } from './helpers/fake-leaderboard.js';
import { loadApp, hubTapPoint } from './helpers/app-harness.js';

// Seeds a game exactly one contextual transfer away from a win: every normal
// chute is already correct except the last, which is missing only its final
// slot; the hub already holds the ball that completes it; the wheel is
// aligned to that chute. One hub/chute tap wins for real, through the game's
// own contextualTransfer + isSolved logic (this test never fakes a win).
function seedNearWinGame() {
  return storage => {
    const state = createStandardGame();
    for (let chuteIndex = 1; chuteIndex <= 5; chuteIndex++) {
      state.chutes[chuteIndex] = [...TARGET_ORDER];
    }
    state.chutes[5][4] = null; // last chute missing its final (green) slot
    state.center = 'green';
    state.wheelStop = 5;
    state.moves = 100;
    state.started = true;
    storage.setItem(
      'mightAsWellJump.activeGame.v1',
      JSON.stringify({ version: 1, state: serializeState(state), startedAtEpochMs: Date.now() - 103000, savedAtEpochMs: Date.now() })
    );
  };
}

// t.mock (the per-test MockTracker) auto-restores after each test completes,
// which is required here: the global `mock` export does not auto-restore,
// and every test in this file needs its own leaderboard behavior.
function mockLeaderboard(t, handlers) {
  const fake = makeFakeLeaderboardModule(handlers);
  t.mock.module('../src/leaderboard-service.js', { namedExports: fake.namedExports });
  return fake;
}

async function loadAndWin(t, handlers) {
  const fake = mockLeaderboard(t, handlers);
  const app = await loadApp({ seed: seedNearWinGame() });
  app.document.getElementById('resumeBtn').click();
  app.tap(app.board, hubTapPoint(app.centerSlot));
  return { ...app, fake };
}

test('winning opens the dialog with unsubmitted state: final stats shown, submit enabled, no message yet', async (t) => {
  const { document } = await loadAndWin(t);
  const winDialog = document.getElementById('winDialog');
  assert.equal(winDialog.open, true);
  assert.equal(document.getElementById('finalMoves').textContent, '101');
  assert.equal(document.getElementById('finalMode').textContent, 'Standard');
  assert.equal(document.getElementById('submitScoreBtn').disabled, false);
  assert.equal(document.getElementById('scoreMessage').textContent, '');
});

test('an invalid display name shows an inline error and never calls submitScore', async (t) => {
  const { document, fake } = await loadAndWin(t);
  document.getElementById('displayNameInput').value = 'A';
  document.getElementById('scoreForm').dispatchEvent(new document.defaultView.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.equal(fake.calls.submitScore.length, 0);
  const msg = document.getElementById('scoreMessage');
  assert.match(msg.textContent, /2-24|characters/i);
  assert.ok(msg.classList.contains('error'));
});

test('win dialog transitions from unsubmitted to submitted/ranked on a successful, outside-top-10 submission', async (t) => {
  const { document } = await loadAndWin(t, {
    submitScore: async () => ({ ok: true }),
    fetchRank: async () => ({ ok: true, rank: 27 })
  });
  document.getElementById('displayNameInput').value = 'Ryan T';
  document.getElementById('scoreForm').dispatchEvent(new document.defaultView.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise(resolve => setTimeout(resolve, 0));
  await new Promise(resolve => setTimeout(resolve, 0));

  const msg = document.getElementById('scoreMessage');
  assert.match(msg.textContent, /Your rank: #27/);
  assert.ok(msg.classList.contains('success'));
});

test('a top-10 rank is announced distinctly from an outside-top-10 rank', async (t) => {
  const { document } = await loadAndWin(t, {
    submitScore: async () => ({ ok: true }),
    fetchRank: async () => ({ ok: true, rank: 3 })
  });
  document.getElementById('displayNameInput').value = 'Ryan T';
  document.getElementById('scoreForm').dispatchEvent(new document.defaultView.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise(resolve => setTimeout(resolve, 0));
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.match(document.getElementById('scoreMessage').textContent, /#3 on the leaderboard/);
});

test('repeated rapid submit clicks for the same completed run only submit once', async (t) => {
  const { document, fake } = await loadAndWin(t, {
    submitScore: async () => ({ ok: true }),
    fetchRank: async () => ({ ok: true, rank: 1 })
  });
  document.getElementById('displayNameInput').value = 'Ryan T';
  const form = document.getElementById('scoreForm');
  const submitEvent = () => new document.defaultView.Event('submit', { bubbles: true, cancelable: true });

  form.dispatchEvent(submitEvent());
  form.dispatchEvent(submitEvent()); // fired before the first await resolves
  form.dispatchEvent(submitEvent());
  await new Promise(resolve => setTimeout(resolve, 0));
  await new Promise(resolve => setTimeout(resolve, 0));
  form.dispatchEvent(submitEvent()); // fired after success too

  assert.equal(fake.calls.submitScore.length, 1, 'exactly one network submission for one completed run');
});

test('every submission for one completed run uses the same runId', async (t) => {
  const { document, fake } = await loadAndWin(t, {
    submitScore: async () => ({ ok: false, reason: 'error' })
  });
  const form = document.getElementById('scoreForm');
  const submitEvent = () => new document.defaultView.Event('submit', { bubbles: true, cancelable: true });
  document.getElementById('displayNameInput').value = 'Ryan T';

  form.dispatchEvent(submitEvent());
  await new Promise(resolve => setTimeout(resolve, 0));
  form.dispatchEvent(submitEvent()); // retry after a failure
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.equal(fake.calls.submitScore.length, 2);
  assert.equal(fake.calls.submitScore[0].runId, fake.calls.submitScore[1].runId);
});

test('a duplicate rejection from the server is treated as already-submitted, not an error', async (t) => {
  const { document } = await loadAndWin(t, {
    submitScore: async () => ({ ok: false, reason: 'duplicate' })
  });
  document.getElementById('displayNameInput').value = 'Ryan T';
  document.getElementById('scoreForm').dispatchEvent(new document.defaultView.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise(resolve => setTimeout(resolve, 0));

  const msg = document.getElementById('scoreMessage');
  assert.match(msg.textContent, /already submitted/i);
  assert.ok(msg.classList.contains('success'));
});

test('a submission failure keeps the completed score visible and allows retry, without crashing', async (t) => {
  let attempts = 0;
  const { document, fake } = await loadAndWin(t, {
    submitScore: async () => { attempts += 1; return attempts === 1 ? { ok: false, reason: 'error' } : { ok: true }; },
    fetchRank: async () => ({ ok: true, rank: 5 })
  });
  document.getElementById('displayNameInput').value = 'Ryan T';
  const form = document.getElementById('scoreForm');
  const submitEvent = () => new document.defaultView.Event('submit', { bubbles: true, cancelable: true });

  form.dispatchEvent(submitEvent());
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.match(document.getElementById('scoreMessage').textContent, /try again/i);
  assert.equal(document.getElementById('finalTime').textContent.length > 0, true, 'the completed result stays visible after a failed submission');
  assert.equal(document.getElementById('submitScoreBtn').disabled, false, 'retry must be possible');

  form.dispatchEvent(submitEvent());
  await new Promise(resolve => setTimeout(resolve, 0));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(fake.calls.submitScore.length, 2);
  assert.match(document.getElementById('scoreMessage').textContent, /#5/);
});

test('an unconfigured/unavailable leaderboard does not crash the win dialog', async (t) => {
  const { document } = await loadAndWin(t); // default fake: not-configured
  document.getElementById('displayNameInput').value = 'Ryan T';
  document.getElementById('scoreForm').dispatchEvent(new document.defaultView.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.match(document.getElementById('scoreMessage').textContent, /unavailable/i);
  // Play Again must still work even though the leaderboard never worked.
  document.getElementById('playAgainBtn').click();
  assert.equal(document.getElementById('winDialog').open, false);
});

test('the display name is remembered from a prior submission and prefilled on the next win', async (t) => {
  mockLeaderboard(t);
  const app = await loadApp({
    seed: (() => {
      const seed = seedNearWinGame();
      return storage => {
        seed(storage);
        storage.setItem('mightAsWellJump.pref.displayName', JSON.stringify('Ryan T'));
      };
    })()
  });
  app.document.getElementById('resumeBtn').click();
  app.tap(app.board, hubTapPoint(app.centerSlot));

  assert.equal(app.document.getElementById('displayNameInput').value, 'Ryan T');
});

test('Share Result uses the Web Share API when available and reports success', async (t) => {
  const { document, window: win } = await loadAndWin(t);
  let shared = null;
  win.navigator.share = async payload => { shared = payload; };
  document.getElementById('shareBtn').click();
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.ok(shared);
  assert.match(shared.text, /Might As Well Jump/);
  assert.match(shared.text, /🟢 Standard/);
  assert.match(document.getElementById('shareMessage').textContent, /share sheet opened/i);
});

test('Share Result falls back to the clipboard and reports "Result copied!" on desktop', async (t) => {
  const { document, window: win } = await loadAndWin(t);
  let written = null;
  win.navigator.clipboard = { writeText: async text => { written = text; } };
  document.getElementById('shareBtn').click();
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.ok(written);
  assert.match(document.getElementById('shareMessage').textContent, /copied/i);
});

test('cancelling the native share sheet shows no visible error', async (t) => {
  const { document, window: win } = await loadAndWin(t);
  win.navigator.share = async () => { const e = new Error('cancel'); e.name = 'AbortError'; throw e; };
  document.getElementById('shareBtn').click();
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.equal(document.getElementById('shareMessage').textContent, '');
});
