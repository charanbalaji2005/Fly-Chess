/**
 * Sound.
 *
 * Every cue is synthesised with WebAudio rather than loaded from a file, so
 * the game actually makes noise without shipping a single asset -- and so
 * there is nothing to 404, decode or wait for. Each cue is a short envelope
 * over one or two oscillators, or a burst of filtered noise.
 *
 * `play` is a no-op until `unlock` has run, because browsers will not start an
 * AudioContext before a gesture. Swapping this for sampled audio later means
 * reimplementing `play` and nothing else: the rest of the game only ever calls
 * `play('capture')`.
 */

export type Cue =
  | 'button'
  | 'diceRoll'
  | 'diceSettle'
  | 'tokenStep'
  | 'tokenSelect'
  | 'capture'
  | 'finish'
  | 'turnStart'
  | 'playerJoin'
  | 'victory'
  | 'defeat'
  | 'neuralPulse'
  | 'error';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;
let volume = 0.5;

/** Shared noise buffer, built once; used by the dice and capture cues. */
let noiseBuffer: AudioBuffer | null = null;

function ensureNoise(context: AudioContext): AudioBuffer {
  if (noiseBuffer) return noiseBuffer;
  const length = Math.floor(context.sampleRate * 0.5);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buffer;
  return buffer;
}

/**
 * Start the audio context.
 *
 * Must be called from inside a user gesture handler. Safe to call repeatedly.
 */
export function unlock(): void {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume();
    return;
  }
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
  } catch {
    // Audio is a nicety; a browser that refuses it should not break the game.
    ctx = null;
  }
}

export function setEnabled(on: boolean): void {
  enabled = on;
}

export function setVolume(v: number): void {
  volume = Math.max(0, Math.min(1, v));
  if (master) master.gain.value = volume;
}

// ---------------------------------------------------------------------------
// primitives
// ---------------------------------------------------------------------------

function tone(
  freq: number,
  duration: number,
  options: {
    type?: OscillatorType;
    gain?: number;
    delay?: number;
    sweepTo?: number;
  } = {},
): void {
  if (!ctx || !master) return;
  const t0 = ctx.currentTime + (options.delay ?? 0);
  const osc = ctx.createOscillator();
  const env = ctx.createGain();

  osc.type = options.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  if (options.sweepTo !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, options.sweepTo), t0 + duration);
  }

  const peak = options.gain ?? 0.2;
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

  osc.connect(env);
  env.connect(master);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

function noise(
  duration: number,
  options: { gain?: number; delay?: number; cutoff?: number; q?: number } = {},
): void {
  if (!ctx || !master) return;
  const t0 = ctx.currentTime + (options.delay ?? 0);
  const src = ctx.createBufferSource();
  src.buffer = ensureNoise(ctx);

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = options.cutoff ?? 1800;
  filter.Q.value = options.q ?? 1.2;

  const env = ctx.createGain();
  const peak = options.gain ?? 0.15;
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(peak, t0 + 0.01);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

  src.connect(filter);
  filter.connect(env);
  env.connect(master);
  src.start(t0);
  src.stop(t0 + duration + 0.02);
}

// ---------------------------------------------------------------------------
// cues
// ---------------------------------------------------------------------------

export function play(cue: Cue): void {
  if (!enabled || !ctx) return;

  switch (cue) {
    case 'button':
      tone(880, 0.05, { type: 'triangle', gain: 0.1 });
      break;

    case 'diceRoll':
      // a die tumbling: three scattered clacks
      for (let i = 0; i < 4; i++) {
        noise(0.06, { delay: i * 0.13, gain: 0.1, cutoff: 1200 + i * 260, q: 2.4 });
      }
      break;

    case 'diceSettle':
      noise(0.09, { gain: 0.17, cutoff: 700, q: 1.6 });
      tone(180, 0.1, { type: 'sine', gain: 0.12, sweepTo: 120 });
      break;

    case 'tokenStep':
      tone(1320, 0.035, { type: 'sine', gain: 0.055 });
      break;

    case 'tokenSelect':
      tone(660, 0.07, { type: 'triangle', gain: 0.1 });
      tone(990, 0.06, { type: 'sine', gain: 0.06, delay: 0.04 });
      break;

    case 'capture':
      noise(0.16, { gain: 0.2, cutoff: 900, q: 0.9 });
      tone(320, 0.26, { type: 'sawtooth', gain: 0.14, sweepTo: 90 });
      break;

    case 'finish':
      // a small rising arpeggio as the token reaches the core
      [523, 659, 784, 1047].forEach((f, i) =>
        tone(f, 0.16, { type: 'triangle', gain: 0.11, delay: i * 0.075 }),
      );
      break;

    case 'turnStart':
      tone(520, 0.1, { type: 'sine', gain: 0.08 });
      tone(780, 0.1, { type: 'sine', gain: 0.05, delay: 0.06 });
      break;

    case 'playerJoin':
      tone(440, 0.09, { type: 'triangle', gain: 0.1 });
      tone(660, 0.1, { type: 'triangle', gain: 0.08, delay: 0.07 });
      break;

    case 'victory':
      [523, 659, 784, 1047, 1319].forEach((f, i) =>
        tone(f, 0.42, { type: 'triangle', gain: 0.13, delay: i * 0.11 }),
      );
      break;

    case 'defeat':
      [440, 392, 330, 262].forEach((f, i) =>
        tone(f, 0.34, { type: 'sine', gain: 0.1, delay: i * 0.13 }),
      );
      break;

    case 'neuralPulse':
      tone(1200, 0.3, { type: 'sine', gain: 0.055, sweepTo: 2400 });
      break;

    case 'error':
      tone(180, 0.18, { type: 'square', gain: 0.09 });
      break;
  }
}
