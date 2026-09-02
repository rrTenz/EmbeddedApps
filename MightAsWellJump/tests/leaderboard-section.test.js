import test from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeLeaderboardModule } from './helpers/fake-leaderboard.js';
import { loadApp } from './helpers/app-harness.js';

function tick() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function mockLeaderboard(t, handlers) {
  const fake = makeFakeLeaderboardModule(handlers);
  t.mock.module('../src/leaderboard-service.js', { namedExports: fake.namedExports });
  return fake;
}

function score({ mode = 'standard', displayName = 'P', timeMs = 1000, moves = 10 } = {}) {
  return { mode, displayName, timeMs, moves };
}

test('the leaderboard shows a loading state as soon as the page loads', async (t) => {
  mockLeaderboard(t, { fetchTop: async () => { await new Promise(() => {}); } }); // never resolves
  const { document } = await loadApp();
  assert.equal(document.getElementById('leaderboardStatus').hidden, false);
  assert.match(document.getElementById('leaderboardStatus').textContent, /loading/i);
});

test('an empty leaderboard shows a friendly empty state', async (t) => {
  mockLeaderboard(t, { fetchTop: async () => ({ ok: true, scores: [] }) });
  const { document } = await loadApp();
  await tick();

  assert.equal(document.getElementById('leaderboardStatus').hidden, true);
  const rows = document.getElementById('leaderboardList').querySelectorAll('li');
  assert.equal(rows.length, 1);
  assert.match(rows[0].textContent, /no scores yet/i);
});

test('a leaderboard load failure shows a friendly error, not a crash', async (t) => {
  mockLeaderboard(t, { fetchTop: async () => ({ ok: false, reason: 'error', scores: [] }) });
  const { document } = await loadApp();
  await tick();

  const status = document.getElementById('leaderboardStatus');
  assert.equal(status.hidden, false);
  assert.ok(status.classList.contains('error'));
  assert.equal(document.getElementById('leaderboardList').children.length, 0);
});

test('scores render ranked with name, formatted time, and moves', async (t) => {
  mockLeaderboard(t, {
    fetchTop: async () => ({
      ok: true,
      scores: [score({ displayName: 'Ryan T', timeMs: 103000, moves: 68 }), score({ displayName: 'Alex', timeMs: 120000, moves: 50 })]
    })
  });
  const { document } = await loadApp();
  await tick();

  const rows = [...document.getElementById('leaderboardList').querySelectorAll('li')];
  assert.equal(rows.length, 2);
  assert.equal(rows[0].querySelector('.rank').textContent, '1');
  assert.equal(rows[0].querySelector('.name').textContent, 'Ryan T');
  assert.equal(rows[0].querySelector('.time').textContent, '1:43.0');
  assert.equal(rows[0].querySelector('.moves').textContent, '68 mv');
  assert.equal(rows[1].querySelector('.rank').textContent, '2');
});

test('the leaderboard defaults to Standard on first load', async (t) => {
  const fake = mockLeaderboard(t, { fetchTop: async () => ({ ok: true, scores: [] }) });
  await loadApp();
  await tick();
  assert.equal(fake.calls.fetchTop[0].mode, 'standard');
});

test('switching to Random re-queries with mode: random and updates the pressed state', async (t) => {
  const fake = mockLeaderboard(t, { fetchTop: async ({ mode }) => ({ ok: true, scores: [score({ mode })] }) });
  const { document } = await loadApp();
  await tick();

  document.getElementById('leaderboardModeRandomBtn').click();
  await tick();

  assert.equal(fake.calls.fetchTop.at(-1).mode, 'random');
  assert.equal(document.getElementById('leaderboardModeRandomBtn').getAttribute('aria-pressed'), 'true');
  assert.equal(document.getElementById('leaderboardModeStandardBtn').getAttribute('aria-pressed'), 'false');
});

test('See More is hidden when fewer than 10 scores exist', async (t) => {
  mockLeaderboard(t, { fetchTop: async () => ({ ok: true, scores: [score(), score()] }) });
  const { document } = await loadApp();
  await tick();
  assert.equal(document.getElementById('leaderboardSeeMoreBtn').hidden, true);
});

test('See More is shown at a full page of 10 and requests a larger batch when clicked', async (t) => {
  const ten = Array.from({ length: 10 }, (_, i) => score({ displayName: `P${i}`, timeMs: 1000 + i }));
  const fifty = Array.from({ length: 42 }, (_, i) => score({ displayName: `Q${i}`, timeMs: 1000 + i }));
  const fake = mockLeaderboard(t, {
    fetchTop: async ({ count }) => ({ ok: true, scores: count > 10 ? fifty : ten })
  });
  const { document } = await loadApp();
  await tick();

  const seeMoreBtn = document.getElementById('leaderboardSeeMoreBtn');
  assert.equal(seeMoreBtn.hidden, false);

  seeMoreBtn.click();
  await tick();

  assert.equal(fake.calls.fetchTop.at(-1).count, 50);
  assert.equal(document.getElementById('leaderboardList').children.length, 42);
  assert.equal(seeMoreBtn.hidden, true, 'nothing further to reveal once expanded');
});
