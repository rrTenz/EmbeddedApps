// Builds a fake replacement for src/leaderboard-service.js's module surface,
// for use with node:test's mock.module(). Keeps every test in this suite off
// the network and off the live Firebase project, per the "never depend on
// live Firebase" testing requirement.
export function makeFakeLeaderboardModule({ submitScore, fetchTop, fetchRank } = {}) {
  const calls = { submitScore: [], fetchTop: [], fetchRank: [] };

  const client = {
    submitScore: async params => {
      calls.submitScore.push(params);
      return submitScore ? submitScore(params, calls) : { ok: false, reason: 'not-configured' };
    },
    fetchTop: async params => {
      calls.fetchTop.push(params);
      return fetchTop ? fetchTop(params, calls) : { ok: true, scores: [] };
    },
    fetchRank: async params => {
      calls.fetchRank.push(params);
      return fetchRank ? fetchRank(params, calls) : { ok: false, reason: 'not-configured' };
    }
  };

  let runIdCounter = 0;
  const namedExports = {
    createLeaderboardClient: () => client,
    createRunId: () => `fake-run-${++runIdCounter}`
  };

  return { namedExports, client, calls };
}
