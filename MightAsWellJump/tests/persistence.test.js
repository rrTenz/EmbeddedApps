import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStorage, saveActiveGame, loadActiveGame, clearActiveGame, savePreference, loadPreference } from '../src/persistence.js';
import { createStandardGame } from '../src/game-engine.js';

test('active game round trips through versioned storage', () => {
  const storage = createMemoryStorage();
  const state = createStandardGame();
  const snapshot = { state, startedAtEpochMs: 123456, savedAtEpochMs: 123999 };
  saveActiveGame(snapshot, storage);
  const loaded = loadActiveGame(storage);
  assert.deepEqual(loaded.state.chutes, state.chutes);
  assert.equal(loaded.startedAtEpochMs, 123456);
});

test('corrupt or unsupported active data returns null safely', () => {
  const storage = createMemoryStorage();
  storage.setItem('mightAsWellJump.activeGame.v1', '{broken');
  assert.equal(loadActiveGame(storage), null);
  storage.setItem('mightAsWellJump.activeGame.v1', JSON.stringify({version: 99}));
  assert.equal(loadActiveGame(storage), null);
});

test('clearActiveGame removes stored game and preferences persist booleans', () => {
  const storage = createMemoryStorage();
  savePreference('symbols', true, storage);
  assert.equal(loadPreference('symbols', false, storage), true);
  const snapshot = { state: createStandardGame(), startedAtEpochMs: null, savedAtEpochMs: 1 };
  saveActiveGame(snapshot, storage);
  clearActiveGame(storage);
  assert.equal(loadActiveGame(storage), null);
});
