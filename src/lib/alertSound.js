/**
 * alertSound — shared alert tones, synthesized with the Web Audio API. No
 * audio files, no network requests, no bundled binaries: every sound is
 * generated from oscillators at play time.
 *
 * Introduced for the Kitchen board in Phase 27 and renamed in Phase 59, when
 * Staff Call alerts became a second consumer. Nothing in here was ever
 * kitchen-specific — it takes a sound type and a volume and plays once — so
 * the rename is the whole refactor: no behaviour changed, and the Kitchen
 * board calls the identical function it always did. Each caller owns its own
 * settings and decides WHEN to play; this module only decides how it sounds.
 *
 * Why synthesis instead of shipping .mp3/.wav assets:
 *   The phase explicitly rules out uploaded/custom audio. Generating the
 *   tones keeps the repo free of binary blobs, keeps the production bundle
 *   unchanged in size, and means the three choices can never fail to load.
 *
 * Autoplay policy:
 *   Browsers only allow audio after a user gesture. The kitchen user has
 *   always typed a PIN and pressed "Enter kitchen" in this tab before any
 *   alert can fire, so the gesture requirement is satisfied in practice. The
 *   AudioContext is still created lazily (on the first actual play, never at
 *   import time) and resume() is attempted before each sound, because a
 *   context can also be suspended by tab backgrounding.
 *
 * Failure is always silent:
 *   Every entry point is wrapped so a blocked, unsupported, or suspended
 *   audio stack can never throw into React's render/effect path and never
 *   spams the console. A kitchen that can't play a sound still shows every
 *   order — the sound is an enhancement, not the mechanism.
 */

export const SOUND_TYPES = ["bell", "chime", "beep"];
export const DEFAULT_SOUND_TYPE = "bell";

/* One shared context for the page. Created on first use only — constructing
   an AudioContext before a user gesture is exactly what browsers penalize. */
let audioCtx = null;

function getAudioContext() {
  try {
    if (typeof window === "undefined") return null;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    if (!audioCtx) audioCtx = new Ctor();
    return audioCtx;
  } catch {
    return null;
  }
}

function clampVolume(volume) {
  const v = Number(volume);
  if (!Number.isFinite(v)) return 0.8;
  return Math.min(1, Math.max(0, v));
}

/**
 * One decaying tone. Everything here is scheduled ahead of time on the audio
 * clock rather than driven by timers, so the sound is unaffected by React
 * re-renders or a busy main thread.
 *
 * @param {AudioContext} ctx
 * @param {number} startAt   — ctx.currentTime offset in seconds
 * @param {number} frequency — Hz
 * @param {number} duration  — seconds until silence
 * @param {number} peakGain  — 0..1 at the top of the attack
 * @param {OscillatorType} type
 */
function scheduleTone(ctx, startAt, frequency, duration, peakGain, type = "sine") {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(frequency, startAt);

  /* Fast attack, exponential decay — the shape of a struck/rung object.
     exponentialRampToValueAtTime can never reach exactly 0, hence the small
     floor value followed by an explicit stop. */
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peakGain), startAt + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(startAt);
  osc.stop(startAt + duration + 0.02);
}

/* Each voice is a small recipe of scheduled tones. Kept deliberately short
   and mid-to-high pitched so they cut through a noisy kitchen without being
   startling, and so they finish well before a 4s poll could queue another. */
const VOICES = {
  /* Struck bell — fundamental plus an inharmonic partial (the ~2.76 ratio is
     what makes a bell read as a bell rather than a flute). */
  bell(ctx, t0, vol) {
    scheduleTone(ctx, t0, 880, 1.15, 0.55 * vol, "sine");
    scheduleTone(ctx, t0, 880 * 2.76, 0.85, 0.16 * vol, "sine");
    scheduleTone(ctx, t0 + 0.16, 880, 0.9, 0.22 * vol, "sine");
  },

  /* Chime — a rising three-note figure (E5, G#5, B5). */
  chime(ctx, t0, vol) {
    scheduleTone(ctx, t0, 659.25, 0.75, 0.42 * vol, "sine");
    scheduleTone(ctx, t0 + 0.14, 830.61, 0.75, 0.42 * vol, "sine");
    scheduleTone(ctx, t0 + 0.28, 987.77, 0.95, 0.46 * vol, "sine");
  },

  /* Beep — two clipped blips, the most utilitarian of the three. */
  beep(ctx, t0, vol) {
    scheduleTone(ctx, t0, 880, 0.13, 0.4 * vol, "square");
    scheduleTone(ctx, t0 + 0.19, 880, 0.16, 0.4 * vol, "square");
  },
};

/**
 * Play one alert. Safe to call at any time: unknown sound types fall back to
 * the default, and any failure (no Web Audio, blocked autoplay, suspended
 * context) is swallowed silently.
 *
 * @param {"bell"|"chime"|"beep"} soundType
 * @param {number} volume — 0..1
 * @returns {boolean} true if playback was successfully scheduled
 */
export function playAlertSound(soundType, volume = 0.8) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return false;

    /* A context can be suspended (created before a gesture, or the tab was
       backgrounded). resume() returns a promise that rejects when the
       browser refuses — swallow it rather than letting it surface as an
       unhandled rejection in the console. */
    if (ctx.state === "suspended") {
      const resumed = ctx.resume();
      if (resumed && typeof resumed.catch === "function") resumed.catch(() => {});
    }

    const voice = VOICES[soundType] || VOICES[DEFAULT_SOUND_TYPE];
    voice(ctx, ctx.currentTime + 0.02, clampVolume(volume));
    return true;
  } catch {
    // Audio is an enhancement — never let it break the board.
    return false;
  }
}

/**
 * Release the shared AudioContext. Not used by the app today (the kitchen
 * board keeps its context for the life of the tab); exposed so a future
 * teardown/test can close it cleanly.
 */
export function disposeAlertAudio() {
  try {
    if (audioCtx && typeof audioCtx.close === "function") {
      const closed = audioCtx.close();
      if (closed && typeof closed.catch === "function") closed.catch(() => {});
    }
  } catch {
    // ignore
  } finally {
    audioCtx = null;
  }
}
