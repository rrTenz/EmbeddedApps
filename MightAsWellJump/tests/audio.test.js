import test from 'node:test';
import assert from 'node:assert/strict';
import { createAudioController } from '../src/audio.js';

// A minimal fake Web Audio graph — just enough surface area for
// src/audio.js's scheduling calls to succeed, with call counters and (for
// oscillator/filter nodes) the actual scheduled property values retained
// for inspection. Never touches real audio hardware/output.
function makeFakeContextFactory({ throwOnConstruct = false, throwOnCreateOscillator = false } = {}) {
  const instances = [];

  function makeGain() {
    return {
      gain: {
        setValueAtTime() {},
        linearRampToValueAtTime() {},
        exponentialRampToValueAtTime() {}
      },
      connect() {}
    };
  }
  function makeFilter(calls) {
    const node = { type: '', frequency: { value: 0 }, connect() {} };
    calls.filterNodes.push(node);
    return node;
  }
  function makeBufferSource(calls) {
    const node = { buffer: null, startTime: null, duration: null, connect() {}, start(t) { node.startTime = t; }, stop(t) { node.duration = t - node.startTime; } };
    calls.bufferSources += 1;
    calls.bufferSourceNodes.push(node);
    return node;
  }
  function makeOscillator(calls) {
    if (throwOnCreateOscillator) throw new Error('oscillator creation failed');
    const node = { type: '', frequency: { value: 0 }, startTime: null, duration: null, connect() {}, start(t) { node.startTime = t; }, stop(t) { node.duration = t - node.startTime; } };
    calls.oscillators += 1;
    calls.oscillatorNodes.push(node);
    return node;
  }

  function Ctor() {
    if (throwOnConstruct) throw new Error('AudioContext construction failed');
    const calls = { bufferSources: 0, oscillators: 0, gains: 0, filters: 0, oscillatorNodes: [], filterNodes: [], bufferSourceNodes: [] };
    const instance = {
      state: 'running',
      currentTime: 0,
      sampleRate: 44100,
      destination: {},
      resumeCalls: 0,
      resume() { instance.resumeCalls += 1; return Promise.resolve(); },
      createBuffer(channels, length, sampleRate) {
        return { getChannelData: () => new Float32Array(length), length, sampleRate };
      },
      createBufferSource: () => makeBufferSource(calls),
      createOscillator: () => makeOscillator(calls),
      createGain: () => { calls.gains += 1; return makeGain(); },
      createBiquadFilter: () => makeFilter(calls)
    };
    instance.calls = calls;
    instances.push(instance);
    return instance;
  }

  Ctor.instances = instances;
  return Ctor;
}

test('the AudioContext is not constructed until the first play call (lazy creation)', () => {
  const contextFactory = makeFakeContextFactory();
  createAudioController({ contextFactory });
  assert.equal(contextFactory.instances.length, 0);
});

test('a single AudioContext is created and reused across playTransfer and playSnap', () => {
  const contextFactory = makeFakeContextFactory();
  const audio = createAudioController({ contextFactory });
  audio.playTransfer({ color: 'yellow', direction: 'in' });
  audio.playSnap();
  assert.equal(contextFactory.instances.length, 1, 'expected exactly one AudioContext for both generated sounds');
});

test('playTransfer schedules a noise transient and a tone', () => {
  const contextFactory = makeFakeContextFactory();
  const audio = createAudioController({ contextFactory });
  audio.playTransfer({ color: 'red', direction: 'in' });
  const { calls } = contextFactory.instances[0];
  assert.equal(calls.bufferSources, 1);
  assert.equal(calls.oscillators, 1);
});

test('all five ball colors are accepted without throwing, for both directions', () => {
  const contextFactory = makeFakeContextFactory();
  const audio = createAudioController({ contextFactory });
  for (const color of ['yellow', 'orange', 'red', 'blue', 'green']) {
    for (const direction of ['in', 'out']) {
      assert.doesNotThrow(() => audio.playTransfer({ color, direction }));
    }
  }
});

function toneFreqFor(contextFactory, audio, color, direction) {
  audio.playTransfer({ color, direction });
  const nodes = contextFactory.instances[0].calls.oscillatorNodes;
  return nodes[nodes.length - 1].frequency.value;
}

test('each color maps to a distinct tone frequency (a distinct sound profile), for a fixed direction', () => {
  const contextFactory = makeFakeContextFactory();
  const audio = createAudioController({ contextFactory });
  const freqs = ['yellow', 'orange', 'red', 'blue', 'green'].map(color => toneFreqFor(contextFactory, audio, color, 'in'));
  assert.equal(new Set(freqs).size, 5, `expected 5 distinct frequencies, got ${freqs}`);
});

test('yellow is the brightest (highest tone frequency) color profile, in both directions', () => {
  const contextFactory = makeFakeContextFactory();
  const audio = createAudioController({ contextFactory });
  for (const direction of ['in', 'out']) {
    const yellow = toneFreqFor(contextFactory, audio, 'yellow', direction);
    for (const color of ['orange', 'red', 'blue', 'green']) {
      const other = toneFreqFor(contextFactory, audio, color, direction);
      assert.ok(yellow > other, `expected yellow (${yellow}) > ${color} (${other}) for direction ${direction}`);
    }
  }
});

test('green is the deepest (lowest tone frequency) color profile, in both directions', () => {
  const contextFactory = makeFakeContextFactory();
  const audio = createAudioController({ contextFactory });
  for (const direction of ['in', 'out']) {
    const green = toneFreqFor(contextFactory, audio, 'green', direction);
    for (const color of ['yellow', 'orange', 'red', 'blue']) {
      const other = toneFreqFor(contextFactory, audio, color, direction);
      assert.ok(green < other, `expected green (${green}) < ${color} (${other}) for direction ${direction}`);
    }
  }
});

test('color brightness ordering (yellow > orange > red > blue > green) holds within each direction', () => {
  const contextFactory = makeFakeContextFactory();
  const audio = createAudioController({ contextFactory });
  for (const direction of ['in', 'out']) {
    const order = ['yellow', 'orange', 'red', 'blue', 'green'].map(color => toneFreqFor(contextFactory, audio, color, direction));
    for (let i = 1; i < order.length; i++) {
      assert.ok(order[i - 1] > order[i], `expected a strictly descending brightness order, got ${order} for direction ${direction}`);
    }
  }
});

test('IN and OUT produce measurably different tone frequency and duration for the same color', () => {
  const contextFactory = makeFakeContextFactory();
  const audio = createAudioController({ contextFactory });
  audio.playTransfer({ color: 'blue', direction: 'in' });
  const inNode = contextFactory.instances[0].calls.oscillatorNodes.at(-1);
  audio.playTransfer({ color: 'blue', direction: 'out' });
  const outNode = contextFactory.instances[0].calls.oscillatorNodes.at(-1);

  assert.notEqual(inNode.frequency.value, outNode.frequency.value);
  assert.notEqual(inNode.duration, outNode.duration);
});

test('IN is tighter/brighter (higher freq, shorter duration) than OUT for the same color', () => {
  const contextFactory = makeFakeContextFactory();
  const audio = createAudioController({ contextFactory });
  audio.playTransfer({ color: 'green', direction: 'in' });
  const inNode = contextFactory.instances[0].calls.oscillatorNodes.at(-1);
  audio.playTransfer({ color: 'green', direction: 'out' });
  const outNode = contextFactory.instances[0].calls.oscillatorNodes.at(-1);

  assert.ok(inNode.frequency.value > outNode.frequency.value, 'IN should be brighter (higher pitched) than OUT');
  assert.ok(inNode.duration < outNode.duration, 'IN should be shorter/tighter than OUT');
});

test('direction never inverts color identity: blue-out still sounds higher than green-in', () => {
  const contextFactory = makeFakeContextFactory();
  const audio = createAudioController({ contextFactory });
  const blueOut = toneFreqFor(contextFactory, audio, 'blue', 'out');
  const greenIn = toneFreqFor(contextFactory, audio, 'green', 'in');
  assert.ok(blueOut > greenIn, `expected blue-out (${blueOut}) > green-in (${greenIn})`);
});

test('an unrecognized color falls back gracefully rather than throwing', () => {
  const contextFactory = makeFakeContextFactory();
  const audio = createAudioController({ contextFactory });
  assert.doesNotThrow(() => audio.playTransfer({ color: 'not-a-real-color', direction: 'in' }));
  assert.doesNotThrow(() => audio.playTransfer({}));
  assert.doesNotThrow(() => audio.playTransfer());
});

test('playSnap is unchanged: schedules one noise transient and one triangle tone at the same tuned values as before', () => {
  const contextFactory = makeFakeContextFactory();
  const audio = createAudioController({ contextFactory });
  audio.playSnap();
  const { calls } = contextFactory.instances[0];
  assert.equal(calls.bufferSources, 1);
  assert.equal(calls.oscillators, 1);
  const osc = calls.oscillatorNodes[0];
  assert.equal(osc.type, 'triangle');
  assert.equal(osc.frequency.value, 110);
  const filter = calls.filterNodes[0];
  assert.equal(filter.frequency.value, 750);
});

test('does not throw when Web Audio is entirely unavailable (no factory, no window.AudioContext)', () => {
  const audio = createAudioController({ contextFactory: null });
  assert.doesNotThrow(() => audio.playTransfer({ color: 'yellow', direction: 'in' }));
  assert.doesNotThrow(() => audio.playSnap());
});

test('does not throw when AudioContext construction itself throws', () => {
  const contextFactory = makeFakeContextFactory({ throwOnConstruct: true });
  const audio = createAudioController({ contextFactory });
  assert.doesNotThrow(() => audio.playTransfer({ color: 'yellow', direction: 'in' }));
});

test('does not throw when a node fails to schedule mid-sound (e.g. createOscillator throws)', () => {
  const contextFactory = makeFakeContextFactory({ throwOnCreateOscillator: true });
  const audio = createAudioController({ contextFactory });
  assert.doesNotThrow(() => audio.playTransfer({ color: 'yellow', direction: 'in' }));
});

test('after a construction failure, later calls do not repeatedly retry construction', () => {
  const contextFactory = makeFakeContextFactory({ throwOnConstruct: true });
  const audio = createAudioController({ contextFactory });
  audio.playTransfer({ color: 'yellow', direction: 'in' });
  audio.playSnap();
  assert.equal(contextFactory.instances.length, 0);
});

test('a suspended context is resumed on the next play call', () => {
  const contextFactory = makeFakeContextFactory();
  const audio = createAudioController({ contextFactory });
  audio.playTransfer({ color: 'yellow', direction: 'in' });
  contextFactory.instances[0].state = 'suspended';
  audio.playSnap();
  assert.ok(contextFactory.instances[0].resumeCalls >= 1);
});

// --- playWin / stopWin: cheer.mp3 via HTMLAudioElement ---

const CHEER_URL = 'https://rrtenz.github.io/EmbeddedApps/SurvivorGeekPlay/cheer.mp3';

function makeFakeAudioElementFactory({ throwOnConstruct = false, rejectPlay = false } = {}) {
  const instances = [];
  function Ctor() {
    if (throwOnConstruct) throw new Error('Audio construction failed');
    const calls = { play: 0, pause: 0 };
    const instance = {
      src: '',
      preload: 'auto',
      loop: true, // deliberately wrong defaults, so a passing test proves audio.js actually sets these
      currentTime: -1,
      play() {
        calls.play += 1;
        instance.currentTime = 0;
        return rejectPlay ? Promise.reject(new Error('NotAllowedError')) : Promise.resolve();
      },
      pause() { calls.pause += 1; }
    };
    instance.calls = calls;
    instances.push(instance);
    return instance;
  }
  Ctor.instances = instances;
  return Ctor;
}

test('playWin does not touch the Web Audio AudioContext at all', () => {
  const contextFactory = makeFakeContextFactory();
  const audioElementFactory = makeFakeAudioElementFactory();
  const audio = createAudioController({ contextFactory, audioElementFactory });
  audio.playWin();
  assert.equal(contextFactory.instances.length, 0, 'the old synthesized win effect must not run');
});

test('playWin constructs exactly one Audio element, pointed at the exact cheer.mp3 URL, not looping', () => {
  const audioElementFactory = makeFakeAudioElementFactory();
  const audio = createAudioController({ contextFactory: makeFakeContextFactory(), audioElementFactory });
  audio.playWin();
  assert.equal(audioElementFactory.instances.length, 1);
  const el = audioElementFactory.instances[0];
  assert.equal(el.src, CHEER_URL);
  assert.equal(el.loop, false);
});

test('playWin calls play() exactly once', () => {
  const audioElementFactory = makeFakeAudioElementFactory();
  const audio = createAudioController({ contextFactory: makeFakeContextFactory(), audioElementFactory });
  audio.playWin();
  assert.equal(audioElementFactory.instances[0].calls.play, 1);
});

test('the same Audio element is reused across repeated win calls (no uncontrolled duplicates)', () => {
  const audioElementFactory = makeFakeAudioElementFactory();
  const audio = createAudioController({ contextFactory: makeFakeContextFactory(), audioElementFactory });
  audio.playWin();
  audio.playWin();
  assert.equal(audioElementFactory.instances.length, 1);
});

test('does not preload the cheer audio eagerly', () => {
  const audioElementFactory = makeFakeAudioElementFactory();
  const audio = createAudioController({ contextFactory: makeFakeContextFactory(), audioElementFactory });
  audio.playWin();
  assert.equal(audioElementFactory.instances[0].preload, 'none');
});

test('the cheer is paused and reset at exactly 5 seconds, not before', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const audioElementFactory = makeFakeAudioElementFactory();
  const audio = createAudioController({ contextFactory: makeFakeContextFactory(), audioElementFactory });
  audio.playWin();
  const el = audioElementFactory.instances[0];

  t.mock.timers.tick(4999);
  assert.equal(el.calls.pause, 0, 'must not stop before 5 seconds');

  t.mock.timers.tick(1);
  assert.equal(el.calls.pause, 1);
  assert.equal(el.currentTime, 0);
});

test('stopWin() stops an in-progress cheer immediately and safely no-ops if nothing is playing', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const audioElementFactory = makeFakeAudioElementFactory();
  const audio = createAudioController({ contextFactory: makeFakeContextFactory(), audioElementFactory });

  assert.doesNotThrow(() => audio.stopWin()); // nothing has ever played yet
  audio.playWin();
  const el = audioElementFactory.instances[0];
  audio.stopWin();
  assert.equal(el.calls.pause, 1);

  // The 5s timer from the stopped playWin() must not double-fire a stop.
  t.mock.timers.tick(5000);
  assert.equal(el.calls.pause, 1);
});

test('a rejected play() promise is swallowed and never surfaces as an unhandled rejection or throw', async () => {
  const audioElementFactory = makeFakeAudioElementFactory({ rejectPlay: true });
  const audio = createAudioController({ contextFactory: makeFakeContextFactory(), audioElementFactory });
  assert.doesNotThrow(() => audio.playWin());
  // Give the rejected microtask a turn to (not) surface as unhandled.
  await new Promise(resolve => setTimeout(resolve, 0));
});

test('playWin does not throw when Audio is entirely unavailable', () => {
  const audio = createAudioController({ contextFactory: makeFakeContextFactory(), audioElementFactory: null });
  assert.doesNotThrow(() => audio.playWin());
  assert.doesNotThrow(() => audio.stopWin());
});

test('playWin does not throw when Audio construction itself throws', () => {
  const audioElementFactory = makeFakeAudioElementFactory({ throwOnConstruct: true });
  const audio = createAudioController({ contextFactory: makeFakeContextFactory(), audioElementFactory });
  assert.doesNotThrow(() => audio.playWin());
});

test('calling playWin again restarts the cheer from the beginning', () => {
  const audioElementFactory = makeFakeAudioElementFactory();
  const audio = createAudioController({ contextFactory: makeFakeContextFactory(), audioElementFactory });
  audio.playWin();
  const el = audioElementFactory.instances[0];
  el.currentTime = 3.4; // simulate cheer already partway through
  audio.playWin();
  assert.equal(el.currentTime, 0);
  assert.equal(el.calls.play, 2);
});
