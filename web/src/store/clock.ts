/**
 * Playback clock.
 *
 * Deliberately outside React. The 3D scene reads the simulation time every
 * frame, and routing that through component state would re-render the whole
 * panel tree 60 times a second for a number that only changes a label. The
 * clock is a mutable singleton the render loop advances; React subscribes at a
 * throttled rate purely to keep the readouts and the scrubber honest.
 */

export type ClockListener = (timeMs: number) => void;

class PlaybackClock {
  timeMs = 0;
  durationMs = 0;
  playing = false;
  /** Playback rate relative to real time. 1 means 1 ms of model per ms. */
  speed = 1;
  /** Milliseconds of model time per second of wall clock at speed 1. */
  readonly baseRate = 200;

  private listeners = new Set<ClockListener>();
  private lastEmit = 0;
  /** ~20 Hz is fast enough for a numeric readout and cheap for React. */
  private readonly emitIntervalMs = 50;

  subscribe(listener: ClockListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(force = false): void {
    const now = performance.now();
    if (!force && now - this.lastEmit < this.emitIntervalMs) return;
    this.lastEmit = now;
    for (const listener of this.listeners) listener(this.timeMs);
  }

  /** Advance by a wall-clock delta in seconds. Returns true if time moved. */
  tick(deltaSeconds: number): boolean {
    if (!this.playing || this.durationMs <= 0) return false;
    const next = this.timeMs + deltaSeconds * this.baseRate * this.speed;
    if (next >= this.durationMs) {
      this.timeMs = this.durationMs;
      this.playing = false;
      this.emit(true);
      return true;
    }
    this.timeMs = next;
    this.emit();
    return true;
  }

  seek(timeMs: number): void {
    this.timeMs = Math.max(0, Math.min(this.durationMs, timeMs));
    this.emit(true);
  }

  step(deltaMs: number): void {
    this.playing = false;
    this.seek(this.timeMs + deltaMs);
  }

  setDuration(durationMs: number): void {
    this.durationMs = durationMs;
    this.timeMs = 0;
    this.playing = false;
    this.emit(true);
  }

  play(): void {
    if (this.durationMs <= 0) return;
    if (this.timeMs >= this.durationMs) this.timeMs = 0;
    this.playing = true;
    this.emit(true);
  }

  pause(): void {
    this.playing = false;
    this.emit(true);
  }

  stop(): void {
    this.playing = false;
    this.timeMs = 0;
    this.emit(true);
  }

  reset(): void {
    this.timeMs = 0;
    this.durationMs = 0;
    this.playing = false;
    this.speed = 1;
    this.emit(true);
  }
}

export const clock = new PlaybackClock();

export const SPEED_STEPS = [0.25, 0.5, 1, 2, 5, 10] as const;
