import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SCORES_COLLECTION,
  isFirebaseConfigured,
  createRunId,
  compareScores,
  rankFromCounts,
  buildScoreDocument,
  createLeaderboardClient
} from '../src/leaderboard-service.js';

test('SCORES_COLLECTION follows the existing slidePuzzleScores naming convention', () => {
  assert.equal(SCORES_COLLECTION, 'mightAsWellJumpScores');
});

test('isFirebaseConfigured is true for a complete config', () => {
  assert.equal(isFirebaseConfigured(validConfig), true);
});

test('isFirebaseConfigured is false for missing or placeholder values', () => {
  assert.equal(isFirebaseConfigured({}), false);
  assert.equal(isFirebaseConfigured({ apiKey: 'REPLACE_ME', authDomain: 'x', projectId: 'x', appId: 'x' }), false);
  assert.equal(isFirebaseConfigured(null), false);
});

test('createRunId returns a unique string each call', () => {
  const a = createRunId();
  const b = createRunId();
  assert.equal(typeof a, 'string');
  assert.ok(a.length > 0);
  assert.notEqual(a, b);
});

test('compareScores ranks the lower time first', () => {
  const results = [{ timeMs: 5000, moves: 10 }, { timeMs: 3000, moves: 20 }].sort(compareScores);
  assert.equal(results[0].timeMs, 3000);
});

test('compareScores breaks an equal-time tie with fewer moves', () => {
  const results = [{ timeMs: 5000, moves: 10 }, { timeMs: 5000, moves: 4 }].sort(compareScores);
  assert.equal(results[0].moves, 4);
});

test('rankFromCounts is 1-indexed: no one ahead means rank 1', () => {
  assert.equal(rankFromCounts(0, 0), 1);
});

test('rankFromCounts sums strictly-faster and tied-but-fewer-moves ahead counts', () => {
  assert.equal(rankFromCounts(26, 3), 30);
});

test('buildScoreDocument produces the exact field shape, excluding createdAt', () => {
  const doc = buildScoreDocument({
    mode: 'standard', displayName: 'Ryan T', timeMs: 103000, moves: 68, uid: 'uid-1', runId: 'run-1'
  });
  assert.deepEqual(doc, {
    game: 'might-as-well-jump',
    version: 1,
    mode: 'standard',
    displayName: 'Ryan T',
    timeMs: 103000,
    moves: 68,
    uid: 'uid-1',
    runId: 'run-1'
  });
});

// --- createLeaderboardClient: orchestration against a fake SDK, never a live Firebase project ---

function makeFakeSdk({ failInit = false, failGetDocs = false, failCount = false } = {}) {
  const store = new Map(); // path -> data, simulates Firestore + its "no update" rule server-side
  const calls = { setDoc: [], query: [], getCountFromServer: [] };

  const collection = (db, name) => ({ __type: 'collection', name });
  const doc = (db, name, id) => ({ __type: 'doc', path: `${name}/${id}` });
  const where = (field, op, value) => ({ __type: 'where', field, op, value });
  const orderBy = (field, dir) => ({ __type: 'orderBy', field, dir });
  const limit = n => ({ __type: 'limit', n });
  const query = (col, ...clauses) => {
    calls.query.push(clauses);
    return { __type: 'query', col, clauses };
  };

  const setDoc = async (ref, data) => {
    calls.setDoc.push({ path: ref.path, data });
    if (store.has(ref.path)) {
      const err = new Error('duplicate');
      err.code = 'permission-denied';
      throw err;
    }
    store.set(ref.path, data);
  };

  // Faithfully simulates real Firestore query execution order: filter, then
  // sort by every orderBy clause (in the order given), then limit. This is
  // load-bearing for the boundary-tie regression test below — a fake that
  // ignores orderBy (as an earlier version of this fake did) can't expose
  // the exact bug class it's meant to catch: Firestore truncating a tied
  // group *before* a secondary sort key is applied.
  const getDocs = async q => {
    if (failGetDocs) throw new Error('network down');
    const whereClauses = q.clauses.filter(c => c.__type === 'where');
    const orderByClauses = q.clauses.filter(c => c.__type === 'orderBy');
    const limitClause = q.clauses.find(c => c.__type === 'limit');

    let entries = [...store.entries()].filter(([, data]) => whereClauses.every(w => {
      if (w.op === '==') return data[w.field] === w.value;
      if (w.op === '<') return data[w.field] < w.value;
      if (w.op === '<=') return data[w.field] <= w.value;
      if (w.op === '>') return data[w.field] > w.value;
      if (w.op === '>=') return data[w.field] >= w.value;
      return true;
    }));

    // Array.prototype.sort is stable (guaranteed since ES2019), so applying
    // one comparator per orderBy clause, least-significant first, correctly
    // implements Firestore's multi-field ordering semantics.
    for (const ob of [...orderByClauses].reverse()) {
      const dir = ob.dir === 'desc' ? -1 : 1;
      entries.sort(([, a], [, b]) => {
        if (a[ob.field] < b[ob.field]) return -1 * dir;
        if (a[ob.field] > b[ob.field]) return 1 * dir;
        return 0;
      });
    }

    let docs = entries.map(([path, data]) => ({ id: path.split('/')[1], data: () => data }));
    if (limitClause) docs = docs.slice(0, limitClause.n);
    return { docs };
  };

  const getCountFromServer = async q => {
    calls.getCountFromServer.push(q);
    if (failCount) throw new Error('network down');
    const modeClause = q.clauses.find(c => c.field === 'mode');
    const timeLtClause = q.clauses.find(c => c.field === 'timeMs' && c.op === '<');
    const timeEqClause = q.clauses.find(c => c.field === 'timeMs' && c.op === '==');
    const movesLtClause = q.clauses.find(c => c.field === 'moves' && c.op === '<');
    const count = [...store.values()].filter(data => {
      if (modeClause && data.mode !== modeClause.value) return false;
      if (timeLtClause && !(data.timeMs < timeLtClause.value)) return false;
      if (timeEqClause && !(data.timeMs === timeEqClause.value)) return false;
      if (movesLtClause && !(data.moves < movesLtClause.value)) return false;
      return true;
    }).length;
    return { data: () => ({ count }) };
  };

  const sdk = {
    initializeApp: () => ({}),
    getAuth: () => ({ currentUser: { uid: 'test-uid' } }),
    signInAnonymously: async () => {
      if (failInit) throw new Error('auth failed');
    },
    getFirestore: () => ({}),
    doc, setDoc, collection, query, where, orderBy, limit, getDocs, getCountFromServer,
    serverTimestamp: () => '__SERVER_TIMESTAMP__'
  };

  return { sdk, store, calls };
}

const validConfig = {
  apiKey: 'AIzaSyB0oI6wLRxZitXjd871fCzrOJxJdchF-Ec',
  authDomain: 'survivor-geek-apps.firebaseapp.com',
  projectId: 'survivor-geek-apps',
  appId: '1:344266409568:web:b6439700b337982bfa2505'
};

test('an unconfigured client reports not-configured without crashing, for every method', async () => {
  const client = createLeaderboardClient({ config: {}, sdkLoader: async () => { throw new Error('should not be called'); } });
  const submit = await client.submitScore({ mode: 'standard', displayName: 'A', timeMs: 1000, moves: 5, runId: 'r1' });
  const top = await client.fetchTop({ mode: 'standard' });
  const rank = await client.fetchRank({ mode: 'standard', timeMs: 1000, moves: 5 });
  assert.equal(submit.ok, false);
  assert.equal(submit.reason, 'not-configured');
  assert.equal(top.ok, false);
  assert.deepEqual(top.scores, []);
  assert.equal(rank.ok, false);
});

test('submitScore writes the score keyed by runId with a server timestamp', async () => {
  const { sdk, calls } = makeFakeSdk();
  const client = createLeaderboardClient({ config: validConfig, sdkLoader: async () => sdk });
  const result = await client.submitScore({ mode: 'standard', displayName: 'Ryan T', timeMs: 103000, moves: 68, runId: 'run-abc' });
  assert.equal(result.ok, true);
  assert.equal(calls.setDoc.length, 1);
  assert.equal(calls.setDoc[0].path, `${SCORES_COLLECTION}/run-abc`);
  assert.equal(calls.setDoc[0].data.createdAt, '__SERVER_TIMESTAMP__');
  assert.equal(calls.setDoc[0].data.mode, 'standard');
  assert.equal(calls.setDoc[0].data.uid, 'test-uid');
});

test('submitting the same runId twice is rejected as a duplicate, not a crash or a second row', async () => {
  const { sdk, calls } = makeFakeSdk();
  const client = createLeaderboardClient({ config: validConfig, sdkLoader: async () => sdk });
  const first = await client.submitScore({ mode: 'standard', displayName: 'Ryan T', timeMs: 103000, moves: 68, runId: 'same-run' });
  const second = await client.submitScore({ mode: 'standard', displayName: 'Ryan T', timeMs: 103000, moves: 68, runId: 'same-run' });
  assert.equal(first.ok, true);
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'duplicate');
  assert.equal(calls.setDoc.length, 2, 'both attempts reach the store, but only one is retained');
});

test('a different runId for the same player is a legitimate second score, not blocked', async () => {
  const { sdk, store } = makeFakeSdk();
  const client = createLeaderboardClient({ config: validConfig, sdkLoader: async () => sdk });
  const first = await client.submitScore({ mode: 'standard', displayName: 'Ryan T', timeMs: 103000, moves: 68, runId: 'run-1' });
  const second = await client.submitScore({ mode: 'standard', displayName: 'Ryan T', timeMs: 90000, moves: 50, runId: 'run-2' });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(store.size, 2);
});

test('fetchTop filters by mode and returns scores sorted time-then-moves', async () => {
  const { sdk } = makeFakeSdk();
  const client = createLeaderboardClient({ config: validConfig, sdkLoader: async () => sdk });
  await client.submitScore({ mode: 'standard', displayName: 'A', timeMs: 5000, moves: 10, runId: 'r1' });
  await client.submitScore({ mode: 'random', displayName: 'B', timeMs: 1000, moves: 1, runId: 'r2' });
  await client.submitScore({ mode: 'standard', displayName: 'C', timeMs: 3000, moves: 20, runId: 'r3' });

  const top = await client.fetchTop({ mode: 'standard' });
  assert.equal(top.ok, true);
  assert.deepEqual(top.scores.map(s => s.displayName), ['C', 'A']);
});

test('fetchTop applies the moves tiebreak in the Firestore query itself, not only after truncation', async () => {
  const { sdk } = makeFakeSdk();
  const client = createLeaderboardClient({ config: validConfig, sdkLoader: async () => sdk });
  // Four players tied on the exact same timeMs, inserted worst-case (not
  // already moves-ascending), with a limit of 3 that cuts the tied group.
  // If moves were only sorted client-side *after* Firestore already
  // truncated to `count`, the true lowest-moves entry (10) could be the one
  // Firestore drops, and the visible Top 3 would wrongly show 40/30/20.
  await client.submitScore({ mode: 'standard', displayName: 'W', timeMs: 5000, moves: 40, runId: 'w' });
  await client.submitScore({ mode: 'standard', displayName: 'X', timeMs: 5000, moves: 30, runId: 'x' });
  await client.submitScore({ mode: 'standard', displayName: 'Y', timeMs: 5000, moves: 20, runId: 'y' });
  await client.submitScore({ mode: 'standard', displayName: 'Z', timeMs: 5000, moves: 10, runId: 'z' });

  const top = await client.fetchTop({ mode: 'standard', count: 3 });
  assert.equal(top.ok, true);
  assert.deepEqual(top.scores.map(s => s.moves), [10, 20, 30], 'the 3 lowest-moves ties must survive truncation, not an arbitrary 3');
});

test('fetchTop queries Firestore ordered by mode ==, then timeMs asc, then moves asc', async () => {
  const { sdk, calls } = makeFakeSdk();
  const client = createLeaderboardClient({ config: validConfig, sdkLoader: async () => sdk });
  await client.fetchTop({ mode: 'random', count: 10 });

  const clauses = calls.query.at(-1);
  assert.deepEqual(clauses.map(c => c.__type), ['where', 'orderBy', 'orderBy', 'limit']);
  assert.deepEqual(clauses[0], { __type: 'where', field: 'mode', op: '==', value: 'random' });
  assert.deepEqual(clauses[1], { __type: 'orderBy', field: 'timeMs', dir: 'asc' });
  assert.deepEqual(clauses[2], { __type: 'orderBy', field: 'moves', dir: 'asc' });
  assert.deepEqual(clauses[3], { __type: 'limit', n: 10 });
});

test('fetchTop reports a friendly error result on read failure, without throwing', async () => {
  const { sdk } = makeFakeSdk({ failGetDocs: true });
  const client = createLeaderboardClient({ config: validConfig, sdkLoader: async () => sdk });
  const top = await client.fetchTop({ mode: 'standard' });
  assert.equal(top.ok, false);
  assert.deepEqual(top.scores, []);
});

test('fetchRank computes rank as strictly-faster-count + tied-fewer-moves-count + 1', async () => {
  const { sdk } = makeFakeSdk();
  const client = createLeaderboardClient({ config: validConfig, sdkLoader: async () => sdk });
  await client.submitScore({ mode: 'standard', displayName: 'A', timeMs: 1000, moves: 10, runId: 'r1' });
  await client.submitScore({ mode: 'standard', displayName: 'B', timeMs: 2000, moves: 5, runId: 'r2' });
  await client.submitScore({ mode: 'standard', displayName: 'C', timeMs: 2000, moves: 15, runId: 'r3' });
  await client.submitScore({ mode: 'random', displayName: 'D', timeMs: 500, moves: 1, runId: 'r4' });

  // My run: time 2000, moves 10 -> ahead of me by time: {A}=1; tied at 2000 with fewer moves: {B}=1 -> rank 3
  const rank = await client.fetchRank({ mode: 'standard', timeMs: 2000, moves: 10 });
  assert.equal(rank.ok, true);
  assert.equal(rank.rank, 3);
});

test('sdk load/init failure disables the client without throwing, and does not corrupt gameplay-facing calls', async () => {
  const client = createLeaderboardClient({ config: validConfig, sdkLoader: async () => { throw new Error('offline'); } });
  const submit = await client.submitScore({ mode: 'standard', displayName: 'A', timeMs: 1000, moves: 5, runId: 'r1' });
  const top = await client.fetchTop({ mode: 'standard' });
  assert.equal(submit.ok, false);
  assert.equal(top.ok, false);
  assert.deepEqual(top.scores, []);
});

test('a failed init is retried on the next call once the loader starts succeeding', async () => {
  let attempt = 0;
  const { sdk } = makeFakeSdk();
  const client = createLeaderboardClient({
    config: validConfig,
    sdkLoader: async () => {
      attempt += 1;
      if (attempt === 1) throw new Error('offline');
      return sdk;
    }
  });
  const first = await client.fetchTop({ mode: 'standard' });
  const second = await client.fetchTop({ mode: 'standard' });
  assert.equal(first.ok, false);
  assert.equal(second.ok, true);
});
