/**
 * Small per-neuron charts for the inspector.
 *
 * Both draw to canvas rather than SVG. A 5,000 ms run at dt = 0.1 ms is 50,000
 * samples and a neuron can fire hundreds of times; as SVG that is tens of
 * thousands of DOM nodes for a strip 40 pixels tall.
 */

import { useEffect, useRef } from 'react';

import { clock } from '../store/clock';

/** Redraw on every clock tick so the playhead tracks the 3D view. */
function useCanvas(
  draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void,
  deps: unknown[],
  height: number,
) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    let frame = 0;
    const render = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = canvas.clientWidth;
      if (width === 0) {
        frame = requestAnimationFrame(render);
        return;
      }
      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);
        draw(ctx, width, height);
      }
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return ref;
}

/**
 * Membrane potential over one trial.
 *
 * The reset is instantaneous in this model, so a spike is a vertical return to
 * -52 mV rather than an action potential; the threshold line makes that
 * readable instead of mysterious.
 */
export function MembraneTrace({
  times,
  voltages,
  threshold,
  rest,
  height = 74,
}: {
  times: number[];
  voltages: number[];
  threshold: number;
  rest: number;
  height?: number;
}) {
  const ref = useCanvas(
    (ctx, w, h) => {
      if (voltages.length === 0) return;

      const pad = 2;
      const min = Math.min(rest - 1, ...voltages);
      const max = Math.max(threshold + 1, ...voltages);
      const span = Math.max(max - min, 0.5);
      const duration = times[times.length - 1] || 1;

      const x = (t: number) => (t / duration) * (w - pad * 2) + pad;
      const y = (v: number) => h - pad - ((v - min) / span) * (h - pad * 2);

      // threshold and rest references
      ctx.setLineDash([2, 3]);
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(242,99,126,0.55)';
      ctx.beginPath();
      ctx.moveTo(0, y(threshold));
      ctx.lineTo(w, y(threshold));
      ctx.stroke();
      ctx.strokeStyle = 'rgba(148,176,214,0.25)';
      ctx.beginPath();
      ctx.moveTo(0, y(rest));
      ctx.lineTo(w, y(rest));
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.strokeStyle = '#5fe3c0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < voltages.length; i++) {
        const px = x(times[i] ?? 0);
        const py = y(voltages[i]);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // playhead
      const t = clock.timeMs;
      if (clock.durationMs > 0 && t <= duration) {
        ctx.strokeStyle = 'rgba(255,209,102,0.85)';
        ctx.beginPath();
        ctx.moveTo(x(t), 0);
        ctx.lineTo(x(t), h);
        ctx.stroke();
      }

      ctx.fillStyle = 'rgba(148,176,214,0.65)';
      ctx.font = '9px "IBM Plex Mono", monospace';
      ctx.fillText(`${threshold} mV`, 3, y(threshold) - 3);
      ctx.fillText(`${rest} mV`, 3, Math.min(h - 2, y(rest) + 9));
    },
    [times, voltages, threshold, rest],
    height,
  );

  return (
    <canvas
      ref={ref}
      style={{
        width: '100%',
        height,
        display: 'block',
        background: 'rgba(0,0,0,0.3)',
        border: '1px solid var(--hairline)',
      }}
    />
  );
}

/** Spike events for one neuron on a time axis. */
export function SpikeTrainStrip({
  times,
  height = 26,
}: {
  times: number[];
  height?: number;
}) {
  const ref = useCanvas(
    (ctx, w, h) => {
      const duration = clock.durationMs || Math.max(...times, 1);
      ctx.strokeStyle = 'rgba(95,227,192,0.9)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const t of times) {
        const x = (t / duration) * (w - 2) + 1;
        ctx.moveTo(x, 3);
        ctx.lineTo(x, h - 3);
      }
      ctx.stroke();

      if (clock.durationMs > 0) {
        const x = (clock.timeMs / duration) * (w - 2) + 1;
        ctx.strokeStyle = 'rgba(255,209,102,0.9)';
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
    },
    [times],
    height,
  );

  return (
    <canvas
      ref={ref}
      style={{
        width: '100%',
        height,
        display: 'block',
        background: 'rgba(0,0,0,0.3)',
        border: '1px solid var(--hairline)',
      }}
    />
  );
}
