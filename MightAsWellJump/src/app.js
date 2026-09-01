import {
  MODE, createStandardGame, createRandomGame, rotate,
  transferChuteToCenter, transferCenterToChute, contextualTransfer, isSolved, serializeState, targetColorFor
} from './game-engine.js';
import { createInputController, parseWheelDeg, shortestSnapAngle } from './input-controller.js';
import { saveActiveGame, loadActiveGame, clearActiveGame, savePreference, loadPreference } from './persistence.js';
import { playTransferFlight } from './transfer-animation.js';

const $ = id => document.getElementById(id);
const modeScreen = $('modeScreen');
const gameScreen = $('gameScreen');
const board = $('board');
const wheel = $('wheel');
const centerBallMount = $('centerBallMount');
const centerSlot = $('centerSlot');
const timerEl = $('timer');
const movesEl = $('moves');
const modeLabel = $('modeLabel');
const gameMessage = $('gameMessage');
const infoDialog = $('infoDialog');
const winDialog = $('winDialog');

const SYMBOLS = { yellow: '●', orange: '▲', red: '■', blue: '◆', green: '★' };
const FLIGHT_MS = 150;
let state = null;
let startedAtEpochMs = null;
let elapsedMs = 0;
let timerFrame = null;
let inputEnabled = false;
let setupToken = 0;
let symbolsOn = Boolean(loadPreference('symbols', false));
let soundOn = Boolean(loadPreference('sound', false));

function formatTime(ms) {
  const tenths = Math.floor(Math.max(0, ms) / 100);
  const minutes = Math.floor(tenths / 600);
  const seconds = Math.floor(tenths / 10) % 60;
  return `${minutes}:${String(seconds).padStart(2,'0')}.${tenths % 10}`;
}

function setMessage(text) { gameMessage.textContent = text; }

// The wheel's continuous visual angle lives only in its own rendered
// transform — reading it back here (rather than tracking a second, parallel
// angle variable) is what keeps every snap on the shortest path without
// ever competing with state.wheelStop as a source of truth.
function currentWheelDeg() { return parseWheelDeg(wheel.style.transform); }

function prefersReducedMotion() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch { return false; }
}

function modeName(mode) { return mode === MODE.RANDOM ? 'Random' : 'Standard'; }

function applyPreferences() {
  document.body.classList.toggle('symbols-on', symbolsOn);
  for (const el of [$('symbolsToggle'), $('symbolsToggleIntro')]) {
    el?.setAttribute('aria-pressed', String(symbolsOn));
  }
  $('symbolsToggleIntro').textContent = `◇ Color Symbols: ${symbolsOn ? 'On' : 'Off'}`;
  $('symbolsToggle').textContent = symbolsOn ? '◆' : '◇';
  for (const el of [$('soundToggle'), $('soundToggleIntro')]) el?.setAttribute('aria-pressed', String(soundOn));
  $('soundToggleIntro').textContent = `${soundOn ? '🔊' : '🔇'} Sound: ${soundOn ? 'On' : 'Off'}`;
  $('soundToggle').textContent = soundOn ? '🔊' : '🔇';
}

function toggleSymbols() {
  symbolsOn = !symbolsOn;
  savePreference('symbols', symbolsOn);
  applyPreferences();
}
function toggleSound() {
  soundOn = !soundOn;
  savePreference('sound', soundOn);
  applyPreferences();
  // Audio effects are added in the next milestone; preference/UI is already wired.
}

function createBall(color) {
  const ball = document.createElement('span');
  ball.className = `ball ${color}`;
  ball.dataset.color = color;
  ball.setAttribute('aria-label', `${color} ball`);
  const symbol = document.createElement('span');
  symbol.className = 'symbol';
  symbol.textContent = SYMBOLS[color];
  ball.appendChild(symbol);
  return ball;
}

function createWell(target, ballColor, delayIndex = 0) {
  const well = document.createElement('span');
  well.className = 'well';
  if (target) {
    well.dataset.target = target;
    const targetSymbol = document.createElement('span');
    targetSymbol.className = 'target-symbol';
    targetSymbol.textContent = SYMBOLS[target];
    well.appendChild(targetSymbol);
  }
  if (ballColor) {
    const ball = createBall(ballColor);
    ball.style.animationDelay = `${Math.min(650, delayIndex * 26)}ms`;
    well.appendChild(ball);
  }
  return well;
}

function renderBoard({ setup = false } = {}) {
  if (!state) return;
  const nextDeg = shortestSnapAngle(currentWheelDeg(), state.wheelStop);
  wheel.replaceChildren();
  wheel.dataset.stop = String(state.wheelStop);
  wheel.style.transform = `rotate(${nextDeg}deg)`;

  state.chutes.forEach((chute, chuteIndex) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `chute ${chuteIndex === 0 ? 'passer' : 'normal'}${chuteIndex === state.wheelStop ? ' active' : ''}`;
    el.dataset.chute = String(chuteIndex);
    el.style.transform = `translate(-50%, -100%) rotate(${180 + chuteIndex * 60}deg)`;
    el.setAttribute('aria-label', chuteIndex === 0 ? 'Passer chute' : `Chute ${chuteIndex}`);
    chute.forEach((ballColor, slotIndex) => {
      el.appendChild(createWell(targetColorFor(chuteIndex, slotIndex), ballColor, chuteIndex * 5 + slotIndex));
    });
    wheel.appendChild(el);
  });

  centerBallMount.replaceChildren();
  if (state.center) centerBallMount.appendChild(createBall(state.center));
  movesEl.textContent = String(state.moves);
  modeLabel.textContent = modeName(state.mode);
  $('newRandomBtn').hidden = state.mode !== MODE.RANDOM;

  if (setup) document.body.classList.add('setting-up');
}

function renderActiveHighlight() {
  wheel.querySelectorAll('.chute').forEach((el, i) => el.classList.toggle('active', i === state.wheelStop));
}

function persistIfActive() {
  if (!state || !state.started || state.solved) return;
  saveActiveGame({ state: serializeState(state), startedAtEpochMs, savedAtEpochMs: Date.now() });
}

function startTimerIfNeeded() {
  if (state.started) return;
  state.started = true;
  startedAtEpochMs = Date.now();
  elapsedMs = 0;
  startTimerLoop();
}

function startTimerLoop() {
  if (timerFrame) cancelAnimationFrame(timerFrame);
  const tick = () => {
    if (!state || state.solved) return;
    if (state.started && startedAtEpochMs !== null) {
      elapsedMs = Date.now() - startedAtEpochMs;
      timerEl.textContent = formatTime(elapsedMs);
    }
    timerFrame = requestAnimationFrame(tick);
  };
  timerFrame = requestAnimationFrame(tick);
}

function finishIfSolved() {
  if (!isSolved(state)) return false;
  state.solved = true;
  inputEnabled = false;
  if (state.started && startedAtEpochMs !== null) elapsedMs = Date.now() - startedAtEpochMs;
  if (timerFrame) cancelAnimationFrame(timerFrame);
  timerEl.textContent = formatTime(elapsedMs);
  clearActiveGame();
  $('finalTime').textContent = formatTime(elapsedMs);
  $('finalMoves').textContent = String(state.moves);
  $('finalMode').textContent = modeName(state.mode);
  setMessage('Challenge complete!');
  winDialog.showModal();
  return true;
}

// Shared apply/render/message/timer/persist path for both the directional
// swipe transfer and the contextual tap transfer. `beforeState` is the
// state as it was immediately before `result` was computed — needed only to
// read which ball is leaving the hub on an 'out' transfer, since by the
// time `result` exists the hub has already been cleared.
function performTransfer(result, direction, beforeState) {
  if (!result.changed) {
    setMessage(direction === 'in' ? 'That ball cannot move into the hub right now.' : 'The aligned chute cannot accept the hub ball.');
    return;
  }
  const flightColor = direction === 'in' ? result.state.center : beforeState.center;
  state = result.state;
  startTimerIfNeeded();
  renderBoard();
  playTransferFlight({ container: board, color: flightColor, direction, duration: FLIGHT_MS, reducedMotion: prefersReducedMotion() });
  setMessage(direction === 'in' ? 'Ball moved to hub.' : 'Ball placed in chute.');
  if (!finishIfSolved()) persistIfActive();
}

// Radial swipe: direction is explicit (the swipe itself communicates
// intent), so this always attempts exactly the swiped direction.
function onSwipeTransfer(direction) {
  if (!inputEnabled || !state || state.solved) return;
  const result = direction === 'in' ? transferChuteToCenter(state) : transferCenterToChute(state);
  performTransfer(result, direction, state);
}

// Contextual tap: the active chute and the hub both dispatch here. The hub's
// occupancy — not which of the two zones was tapped — decides direction.
function onContextualTransfer() {
  if (!inputEnabled || !state || state.solved) return;
  const direction = state.center === null ? 'in' : 'out';
  performTransfer(contextualTransfer(state), direction, state);
}

function rotateBy(deltaStops) {
  if (!inputEnabled || !state || state.solved) return;
  const result = rotate(state, deltaStops);
  state = result.state;
  wheel.dataset.stop = String(state.wheelStop);
  wheel.style.transition = '';
  wheel.style.transform = `rotate(${shortestSnapAngle(currentWheelDeg(), state.wheelStop)}deg)`;
  renderActiveHighlight();
  if (result.changed) {
    startTimerIfNeeded();
    setMessage(`Chute ${state.wheelStop === 0 ? 'Passer' : state.wheelStop} aligned.`);
    persistIfActive();
  }
}

function restoreFromInitial() {
  return {
    mode: state.mode,
    chutes: state.initialChutes.map(ch => [...ch]),
    center: null,
    wheelStop: 0,
    moves: 0,
    started: false,
    solved: false,
    initialChutes: state.initialChutes.map(ch => [...ch])
  };
}

function confirmLoss(action) {
  if (!state?.started || state.solved) return true;
  return window.confirm(`Your current time and moves will be lost. ${action}?`);
}

async function beginGame(newState, { animate = true } = {}) {
  state = newState;
  startedAtEpochMs = null;
  elapsedMs = 0;
  if (timerFrame) cancelAnimationFrame(timerFrame);
  timerEl.textContent = '0:00.0';
  modeScreen.hidden = true;
  gameScreen.hidden = false;
  inputEnabled = false;
  const token = ++setupToken;
  renderBoard({ setup: animate });
  setMessage(animate ? 'Setting up the challenge…' : 'Align a chute with the hub to move a ball.');

  if (animate) {
    const balls = [...document.querySelectorAll('.ball')];
    balls.forEach((ball, i) => setTimeout(() => ball.classList.add('reveal'), 120 + i * 28));
    await new Promise(resolve => setTimeout(resolve, 1100));
    if (token !== setupToken) return;
    document.body.classList.remove('setting-up');
  }
  inputEnabled = true;
  setMessage('Align a chute with the hub to move a ball.');
}

function showModes() {
  gameScreen.hidden = true;
  modeScreen.hidden = false;
  refreshResumePanel();
}

function refreshResumePanel() {
  const saved = loadActiveGame();
  $('resumePanel').hidden = !saved;
  return saved;
}

function resumeSavedGame() {
  const saved = loadActiveGame();
  if (!saved) return;
  state = saved.state;
  state.solved = false;
  startedAtEpochMs = saved.startedAtEpochMs;
  elapsedMs = startedAtEpochMs === null ? 0 : Date.now() - startedAtEpochMs;
  modeScreen.hidden = true;
  gameScreen.hidden = false;
  inputEnabled = true;
  renderBoard();
  timerEl.textContent = formatTime(elapsedMs);
  setMessage('Game resumed. The clock continued while you were away.');
  if (state.started) startTimerLoop();
}

$('standardBtn').addEventListener('click', () => beginGame(createStandardGame()));
$('randomBtn').addEventListener('click', () => beginGame(createRandomGame()));
$('rotateLeft').addEventListener('click', () => rotateBy(-1));
$('rotateRight').addEventListener('click', () => rotateBy(1));
$('restartBtn').addEventListener('click', () => {
  if (!state || !confirmLoss('Restart this game')) return;
  clearActiveGame();
  beginGame(restoreFromInitial());
});
$('newRandomBtn').addEventListener('click', () => {
  if (!state || !confirmLoss('Start a new Random game')) return;
  clearActiveGame();
  beginGame(createRandomGame());
});
$('switchModeBtn').addEventListener('click', () => {
  if (!confirmLoss('Return to mode selection')) return;
  clearActiveGame();
  if (timerFrame) cancelAnimationFrame(timerFrame);
  state = null;
  startedAtEpochMs = null;
  showModes();
});
$('playAgainBtn').addEventListener('click', () => { winDialog.close(); beginGame(restoreFromInitial()); });
$('closeWinBtn').addEventListener('click', () => winDialog.close());

for (const id of ['infoBtn','infoBtnIntro']) $(id).addEventListener('click', () => infoDialog.showModal());
for (const id of ['symbolsToggle','symbolsToggleIntro']) $(id).addEventListener('click', toggleSymbols);
for (const id of ['soundToggle','soundToggleIntro']) $(id).addEventListener('click', toggleSound);
$('resumeBtn').addEventListener('click', resumeSavedGame);
$('discardBtn').addEventListener('click', () => { clearActiveGame(); $('resumePanel').hidden = true; });

createInputController({
  board,
  wheel,
  centerSlot,
  onRotateStop: rotateBy,
  onChuteToCenter: () => onSwipeTransfer('in'),
  onCenterToChute: () => onSwipeTransfer('out'),
  onTransfer: onContextualTransfer,
  isEnabled: () => inputEnabled && Boolean(state) && !state.solved
});

window.addEventListener('beforeunload', persistIfActive);
document.addEventListener('visibilitychange', () => { if (document.hidden) persistIfActive(); });

applyPreferences();
refreshResumePanel();
