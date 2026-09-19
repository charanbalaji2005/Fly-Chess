/**
 * Transport controls and the scrubber.
 *
 * The scrubber's gutter shows the population spike histogram, so the shape of
 * the run is visible before you play it and you can scrub straight to the
 * burst. Time is read from the clock singleton at ~20 Hz rather than from
 * component state, so dragging does not re-render the panel tree.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { populationRateSeries } from '../data/activity';
import { SPEED_STEPS, clock } from '../store/clock';
import { useStore } from '../store/useStore';
import { fmt } from './ui/primitives';

export function Timeline() {
  const spikeIndex = useStore((s) => s.spikeIndex);
  const summary = useStore((s) => s.summary);
  const reducedMotion = useStore((s) => s.reducedMotion);

  const [timeMs, setTimeMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => clock.subscribe(setTimeMs), []);
  useEffect(() => {
    const handle = setInterval(() => setPlaying(clock.playing), 120);
    return () => clearInterval(handle);
  }, []);

  const duration = summary?.durationMs ?? 0;
  const hasRun = duration > 0 && Boolean(spikeIndex);

  const seekFromPointer = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track || duration <= 0) return;
      const rect = track.getBoundingClientRect();
      const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      clock.seek(fraction * duration);
    },
    [duration],
  );

  // Keyboard transport. Space is the universal play/pause and arrows step.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (!hasRun) return;

      if (event.code === 'Space') {
        event.preventDefault();
        clock.playing ? clock.pause() : clock.play();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        clock.step(event.shiftKey ? 50 : 5);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        clock.step(event.shiftKey ? -50 : -5);
      } else if (event.key === 'Home') {
        clock.stop();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hasRun]);

  const histogram = useRef<Float32Array | null>(null);
  if (spikeIndex && histogram.current?.length !== spikeIndex.binCount) {
    histogram.current = populationRateSeries(spikeIndex);
  }

  const fraction = duration > 0 ? timeMs / duration : 0;

  return (
    <div className="flex items-center gap-3 px-3 shrink-0" style={{ height: 42 }}>
      <div className="flex items-center gap-px shrink-0">
        <TransportButton label="⏮" title="Restart (Home)" onClick={() => clock.stop()} disabled={!hasRun} />
        <TransportButton
          label="◀❘"
          title="Step back 5 ms (Left arrow)"
          onClick={() => clock.step(-5)}
          disabled={!hasRun}
        />
        <TransportButton
          label={playing ? '❘❘' : '▶'}
          title={playing ? 'Pause (Space)' : 'Play (Space)'}
          onClick={() => (clock.playing ? clock.pause() : clock.play())}
          disabled={!hasRun}
          primary
        />
        <TransportButton
          label="❘▶"
          title="Step forward 5 ms (Right arrow)"
          onClick={() => clock.step(5)}
          disabled={!hasRun}
        />
      </div>

      <div
        className="num shrink-0"
        style={{ fontSize: 12, color: hasRun ? 'var(--ink)' : 'var(--ink-faint)', width: 104 }}
      >
        {fmt(timeMs, 1)}
        <span style={{ color: 'var(--ink-faint)' }}> / {duration || 0} ms</span>
      </div>

      {/* scrubber -------------------------------------------------------- */}
      <div
        ref={trackRef}
        role="slider"
        tabIndex={hasRun ? 0 : -1}
        aria-label="Simulation time"
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={timeMs}
        aria-valuetext={`${timeMs.toFixed(1)} of ${duration} milliseconds`}
        className="relative flex-1"
        style={{
          height: 22,
          background: 'rgba(0,0,0,0.35)',
          border: '1px solid var(--hairline)',
          cursor: hasRun ? 'pointer' : 'default',
        }}
        onPointerDown={(e) => {
          if (!hasRun) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          clock.pause();
          seekFromPointer(e.clientX);
        }}
        onPointerMove={(e) => {
          if (!hasRun || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
          seekFromPointer(e.clientX);
        }}
      >
        {/* population histogram in the gutter */}
        {histogram.current && spikeIndex && (
          <svg
            className="absolute inset-0 w-full h-full"
            preserveAspectRatio="none"
            viewBox={`0 0 ${spikeIndex.binCount} 100`}
            aria-hidden
          >
            <polyline
              points={Array.from(histogram.current)
                .map((v, i) => `${i},${100 - (v / Math.max(spikeIndex.peakPopulationRateHz, 1)) * 96}`)
                .join(' ')}
              fill="none"
              stroke="rgba(95,227,192,0.55)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}

        <div
          className="absolute top-0 bottom-0 pointer-events-none"
          style={{ left: 0, width: `${fraction * 100}%`, background: 'rgba(125,211,252,0.10)' }}
        />
        <div
          className="absolute top-0 bottom-0 pointer-events-none"
          style={{
            left: `${fraction * 100}%`,
            width: 1,
            background: 'var(--selection)',
            boxShadow: '0 0 6px rgba(255,209,102,0.7)',
          }}
        />
        {!hasRun && (
          <span
            className="num absolute inset-0 grid place-items-center pointer-events-none"
            style={{ fontSize: 10, color: 'var(--ink-faint)' }}
          >
            run a simulation to populate the timeline
          </span>
        )}
      </div>

      {/* speed ----------------------------------------------------------- */}
      <div className="flex items-center gap-px shrink-0">
        {SPEED_STEPS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              clock.speed = s;
              setSpeed(s);
            }}
            className="num"
            style={{
              background: speed === s ? 'rgba(125,211,252,0.16)' : 'transparent',
              border: `1px solid ${speed === s ? 'var(--focus)' : 'var(--hairline)'}`,
              color: speed === s ? 'var(--focus)' : 'var(--ink-faint)',
              padding: '3px 5px',
              fontSize: 9,
              cursor: 'pointer',
            }}
          >
            {s}&times;
          </button>
        ))}
      </div>

      {reducedMotion && (
        <span
          className="num shrink-0 hidden lg:inline"
          style={{ fontSize: 9, color: 'var(--ink-faint)' }}
          title="Your system requests reduced motion, so playback does not autostart and pulses are not animated."
        >
          reduced motion
        </span>
      )}
    </div>
  );
}

function TransportButton({
  label,
  title,
  onClick,
  disabled,
  primary,
}: {
  label: string;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className="num"
      style={{
        width: 28,
        height: 24,
        background: primary ? 'rgba(53,208,192,0.14)' : 'transparent',
        border: `1px solid ${primary ? 'rgba(53,208,192,0.45)' : 'var(--hairline)'}`,
        color: primary ? 'var(--measured)' : 'var(--ink-dim)',
        fontSize: 10,
        opacity: disabled ? 0.35 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {label}
    </button>
  );
}
