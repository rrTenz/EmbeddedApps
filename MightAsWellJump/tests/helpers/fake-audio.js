// Builds a fake replacement for src/audio.js's module surface, for use with
// node:test's mock.module(). Keeps integration tests off real Web Audio and
// real media playback entirely, and lets a test assert exactly which sounds
// app.js triggered — including the actual arguments passed (ball color,
// transfer direction) — for a given real game action.
export function makeFakeAudioModule({ throwOn } = {}) {
  const calls = { playTransfer: [], playSnap: 0, playWin: 0, stopWin: 0 };

  const controller = {
    playTransfer: (...args) => {
      calls.playTransfer.push(args[0]);
      if (throwOn === 'playTransfer') throw new Error('simulated playTransfer failure');
    },
    playSnap: () => {
      calls.playSnap += 1;
      if (throwOn === 'playSnap') throw new Error('simulated playSnap failure');
    },
    playWin: () => {
      calls.playWin += 1;
      if (throwOn === 'playWin') throw new Error('simulated playWin failure');
    },
    stopWin: () => {
      calls.stopWin += 1;
    }
  };

  const namedExports = { createAudioController: () => controller };
  return { namedExports, controller, calls };
}
