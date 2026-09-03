import {
  MODE, createStandardGame, createRandomGame, rotate,
  transferChuteToCenter, transferCenterToChute, contextualTransfer, isSolved, serializeState, targetColorFor
} from './game-engine.js';
import { createInputController, parseWheelDeg, shortestSnapAngle } from './input-controller.js';
import { saveActiveGame, loadActiveGame, clearActiveGame, savePreference, loadPreference } from './persistence.js';
import { playTransferFlight } from './transfer-animation.js';
import { formatTime } from './format.js';
import { validateDisplayName } from './display-name.js';
import { buildShareText, shareResult } from './share.js';
import { createLeaderboardClient, createRunId } from './leaderboard-service.js';
import { createAudioController } from './audio.js';

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
const scoreForm = $('scoreForm');
const scoreFormRow = $('scoreFormRow');
const displayNameInput = $('displayNameInput');
const submitScoreBtn = $('submitScoreBtn');
const scoreMessage = $('scoreMessage');
const scoreSubmittedState = $('scoreSubmittedState');
const scoreSubmittedRank = $('scoreSubmittedRank');
const shareBtn = $('shareBtn');
const shareMessage = $('shareMessage');
const leaderboardStatus = $('leaderboardStatus');
const leaderboardList = $('leaderboardList');
const leaderboardSeeMoreBtn = $('leaderboardSeeMoreBtn');
const leaderboardModeStandardBtn = $('leaderboardModeStandardBtn');
const leaderboardModeRandomBtn = $('leaderboardModeRandomBtn');

const SYMBOLS = { yellow: '●', orange: '▲', red: '■', blue: '◆', green: '★' };
const FLIGHT_MS = 150;
const LEADERBOARD_TOP_COUNT = 10;
const LEADERBOARD_EXPANDED_COUNT = 50;
let state = null;
let startedAtEpochMs = null;
let elapsedMs = 0;
let timerFrame = null;
let inputEnabled = false;
let setupToken = 0;
let symbolsOn = Boolean(loadPreference('symbols', false));
let soundOn = Boolean(loadPreference('sound', false));

const audio = createAudioController();
// Central gate for every game sound: the existing Sound toggle is the sole
// control, and this is the sole place that checks it. A failure inside
// audio.js is already swallowed there, but this catch is a second,
// independent safety net at the call-site layer — sound must never be able
// to interrupt a real game action (transfer/rotate/win) regardless of which
// layer a future bug lands in.
function playSound(effect) {
  if (!soundOn) return;
  try { effect(); } catch { /* decorative only */ }
}

const leaderboardClient = createLeaderboardClient();
let leaderboardMode = MODE.STANDARD;
let leaderboardExpanded = false;
let leaderboardLoadToken = 0;
let currentRunId = null;
let scoreSubmitted = false;
let scoreSubmitting = false;

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

function renderLeaderboardRows(scores) {
  leaderboardList.replaceChildren();
  if (!scores.length) {
    const li = document.createElement('li');
    li.className = 'leaderboard-row leaderboard-empty';
    li.textContent = 'No scores yet. Be the first!';
    leaderboardList.appendChild(li);
    return;
  }
  scores.forEach((score, index) => {
    const li = document.createElement('li');
    li.className = 'leaderboard-row';
    const rank = document.createElement('span');
    rank.className = 'rank';
    rank.textContent = String(index + 1);
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = String(score.displayName || 'Player');
    const time = document.createElement('span');
    time.className = 'time';
    time.textContent = formatTime(Number(score.timeMs) || 0);
    const moves = document.createElement('span');
    moves.className = 'moves';
    moves.textContent = `${Number(score.moves) || 0} mv`;
    li.append(rank, name, time, moves);
    leaderboardList.appendChild(li);
  });
}

// Re-entrant safe: a stale in-flight fetch (from a prior mode switch or
// See More click) can no longer clobber a newer one's result, since only the
// call that matches the current token is allowed to render.
async function loadLeaderboardSection() {
  const token = ++leaderboardLoadToken;
  leaderboardStatus.hidden = false;
  leaderboardStatus.textContent = 'Loading scores…';
  leaderboardStatus.className = 'leaderboard-status';

  const count = leaderboardExpanded ? LEADERBOARD_EXPANDED_COUNT : LEADERBOARD_TOP_COUNT;
  const result = await leaderboardClient.fetchTop({ mode: leaderboardMode, count });
  if (token !== leaderboardLoadToken) return;

  if (!result.ok) {
    leaderboardList.replaceChildren();
    leaderboardStatus.textContent = result.reason === 'not-configured'
      ? 'Leaderboard is not available right now.'
      : 'Could not load the leaderboard. Please try again later.';
    leaderboardStatus.className = 'leaderboard-status error';
    leaderboardSeeMoreBtn.hidden = true;
    return;
  }

  leaderboardStatus.hidden = true;
  renderLeaderboardRows(result.scores);
  leaderboardSeeMoreBtn.hidden = leaderboardExpanded || result.scores.length < LEADERBOARD_TOP_COUNT;
}

function switchLeaderboardMode(mode) {
  if (mode === leaderboardMode) return;
  leaderboardMode = mode;
  leaderboardExpanded = false;
  leaderboardModeStandardBtn.setAttribute('aria-pressed', String(mode === MODE.STANDARD));
  leaderboardModeRandomBtn.setAttribute('aria-pressed', String(mode === MODE.RANDOM));
  loadLeaderboardSection();
}

function defaultLeaderboardToMode(mode) {
  leaderboardExpanded = false;
  leaderboardMode = mode;
  leaderboardModeStandardBtn.setAttribute('aria-pressed', String(mode === MODE.STANDARD));
  leaderboardModeRandomBtn.setAttribute('aria-pressed', String(mode === MODE.RANDOM));
  loadLeaderboardSection();
}

// Makes a successful (or already-duplicate, functionally equivalent)
// submission unmistakable: the input+button row disappears entirely (rather
// than merely being `disabled`, which has no visual styling in this app and
// so looks identical to an enabled button) and a distinct checkmark panel
// takes its place. The win dialog itself is intentionally left open here —
// the player may still want to see their rank and use Share Result.
function enterScoreSubmittedState() {
  scoreSubmitted = true;
  submitScoreBtn.disabled = true;
  scoreFormRow.hidden = true;
  scoreMessage.textContent = '';
  scoreMessage.className = 'form-message';
  scoreSubmittedRank.textContent = '';
  scoreSubmittedState.hidden = false;
}

async function handleScoreSubmit(event) {
  event.preventDefault();
  if (!state?.solved || scoreSubmitted || scoreSubmitting) return;

  const validation = validateDisplayName(displayNameInput.value);
  if (!validation.ok) {
    scoreMessage.textContent = validation.message;
    scoreMessage.className = 'form-message error';
    return;
  }

  // Guards against a stale in-flight submission (e.g. Submit then immediately
  // Play Again before the network call resolves) writing its result into a
  // *different* completed run's dialog once it finally settles.
  const runIdAtSubmit = currentRunId;
  const isStale = () => currentRunId !== runIdAtSubmit;

  scoreSubmitting = true;
  submitScoreBtn.disabled = true;
  scoreMessage.textContent = 'Submitting…';
  scoreMessage.className = 'form-message';
  savePreference('displayName', validation.name);

  const mode = state.mode;
  const timeMs = Math.max(1, Math.round(elapsedMs));
  const moves = state.moves;
  const result = await leaderboardClient.submitScore({ mode, displayName: validation.name, timeMs, moves, runId: runIdAtSubmit });
  if (isStale()) return;
  scoreSubmitting = false;

  if (!result.ok && result.reason !== 'duplicate') {
    submitScoreBtn.disabled = false;
    scoreMessage.textContent = result.reason === 'not-configured'
      ? 'Leaderboard is unavailable right now, but your result is saved above.'
      : 'Score submission failed. You can try again.';
    scoreMessage.className = 'form-message error';
    return;
  }

  // A fresh success and a retried duplicate of this exact run both mean the
  // score is already on the leaderboard, so both get the identical
  // unmistakable submitted state.
  enterScoreSubmittedState();

  const rankResult = await leaderboardClient.fetchRank({ mode, timeMs, moves });
  if (isStale()) return;
  if (rankResult.ok) {
    scoreSubmittedRank.textContent = rankResult.rank <= LEADERBOARD_TOP_COUNT
      ? `You're #${rankResult.rank} on the ${modeName(mode)} leaderboard!`
      : `Your rank: #${rankResult.rank}`;
  }

  defaultLeaderboardToMode(mode);
}

async function handleShareResult() {
  if (!state) return;
  const text = buildShareText({ mode: state.mode, timeMs: elapsedMs, moves: state.moves });
  shareMessage.textContent = '';
  shareMessage.className = 'form-message';
  // buildShareText() already appends SHARE_URL as the text's last line, so a
  // separate `url` is not passed here too — on the native Web Share API
  // path, passing both caused several share targets (notably iOS) to show
  // the link twice: once embedded in the text, once as its own url field.
  const result = await shareResult({ text, title: 'Might As Well Jump', nav: window.navigator, doc: document });
  if (result.cancelled) return;
  if (!result.ok) {
    shareMessage.textContent = 'Could not share automatically. You can copy your result manually.';
    shareMessage.className = 'form-message error';
    return;
  }
  shareMessage.textContent = result.method === 'native' ? 'Share sheet opened!' : 'Result copied!';
  shareMessage.className = 'form-message success';
}

function finishIfSolved() {
  if (!isSolved(state)) return false;
  state.solved = true;
  inputEnabled = false;
  // isSolved() only returns true once, right at the unsolved -> solved
  // transition (state.solved just flipped, and inputEnabled=false now blocks
  // every further transfer, so finishIfSolved's body can never run again for
  // this run) — so this fires exactly once per completed game.
  playSound(() => audio.playWin());
  if (state.started && startedAtEpochMs !== null) elapsedMs = Date.now() - startedAtEpochMs;
  if (timerFrame) cancelAnimationFrame(timerFrame);
  timerEl.textContent = formatTime(elapsedMs);
  clearActiveGame();
  $('finalTime').textContent = formatTime(elapsedMs);
  $('finalMoves').textContent = String(state.moves);
  $('finalMode').textContent = modeName(state.mode);
  setMessage('Challenge complete!');

  // A fresh runId per completed game is the server-enforced half of duplicate
  // submission prevention: leaderboardClient.submitScore writes keyed by this
  // id, and Firestore rejects a second write to the same id as an update.
  currentRunId = createRunId();
  scoreSubmitted = false;
  scoreSubmitting = false;
  submitScoreBtn.disabled = false;
  scoreFormRow.hidden = false;
  scoreSubmittedState.hidden = true;
  scoreSubmittedRank.textContent = '';
  displayNameInput.value = String(loadPreference('displayName', ''));
  scoreMessage.textContent = '';
  scoreMessage.className = 'form-message';
  shareMessage.textContent = '';
  shareMessage.className = 'form-message';
  defaultLeaderboardToMode(state.mode);

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
  playSound(() => audio.playTransfer({ color: flightColor, direction }));
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
    playSound(() => audio.playSnap());
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
  // Covers Standard/Random/Restart/New Random/Play Again: if a win cheer is
  // still within its 5-second window from the previous run, a fresh game
  // starting should not keep it playing underneath.
  audio.stopWin();
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
  defaultLeaderboardToMode(newState.mode);

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
  defaultLeaderboardToMode(state.mode);
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
  audio.stopWin();
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

scoreForm.addEventListener('submit', handleScoreSubmit);
shareBtn.addEventListener('click', handleShareResult);
leaderboardModeStandardBtn.addEventListener('click', () => switchLeaderboardMode(MODE.STANDARD));
leaderboardModeRandomBtn.addEventListener('click', () => switchLeaderboardMode(MODE.RANDOM));
leaderboardSeeMoreBtn.addEventListener('click', () => {
  leaderboardExpanded = true;
  loadLeaderboardSection();
});

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
loadLeaderboardSection();
