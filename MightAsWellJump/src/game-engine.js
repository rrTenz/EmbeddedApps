export const COLORS = Object.freeze(['yellow','blue','red','orange','green']);
export const TARGET_ORDER = COLORS;

// The passer chute (index 0) is neutral and carries no target color; every
// colored chute uses the same TARGET_ORDER sequence per slot.
export function targetColorFor(chuteIndex, slotIndex) {
  return chuteIndex === 0 ? null : TARGET_ORDER[slotIndex];
}
export const MODE = Object.freeze({ STANDARD: 'standard', RANDOM: 'random' });
export const STANDARD_START = Object.freeze([
  Object.freeze([null,null,null,null,null]),
  Object.freeze(['yellow','blue','red','green','orange']),
  Object.freeze(['yellow','blue','green','red','orange']),
  Object.freeze(['yellow','green','blue','red','orange']),
  Object.freeze(['yellow','red','orange','green','blue']),
  Object.freeze(['yellow','green','red','orange','blue'])
]);

const cloneChutes = chutes => chutes.map(chute => [...chute]);
const normalizeStop = stop => ((stop % 6) + 6) % 6;

function baseState(mode, chutes) {
  const cloned = cloneChutes(chutes);
  return {
    mode,
    chutes: cloned,
    center: null,
    wheelStop: 0,
    moves: 0,
    started: false,
    solved: false,
    initialChutes: cloneChutes(cloned)
  };
}

export function createStandardGame() {
  return baseState(MODE.STANDARD, STANDARD_START);
}

function fisherYates(values, randomFn) {
  const out = [...values];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.max(0, Math.min(0.999999999999, randomFn())) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function solvedNormalChutes(chutes) {
  return chutes.slice(1).every(chute => TARGET_ORDER.every((color, i) => chute[i] === color));
}

export function createRandomGame(randomFn = Math.random) {
  const multiset = COLORS.flatMap(color => Array(5).fill(color));
  let shuffled;
  let attempts = 0;
  do {
    shuffled = fisherYates(multiset, randomFn);
    attempts += 1;
    if (attempts > 200) {
      // Deterministically break pathological injected RNGs without weakening invariants.
      shuffled = [...multiset];
      [shuffled[0], shuffled[1]] = [shuffled[1], shuffled[0]];
      [shuffled[1], shuffled[5]] = [shuffled[5], shuffled[1]];
      break;
    }
  } while (Array.from({length: 5}, (_, i) => shuffled.slice(i * 5, i * 5 + 5))
    .every(chute => TARGET_ORDER.every((color, i) => chute[i] === color)));

  const chutes = [Array(5).fill(null)];
  for (let i = 0; i < 5; i++) chutes.push(shuffled.slice(i * 5, i * 5 + 5));
  return baseState(MODE.RANDOM, chutes);
}

function cloneState(state) {
  return {
    ...state,
    chutes: cloneChutes(state.chutes),
    initialChutes: cloneChutes(state.initialChutes || state.chutes)
  };
}

export function rotate(state, deltaStops) {
  const next = cloneState(state);
  const stop = normalizeStop(state.wheelStop + Math.trunc(deltaStops));
  const changed = stop !== state.wheelStop;
  next.wheelStop = stop;
  return { state: next, changed };
}

export function transferChuteToCenter(state) {
  if (state.center !== null) return { state: cloneState(state), changed: false };
  const next = cloneState(state);
  const chute = next.chutes[next.wheelStop];
  let index = -1;
  for (let i = chute.length - 1; i >= 0; i--) {
    if (chute[i] !== null) { index = i; break; }
  }
  if (index < 0) return { state: next, changed: false };
  next.center = chute[index];
  chute[index] = null;
  next.moves += 1;
  next.solved = isSolved(next);
  return { state: next, changed: true };
}

export function transferCenterToChute(state) {
  if (state.center === null) return { state: cloneState(state), changed: false };
  const next = cloneState(state);
  const chute = next.chutes[next.wheelStop];
  const index = chute.findIndex(value => value === null);
  if (index < 0) return { state: next, changed: false };
  chute[index] = next.center;
  next.center = null;
  next.moves += 1;
  next.solved = isSolved(next);
  return { state: next, changed: true };
}

// Contextual transfer: direction is decided by hub occupancy alone, not by
// which of the two on-screen zones (chute vs hub) the player actually
// tapped. Both zones dispatch here; the guarded transferChuteToCenter /
// transferCenterToChute calls already no-op cleanly for the invalid cases
// (chute+hub both empty, or chute full while hub is occupied).
export function contextualTransfer(state) {
  return state.center === null ? transferChuteToCenter(state) : transferCenterToChute(state);
}

export function isSolved(state) {
  return state.center === null
    && state.chutes[0].every(v => v === null)
    && solvedNormalChutes(state.chutes);
}

export function serializeState(state) {
  return JSON.parse(JSON.stringify(state));
}
