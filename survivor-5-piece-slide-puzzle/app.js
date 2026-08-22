import { firebaseConfig } from "./firebase-config.js";

const COLS = 4;
const ROWS = 6;
const SHARE_URL = "https://www.survivorgeek.app/apps/survivor-5-piece-slide-puzzle";
const START = [
  { id: "tl", kind: "corner", x: 0, y: 0, cells: [[0,0],[1,0],[0,1]], medallion: "tl" },
  { id: "tr", kind: "corner", x: 2, y: 0, cells: [[0,0],[1,0],[1,1]], medallion: "tr" },
  { id: "bl", kind: "corner", x: 0, y: 2, cells: [[0,0],[0,1],[1,1]], medallion: "bl" },
  { id: "br", kind: "corner", x: 2, y: 2, cells: [[1,0],[0,1],[1,1]], medallion: "br" },
  { id: "center", kind: "center", x: 1, y: 4, cells: [[0,0],[1,0],[0,1],[1,1]] }
];

const blockedWords = [
  "fuck","shit","bitch","cunt","dick","cock","pussy","asshole","nigger","nigga",
  "faggot","whore","slut","retard"
];

const board = document.getElementById("board");
const pieceLayer = document.getElementById("pieceLayer");
const timerEl = document.getElementById("timer");
const movesEl = document.getElementById("moves");
const resetBtn = document.getElementById("resetBtn");
const overlay = document.getElementById("winOverlay");
const finalTimeEl = document.getElementById("finalTime");
const finalMovesEl = document.getElementById("finalMoves");
const playAgainBtn = document.getElementById("playAgainBtn");
const shareBtn = document.getElementById("shareBtn");
const closeWinBtn = document.getElementById("closeWinBtn");
const scoreForm = document.getElementById("scoreForm");
const nicknameInput = document.getElementById("nickname");
const scoreMessage = document.getElementById("scoreMessage");
const submitScoreBtn = document.getElementById("submitScoreBtn");
const leaderboardList = document.getElementById("leaderboardList");
const leaderboardStatus = document.getElementById("leaderboardStatus");
const refreshLeaderboardBtn = document.getElementById("refreshLeaderboardBtn");

let pieces = [];
let pieceEls = new Map();
let moves = 0;
let startedAt = null;
let elapsedMs = 0;
let timerFrame = null;
let solved = false;
let drag = null;
let scoreSubmitted = false;
let scoreSubmitting = false;

let cloud = {
  enabled: false,
  db: null,
  auth: null,
  addDoc: null,
  collection: null,
  getDocs: null,
  limit: null,
  orderBy: null,
  query: null,
  serverTimestamp: null
};

function cloneStart() {
  return START.map(p => ({ ...p, cells: p.cells.map(c => [...c]) }));
}

function getCellSize() {
  return board.clientWidth / COLS;
}

function absoluteCells(piece, x = piece.x, y = piece.y) {
  return piece.cells.map(([dx, dy]) => [x + dx, y + dy]);
}

function isLegal(piece, nx, ny) {
  const candidate = absoluteCells(piece, nx, ny);

  for (const [x, y] of candidate) {
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return false;
  }

  const occupied = new Set();
  for (const other of pieces) {
    if (other.id === piece.id) continue;
    for (const [x, y] of absoluteCells(other)) occupied.add(`${x},${y}`);
  }

  return candidate.every(([x, y]) => !occupied.has(`${x},${y}`));
}

function tryMove(piece, dx, dy) {
  if (solved) return false;

  const nx = piece.x + dx;
  const ny = piece.y + dy;
  if (!isLegal(piece, nx, ny)) return false;

  piece.x = nx;
  piece.y = ny;

  if (startedAt === null) startTimer();

  // Every successful move by one 1x1 grid unit counts as one move.
  moves += 1;
  movesEl.textContent = String(moves);

  positionPiece(piece, true);

  if (isSolved()) finishPuzzle();
  return true;
}

function isSolved() {
  const byId = Object.fromEntries(pieces.map(p => [p.id, p]));
  const tl = byId.tl;
  const tr = byId.tr;
  const bl = byId.bl;
  const br = byId.br;
  const center = byId.center;

  for (let y = 0; y <= 2; y++) {
    if (
      tl.x === 0 && tl.y === y &&
      tr.x === 2 && tr.y === y &&
      bl.x === 0 && bl.y === y + 2 &&
      br.x === 2 && br.y === y + 2 &&
      center.x === 1 && center.y === y + 1
    ) return true;
  }
  return false;
}

function createPieceElement(piece) {
  const el = document.createElement("div");
  el.className = `piece ${piece.kind === "center" ? "center-piece" : "corner-piece"}`;
  el.dataset.id = piece.id;
  el.setAttribute("role", "button");
  el.setAttribute("aria-label", piece.kind === "center" ? "Center square piece" : `Corner piece ${piece.id.toUpperCase()}`);
  el.tabIndex = 0;

  for (const [cx, cy] of piece.cells) {
    const cell = document.createElement("div");
    cell.className = "piece-cell";
    cell.dataset.cx = String(cx);
    cell.dataset.cy = String(cy);
    el.appendChild(cell);
  }

  if (piece.kind === "corner") {
    const med = document.createElement("div");
    med.className = `corner-medallion ${piece.medallion}`;
    el.appendChild(med);
  } else {
    const med = document.createElement("div");
    med.className = "center-medallion";
    el.appendChild(med);
  }

  el.addEventListener("pointerdown", onPointerDown);
  el.addEventListener("keydown", onPieceKeyDown);
  return el;
}

function sizePieceElement(el, piece) {
  const cell = getCellSize();
  el.style.width = `${cell * 2}px`;
  el.style.height = `${cell * 2}px`;

  for (const cellEl of el.querySelectorAll(".piece-cell")) {
    const cx = Number(cellEl.dataset.cx);
    const cy = Number(cellEl.dataset.cy);
    cellEl.style.left = `${cx * cell}px`;
    cellEl.style.top = `${cy * cell}px`;
    cellEl.style.width = `${cell}px`;
    cellEl.style.height = `${cell}px`;
  }

  positionPiece(piece, false);
}

function positionPiece(piece, animate = false) {
  const el = pieceEls.get(piece.id);
  if (!el) return;
  const cell = getCellSize();
  if (!animate) el.style.transition = "none";
  el.style.transform = `translate(${piece.x * cell}px, ${piece.y * cell}px)`;
  if (!animate) {
    requestAnimationFrame(() => { el.style.transition = ""; });
  }
}

function renderAll() {
  const previous = new Map(pieceEls);
  pieceEls.clear();
  pieceLayer.replaceChildren();

  for (const piece of pieces) {
    const el = previous.get(piece.id) || createPieceElement(piece);
    pieceLayer.appendChild(el);
    pieceEls.set(piece.id, el);
    sizePieceElement(el, piece);
  }
}

function onPointerDown(event) {
  if (solved) return;
  const el = event.currentTarget;
  const piece = pieces.find(p => p.id === el.dataset.id);
  if (!piece) return;

  event.preventDefault();
  el.setPointerCapture(event.pointerId);
  el.classList.add("dragging");

  drag = {
    piece,
    el,
    pointerId: event.pointerId,
    startPointerX: event.clientX,
    startPointerY: event.clientY,
    segmentPointerX: event.clientX,
    segmentPointerY: event.clientY,
    segmentPieceX: piece.x,
    segmentPieceY: piece.y,
    axis: null
  };

  el.addEventListener("pointermove", onPointerMove);
  el.addEventListener("pointerup", onPointerEnd);
  el.addEventListener("pointercancel", onPointerEnd);
}

function onPointerMove(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;

  // If the mouse button was released outside the puzzle/iframe, immediately
  // stop dragging when the pointer re-enters.
  if (event.pointerType === "mouse" && event.buttons === 0) {
    endDrag();
    return;
  }

  const cell = getCellSize();
  const lockThreshold = cell * 0.18;
  const stepThreshold = cell * 0.58;

  const dx = event.clientX - drag.segmentPointerX;
  const dy = event.clientY - drag.segmentPointerY;

  // Lock each drag segment to one axis. This prevents tiny diagonal/jittery
  // mouse movements from creating extra grid moves.
  if (!drag.axis) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) < lockThreshold) return;
    drag.axis = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
  }

  const primaryDelta = drag.axis === "x" ? dx : dy;
  const secondaryDelta = drag.axis === "x" ? dy : dx;

  // If the player clearly changes direction to the other axis, start a fresh
  // segment from the piece's current position. This still allows turns during
  // one continuous drag without counting cursor noise as movement.
  if (
    Math.abs(secondaryDelta) > cell * 0.72 &&
    Math.abs(secondaryDelta) > Math.abs(primaryDelta) * 1.25
  ) {
    drag.segmentPointerX = event.clientX;
    drag.segmentPointerY = event.clientY;
    drag.segmentPieceX = drag.piece.x;
    drag.segmentPieceY = drag.piece.y;
    drag.axis = drag.axis === "x" ? "y" : "x";
    return;
  }

  if (Math.abs(primaryDelta) < stepThreshold) return;

  const dir = Math.sign(primaryDelta);
  const moved = drag.axis === "x"
    ? tryMove(drag.piece, dir, 0)
    : tryMove(drag.piece, 0, dir);

  if (moved) {
    // Re-anchor after exactly one grid step. The pointer must travel another
    // substantial fraction of a cell before another move can be counted.
    // This creates hysteresis and prevents one physical step from becoming
    // several counted moves.
    if (drag.axis === "x") {
      drag.segmentPointerX += dir * cell;
    } else {
      drag.segmentPointerY += dir * cell;
    }

    drag.segmentPieceX = drag.piece.x;
    drag.segmentPieceY = drag.piece.y;
  } else {
    // If blocked, re-anchor near the current pointer so repeated pointermove
    // events cannot repeatedly attempt/count the same blocked direction.
    drag.segmentPointerX = event.clientX;
    drag.segmentPointerY = event.clientY;
    drag.segmentPieceX = drag.piece.x;
    drag.segmentPieceY = drag.piece.y;
    drag.axis = null;
  }
}

function onPointerEnd(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  endDrag();
}

function endDrag() {
  if (!drag) return;

  const { el } = drag;
  el.classList.remove("dragging");
  el.removeEventListener("pointermove", onPointerMove);
  el.removeEventListener("pointerup", onPointerEnd);
  el.removeEventListener("pointercancel", onPointerEnd);
  drag = null;
}

function onPieceKeyDown(event) {
  if (solved) return;
  const piece = pieces.find(p => p.id === event.currentTarget.dataset.id);
  if (!piece) return;

  const map = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1]
  };
  if (map[event.key]) {
    event.preventDefault();
    tryMove(piece, ...map[event.key]);
  }
}

function startTimer() {
  startedAt = performance.now() - elapsedMs;
  if (timerFrame) cancelAnimationFrame(timerFrame);

  const tick = () => {
    if (startedAt !== null && !solved) {
      elapsedMs = performance.now() - startedAt;
      timerEl.textContent = formatTime(elapsedMs);
      timerFrame = requestAnimationFrame(tick);
    }
  };
  timerFrame = requestAnimationFrame(tick);
}

function formatTime(ms) {
  const totalTenths = Math.floor(ms / 100);
  const tenths = totalTenths % 10;
  const totalSeconds = Math.floor(totalTenths / 10);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${tenths}`;
}

function finishPuzzle() {
  solved = true;
  if (startedAt !== null) elapsedMs = performance.now() - startedAt;
  startedAt = null;
  if (timerFrame) cancelAnimationFrame(timerFrame);
  timerEl.textContent = formatTime(elapsedMs);

  finalTimeEl.textContent = formatTime(elapsedMs);
  finalMovesEl.textContent = String(moves);
  nicknameInput.value = localStorage.getItem("survivorPuzzleNickname") || "";
  scoreMessage.textContent = "";
  scoreMessage.className = "form-message";
  submitScoreBtn.disabled = false;
  scoreSubmitted = false;
  scoreSubmitting = false;

  window.setTimeout(() => {
    overlay.hidden = false;
    nicknameInput.focus({ preventScroll: true });
  }, 220);
}

function resetGame() {
  endDrag();
  pieces = cloneStart();
  moves = 0;
  elapsedMs = 0;
  startedAt = null;
  solved = false;
  scoreSubmitted = false;
  scoreSubmitting = false;
  if (timerFrame) cancelAnimationFrame(timerFrame);
  timerEl.textContent = "0:00.0";
  movesEl.textContent = "0";
  overlay.hidden = true;
  renderAll();
}

function validateNickname(raw) {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 20) {
    return { ok: false, message: "Please use a display name between 2 and 20 characters." };
  }

  if (!/^[\p{L}\p{N}_ -]+$/u.test(name)) {
    return { ok: false, message: "Please use only letters, numbers, spaces, _ or -." };
  }

  const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (blockedWords.some(word => normalized.includes(word))) {
    return { ok: false, message: "Please choose another display name." };
  }

  return { ok: true, name };
}

function firebaseIsConfigured() {
  const required = ["apiKey", "authDomain", "projectId", "appId"];
  return required.every(key => {
    const value = firebaseConfig?.[key];
    return typeof value === "string" && value.length > 4 && !value.includes("REPLACE_ME");
  });
}

async function initializeCloud() {
  if (!firebaseIsConfigured()) {
    cloud.enabled = false;
    leaderboardStatus.textContent = "Leaderboard preview on this device";
    await loadLeaderboard();
    return;
  }

  try {
    const [
      appMod,
      authMod,
      fireMod
    ] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js"),
      import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js")
    ]);

    const app = appMod.initializeApp(firebaseConfig);
    const auth = authMod.getAuth(app);
    await authMod.signInAnonymously(auth);
    const db = fireMod.getFirestore(app);

    cloud = {
      enabled: true,
      db,
      auth,
      addDoc: fireMod.addDoc,
      collection: fireMod.collection,
      getDocs: fireMod.getDocs,
      limit: fireMod.limit,
      orderBy: fireMod.orderBy,
      query: fireMod.query,
      serverTimestamp: fireMod.serverTimestamp
    };

    leaderboardStatus.textContent = "Top Survivor Geek times";
  } catch (error) {
    console.error("Firebase initialization failed:", error);
    cloud.enabled = false;
    leaderboardStatus.textContent = "Leaderboard temporarily using this device";
  }

  await loadLeaderboard();
}

function getLocalScores() {
  try {
    return JSON.parse(localStorage.getItem("survivorPuzzleScores") || "[]");
  } catch {
    return [];
  }
}

function saveLocalScore(score) {
  const scores = getLocalScores();
  scores.push(score);
  scores.sort((a, b) => (a.timeMs - b.timeMs) || (a.moves - b.moves) || ((a.createdAt || 0) - (b.createdAt || 0)));
  localStorage.setItem("survivorPuzzleScores", JSON.stringify(scores.slice(0, 100)));
}

async function submitScore(name) {
  const roundedTime = Math.max(1, Math.round(elapsedMs));

  const score = {
    game: "survivor-5-piece",
    version: 1,
    name,
    timeMs: roundedTime,
    moves,
    createdAt: Date.now()
  };

  if (!cloud.enabled) {
    saveLocalScore(score);
    return;
  }

  await cloud.addDoc(cloud.collection(cloud.db, "slidePuzzleScores"), {
    game: "survivor-5-piece",
    version: 1,
    name,
    timeMs: roundedTime,
    moves,
    createdAt: cloud.serverTimestamp()
  });
}

async function loadLeaderboard() {
  leaderboardList.replaceChildren();

  let scores = [];
  try {
    if (cloud.enabled) {
      const q = cloud.query(
        cloud.collection(cloud.db, "slidePuzzleScores"),
        cloud.orderBy("timeMs", "asc"),
        cloud.limit(60)
      );
      const snap = await cloud.getDocs(q);
      scores = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } else {
      scores = getLocalScores();
    }

    scores.sort((a, b) => (a.timeMs - b.timeMs) || (a.moves - b.moves));
    scores = scores.slice(0, 10);
  } catch (error) {
    console.error("Leaderboard load failed:", error);
    leaderboardStatus.textContent = "Could not load leaderboard";
  }

  if (!scores.length) {
    const li = document.createElement("li");
    li.className = "leaderboard-empty";
    li.textContent = "No scores yet. Be the first!";
    leaderboardList.appendChild(li);
    return;
  }

  scores.forEach((score, index) => {
    const li = document.createElement("li");
    li.className = "leaderboard-row";

    const rank = document.createElement("span");
    rank.className = "rank";
    rank.textContent = String(index + 1);

    const name = document.createElement("span");
    name.className = "name";
    name.textContent = String(score.name || "Player");

    const time = document.createElement("span");
    time.className = "time";
    time.textContent = formatTime(Number(score.timeMs) || 0);

    const moveCount = document.createElement("span");
    moveCount.className = "move-count";
    moveCount.textContent = `${Number(score.moves) || 0} mv`;

    li.append(rank, name, time, moveCount);
    leaderboardList.appendChild(li);
  });
}

async function handleScoreSubmit(event) {
  event.preventDefault();

  // Lock immediately so double-clicks, Enter key repeats, or overlapping
  // submit events cannot create duplicate leaderboard records.
  if (scoreSubmitted || scoreSubmitting) return;
  scoreSubmitting = true;
  submitScoreBtn.disabled = true;

  const result = validateNickname(nicknameInput.value);
  if (!result.ok) {
    scoreSubmitting = false;
    submitScoreBtn.disabled = false;
    scoreMessage.textContent = result.message;
    scoreMessage.className = "form-message error";
    return;
  }

  localStorage.setItem("survivorPuzzleNickname", result.name);
  scoreMessage.textContent = "Submitting…";
  scoreMessage.className = "form-message";

  try {
    await submitScore(result.name);
    scoreSubmitted = true;
    scoreSubmitting = false;
    scoreMessage.textContent = cloud.enabled
      ? "Score submitted to the Survivor Geek leaderboard!"
      : "Score saved on this device. Connect Firebase to make the leaderboard public.";
    scoreMessage.className = "form-message success";
    await loadLeaderboard();
  } catch (error) {
    console.error(error);
    scoreSubmitting = false;
    submitScoreBtn.disabled = false;
    scoreMessage.textContent = "Score submission failed. Please try again.";
    scoreMessage.className = "form-message error";
  }
}

async function shareResult() {
  const text = `I solved the Survivor 5-Piece Slide Puzzle in ${formatTime(elapsedMs)} with ${moves} moves! 🔥`;
  const clipboardText = `${text}\n\n${SHARE_URL}`;

  try {
    if (navigator.share) {
      await navigator.share({
        title: "Survivor 5-Piece Slide Puzzle",
        text,
        url: SHARE_URL
      });
    } else {
      await navigator.clipboard.writeText(clipboardText);
      shareBtn.textContent = "Copied!";
      setTimeout(() => { shareBtn.textContent = "Share Result"; }, 1500);
    }
  } catch (error) {
    if (error?.name !== "AbortError") console.error(error);
  }
}

resetBtn.addEventListener("click", resetGame);
playAgainBtn.addEventListener("click", resetGame);
shareBtn.addEventListener("click", shareResult);
closeWinBtn.addEventListener("click", () => {
  // Closing only dismisses the results. The solved board remains frozen
  // because solved stays true. Reset is required before pieces can move again.
  overlay.hidden = true;
});
scoreForm.addEventListener("submit", handleScoreSubmit);
refreshLeaderboardBtn.addEventListener("click", loadLeaderboard);

// Extra protection for releasing the mouse/finger outside the game area.
// Pointer capture normally handles this, but these fallbacks prevent a piece
// from remaining attached if the browser, iframe, or window loses the release.
window.addEventListener("pointerup", onPointerEnd);
window.addEventListener("pointercancel", onPointerEnd);
window.addEventListener("blur", endDrag);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) endDrag();
});

window.addEventListener("resize", () => {
  for (const piece of pieces) sizePieceElement(pieceEls.get(piece.id), piece);
});

pieces = cloneStart();
renderAll();
initializeCloud();
