// A code-generated + one-asset sound system for Might As Well Jump:
// two short, physical-prop-flavored generated effects (ball transfer, wheel
// snap) via the Web Audio API, plus a short real-audio win cheer. Everything
// here is decorative: every play*()/stopWin() call swallows its own
// failures so a broken/missing/blocked AudioContext or Audio element can
// never interrupt gameplay.
//
// The AudioContext is created lazily, on the first actual generated-sound
// call (which — by construction, since every caller in app.js is itself an
// event handler for a real tap/click/drag-release — always happens inside a
// real user gesture). This matters for mobile Safari: constructing or
// resuming an AudioContext outside a user gesture leaves it permanently
// suspended. The cheer's Audio element is similarly created lazily, on the
// first actual win (also always inside a user-gesture-triggered call
// chain), and reused for every subsequent win in the same session.

const NOISE_BUFFER_SECONDS = 0.3;

const CHEER_URL = 'https://rrtenz.github.io/EmbeddedApps/SurvivorGeekPlay/cheer.mp3';
const CHEER_DURATION_MS = 5000;

// Base tone/filter frequencies per ball color, using the game's existing
// color values (see COLORS in game-engine.js) as keys directly — ordered
// brightest (yellow) to deepest (green), evenly spaced so adjacent colors
// are subtly but audibly distinct while all five stay in the same "wooden
// mechanism" register (this is not meant to read as a musical scale).
const COLOR_PROFILES = {
  yellow: { toneFreq: 260, filterFreq: 1900 },
  orange: { toneFreq: 230, filterFreq: 1650 },
  red: { toneFreq: 190, filterFreq: 1400 },
  blue: { toneFreq: 155, filterFreq: 1150 },
  green: { toneFreq: 120, filterFreq: 900 }
};

// Direction reshapes a color's sound without disturbing its identity: "in"
// (chute -> center) tightens/brightens into a short tock; "out" (center ->
// chute) loosens/deepens into a short thunk. The +-8-10% multipliers here
// are deliberately smaller than the ~15-20% gap between adjacent colors
// above, so e.g. blue-out never reads as lower/deeper than green-in.
const DIRECTION_PROFILES = {
  in: { freqMul: 1.08, filterMul: 1.08, toneDuration: 0.075, noiseDuration: 0.055, gain: 0.17 },
  out: { freqMul: 0.9, filterMul: 0.88, toneDuration: 0.115, noiseDuration: 0.085, gain: 0.2 }
};

export function createAudioController({ contextFactory, audioElementFactory } = {}) {
  let ctx = null;
  let unavailable = false;
  let noiseBuffer = null;

  let cheerEl = null;
  let cheerUnavailable = false;
  let cheerStopTimer = null;

  function resolveContextFactory() {
    if (contextFactory !== undefined) return contextFactory;
    if (typeof window === 'undefined') return null;
    return window.AudioContext || window.webkitAudioContext || null;
  }

  function ensureContext() {
    if (unavailable) return null;
    if (!ctx) {
      try {
        const Ctor = resolveContextFactory();
        if (!Ctor) { unavailable = true; return null; }
        ctx = new Ctor();
      } catch {
        unavailable = true;
        return null;
      }
    }
    if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      // Best-effort only: never block/await scheduling on this, and never
      // let a rejected resume() promise surface as an unhandled rejection.
      try { ctx.resume().catch(() => {}); } catch { /* ignore */ }
    }
    return ctx;
  }

  function getNoiseBuffer(context) {
    if (noiseBuffer) return noiseBuffer;
    const length = Math.max(1, Math.round(context.sampleRate * NOISE_BUFFER_SECONDS));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    noiseBuffer = buffer;
    return noiseBuffer;
  }

  // A short filtered-noise "contact" transient. This texture is what keeps
  // a hit from reading as a bright digital beep — a pure oscillator alone
  // sounds electronic; noise through a dulling lowpass filter sounds like
  // an actual physical contact (wood, plastic, metal catch).
  function scheduleNoiseHit(context, { startTime, duration, filterFreq, gain }) {
    const source = context.createBufferSource();
    source.buffer = getNoiseBuffer(context);
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const env = context.createGain();
    env.gain.setValueAtTime(0, startTime);
    env.gain.linearRampToValueAtTime(gain, startTime + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    source.connect(filter);
    filter.connect(env);
    env.connect(context.destination);
    source.start(startTime);
    source.stop(startTime + duration + 0.02);
  }

  // A short pitched "body" tone underneath the noise transient, fast attack
  // and fast exponential decay, so it reads as a mallet/wood thump rather
  // than a sustained musical note.
  function scheduleTone(context, { startTime, duration, freq, type = 'sine', gain }) {
    const osc = context.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const env = context.createGain();
    env.gain.setValueAtTime(0, startTime);
    env.gain.linearRampToValueAtTime(gain, startTime + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    osc.connect(env);
    env.connect(context.destination);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
  }

  function safely(fn) {
    try { fn(); } catch { /* decorative only: never let a scheduling failure reach the caller */ }
  }

  // Ball transfer: a short, subtle wooden "tock"/"thunk" whose pitch/filter
  // depend on the moved ball's color, and whose duration/brightness depend
  // on transfer direction — evoking a ball dropping into/out of a physical
  // Survivor challenge mechanism. Tuning knobs live in COLOR_PROFILES and
  // DIRECTION_PROFILES above.
  function playTransfer({ color, direction } = {}) {
    safely(() => {
      const context = ensureContext();
      if (!context) return;
      const colorProfile = COLOR_PROFILES[color] || COLOR_PROFILES.red;
      const dirProfile = DIRECTION_PROFILES[direction] || DIRECTION_PROFILES.in;
      const t = context.currentTime;
      scheduleNoiseHit(context, {
        startTime: t,
        duration: dirProfile.noiseDuration,
        filterFreq: colorProfile.filterFreq * dirProfile.filterMul,
        gain: dirProfile.gain * 0.85
      });
      scheduleTone(context, {
        startTime: t,
        duration: dirProfile.toneDuration,
        freq: colorProfile.toneFreq * dirProfile.freqMul,
        type: 'sine',
        gain: dirProfile.gain
      });
    });
  }

  // Wheel snap: unchanged from the original design — a deeper, slightly
  // heavier mechanical clunk than the transfer sound (lower pitch, duller
  // filter cutoff, marginally longer decay). Deliberately not parameterized
  // by anything; it plays the same regardless of which stop or direction.
  function playSnap() {
    safely(() => {
      const context = ensureContext();
      if (!context) return;
      const t = context.currentTime;
      scheduleNoiseHit(context, { startTime: t, duration: 0.09, filterFreq: 750, gain: 0.2 });
      scheduleTone(context, { startTime: t, duration: 0.13, freq: 110, type: 'triangle', gain: 0.22 });
    });
  }

  function resolveAudioElementFactory() {
    if (audioElementFactory !== undefined) return audioElementFactory;
    if (typeof window === 'undefined') return null;
    return window.Audio || null;
  }

  function ensureCheerElement() {
    if (cheerUnavailable) return null;
    if (cheerEl) return cheerEl;
    try {
      const Ctor = resolveAudioElementFactory();
      if (!Ctor) { cheerUnavailable = true; return null; }
      cheerEl = new Ctor();
      // 'none' + lazy construction together mean nothing is fetched until
      // the moment a player actually wins.
      cheerEl.preload = 'none';
      cheerEl.loop = false;
      cheerEl.src = CHEER_URL;
    } catch {
      cheerUnavailable = true;
      return null;
    }
    return cheerEl;
  }

  function clearCheerTimer() {
    if (cheerStopTimer !== null) {
      clearTimeout(cheerStopTimer);
      cheerStopTimer = null;
    }
  }

  // Stops an in-progress cheer immediately (used both by the 5-second
  // cutoff and by app.js when a new game starts while one might still be
  // playing). A safe no-op if nothing has ever played.
  function stopWin() {
    safely(() => {
      clearCheerTimer();
      if (!cheerEl) return;
      try { cheerEl.pause(); } catch { /* ignore */ }
      try { cheerEl.currentTime = 0; } catch { /* ignore */ }
    });
  }

  // Win: plays the first 5 seconds of the real cheer.mp3 asset once, then
  // stops and resets it. Replaces the old synthesized win sting entirely —
  // this never touches the AudioContext used by playTransfer/playSnap.
  function playWin() {
    safely(() => {
      const el = ensureCheerElement();
      if (!el) return;
      clearCheerTimer();
      // Some browsers can reject a seek before metadata has loaded (a real
      // quirk of preload:'none'); that must not prevent play() from firing.
      try { el.currentTime = 0; } catch { /* ignore */ }
      const playResult = el.play();
      if (playResult && typeof playResult.catch === 'function') playResult.catch(() => {});
      cheerStopTimer = setTimeout(stopWin, CHEER_DURATION_MS);
    });
  }

  return { playTransfer, playSnap, playWin, stopWin };
}
