import { firebaseConfig } from './firebase-config.js';

// Same naming convention as the existing sibling leaderboard collection
// (survivor-5-piece-slide-puzzle uses `slidePuzzleScores`).
export const SCORES_COLLECTION = 'mightAsWellJumpScores';
export const GAME_ID = 'might-as-well-jump';
export const SCHEMA_VERSION = 1;
export const VALID_MODES = ['standard', 'random'];

const FIREBASE_SDK_VERSION = '10.12.2';
const INIT_TIMEOUT_MS = 8000;

export function isFirebaseConfigured(config) {
  const required = ['apiKey', 'authDomain', 'projectId', 'appId'];
  return required.every(key => {
    const value = config?.[key];
    return typeof value === 'string' && value.length > 4 && !value.includes('REPLACE_ME');
  });
}

export function createRunId() {
  if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
  return `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// Fastest time first; equal time is broken by fewer moves.
export function compareScores(a, b) {
  return (a.timeMs - b.timeMs) || (a.moves - b.moves);
}

// A player's rank is 1 + everyone strictly ahead of them: everyone faster,
// plus everyone tied on time but with fewer moves.
export function rankFromCounts(aheadByTime, tiedAheadByMoves) {
  return aheadByTime + tiedAheadByMoves + 1;
}

export function buildScoreDocument({ mode, displayName, timeMs, moves, uid, runId }) {
  return {
    game: GAME_ID,
    version: SCHEMA_VERSION,
    mode,
    displayName,
    timeMs,
    moves,
    uid,
    runId
  };
}

function isPermissionDenied(error) {
  return error?.code === 'permission-denied';
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Firebase init timed out')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// The only piece of this module that is not unit tested (it depends on a
// live network fetch of the Firebase SDK): every caller can supply its own
// `sdkLoader` instead, which is exactly what the test suite does.
export async function loadFirebaseSdk() {
  const base = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}`;
  const [appMod, authMod, fireMod] = await Promise.all([
    import(/* webpackIgnore: true */ `${base}/firebase-app.js`),
    import(/* webpackIgnore: true */ `${base}/firebase-auth.js`),
    import(/* webpackIgnore: true */ `${base}/firebase-firestore.js`)
  ]);
  return {
    initializeApp: appMod.initializeApp,
    getAuth: authMod.getAuth,
    signInAnonymously: authMod.signInAnonymously,
    getFirestore: fireMod.getFirestore,
    doc: fireMod.doc,
    setDoc: fireMod.setDoc,
    collection: fireMod.collection,
    query: fireMod.query,
    where: fireMod.where,
    orderBy: fireMod.orderBy,
    limit: fireMod.limit,
    getDocs: fireMod.getDocs,
    getCountFromServer: fireMod.getCountFromServer,
    serverTimestamp: fireMod.serverTimestamp
  };
}

// Creates a leaderboard client. Construction never throws and never blocks:
// initialization (loading the SDK, anonymous sign-in) is deferred until the
// first real call and memoized only on success, so the game stays playable
// if Firebase is slow/unavailable, and a later call can retry once it's back.
export function createLeaderboardClient({ config = firebaseConfig, sdkLoader = loadFirebaseSdk } = {}) {
  let readyState = null;

  async function computeReadyState() {
    if (!isFirebaseConfigured(config)) {
      return { enabled: false, reason: 'not-configured' };
    }
    try {
      const sdk = await withTimeout(sdkLoader(), INIT_TIMEOUT_MS);
      const app = sdk.initializeApp(config);
      const auth = sdk.getAuth(app);
      await sdk.signInAnonymously(auth);
      const db = sdk.getFirestore(app);
      const uid = auth.currentUser?.uid || null;
      return { enabled: true, db, uid, sdk };
    } catch (error) {
      return { enabled: false, reason: 'init-failed', error };
    }
  }

  async function ensureReady() {
    if (readyState) return readyState;
    const state = await computeReadyState();
    if (state.enabled) readyState = state;
    return state;
  }

  async function submitScore({ mode, displayName, timeMs, moves, runId }) {
    const state = await ensureReady();
    if (!state.enabled) return { ok: false, reason: state.reason };
    const { db, uid, sdk } = state;
    try {
      const ref = sdk.doc(db, SCORES_COLLECTION, runId);
      const data = { ...buildScoreDocument({ mode, displayName, timeMs, moves, uid, runId }), createdAt: sdk.serverTimestamp() };
      await sdk.setDoc(ref, data);
      return { ok: true };
    } catch (error) {
      if (isPermissionDenied(error)) return { ok: false, reason: 'duplicate' };
      return { ok: false, reason: 'error', error };
    }
  }

  async function fetchTop({ mode, count = 10 }) {
    const state = await ensureReady();
    if (!state.enabled) return { ok: false, reason: state.reason, scores: [] };
    const { db, sdk } = state;
    try {
      // The full ranking order (timeMs asc, then moves asc as tiebreak) must
      // be expressed in the query itself, not just applied client-side after
      // the fact: Firestore applies `limit` to its own query-ordered result
      // stream, so a query ordered by timeMs alone can truncate a group of
      // timeMs ties before a client-side moves sort ever sees the correct
      // lowest-moves member of that group.
      const q = sdk.query(
        sdk.collection(db, SCORES_COLLECTION),
        sdk.where('mode', '==', mode),
        sdk.orderBy('timeMs', 'asc'),
        sdk.orderBy('moves', 'asc'),
        sdk.limit(count)
      );
      const snap = await sdk.getDocs(q);
      // Firestore has already returned scores in the correct final order;
      // this sort is a defensive no-op (a stable sort re-affirms an
      // already-sorted sequence), kept so this function's output contract
      // doesn't silently depend on the query being right.
      const scores = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort(compareScores);
      return { ok: true, scores };
    } catch (error) {
      return { ok: false, reason: 'error', error, scores: [] };
    }
  }

  async function fetchRank({ mode, timeMs, moves }) {
    const state = await ensureReady();
    if (!state.enabled) return { ok: false, reason: state.reason };
    const { db, sdk } = state;
    try {
      const col = sdk.collection(db, SCORES_COLLECTION);
      const aheadByTimeQuery = sdk.query(col, sdk.where('mode', '==', mode), sdk.where('timeMs', '<', timeMs));
      const tiedAheadByMovesQuery = sdk.query(
        col, sdk.where('mode', '==', mode), sdk.where('timeMs', '==', timeMs), sdk.where('moves', '<', moves)
      );
      const [aheadSnap, tiedSnap] = await Promise.all([
        sdk.getCountFromServer(aheadByTimeQuery),
        sdk.getCountFromServer(tiedAheadByMovesQuery)
      ]);
      const rank = rankFromCounts(aheadSnap.data().count, tiedSnap.data().count);
      return { ok: true, rank };
    } catch (error) {
      return { ok: false, reason: 'error', error };
    }
  }

  return { submitScore, fetchTop, fetchRank };
}
