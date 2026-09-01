import { COLORS, MODE } from './game-engine.js';

const ACTIVE_KEY = 'mightAsWellJump.activeGame.v1';
const PREF_PREFIX = 'mightAsWellJump.pref.';
const allowedBall = value => value === null || COLORS.includes(value);

export function createMemoryStorage() {
  const map = new Map();
  return {
    getItem: key => map.has(key) ? map.get(key) : null,
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: key => map.delete(key)
  };
}

function validState(state) {
  if (!state || !Object.values(MODE).includes(state.mode)) return false;
  if (!Array.isArray(state.chutes) || state.chutes.length !== 6) return false;
  if (!state.chutes.every(ch => Array.isArray(ch) && ch.length === 5 && ch.every(allowedBall))) return false;
  if (!allowedBall(state.center)) return false;
  if (!Number.isInteger(state.wheelStop) || state.wheelStop < 0 || state.wheelStop > 5) return false;
  if (!Number.isInteger(state.moves) || state.moves < 0) return false;
  if (!Array.isArray(state.initialChutes) || state.initialChutes.length !== 6) return false;
  if (!state.initialChutes.every(ch => Array.isArray(ch) && ch.length === 5 && ch.every(allowedBall))) return false;
  return true;
}

export function saveActiveGame(snapshot, storage = localStorage) {
  const payload = { version: 1, ...snapshot };
  storage.setItem(ACTIVE_KEY, JSON.stringify(payload));
}

export function loadActiveGame(storage = localStorage) {
  try {
    const raw = storage.getItem(ACTIVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.version !== 1 || !validState(data.state)) return null;
    if (data.startedAtEpochMs !== null && (!Number.isFinite(data.startedAtEpochMs) || data.startedAtEpochMs < 0)) return null;
    return data;
  } catch { return null; }
}

export function clearActiveGame(storage = localStorage) { storage.removeItem(ACTIVE_KEY); }
export function savePreference(key, value, storage = localStorage) { storage.setItem(PREF_PREFIX + key, JSON.stringify(value)); }
export function loadPreference(key, fallback, storage = localStorage) {
  try {
    const raw = storage.getItem(PREF_PREFIX + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch { return fallback; }
}
