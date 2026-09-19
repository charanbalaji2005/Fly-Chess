/**
 * Spike raster, firing-rate plot and activity heatmap.
 *
 * All three draw to canvas. A raster of 300,000 spikes is 300,000 marks; as
 * SVG or DOM that is unusable, while as canvas it is one pass over a typed
 * array. Each is synchronised to the same clock as the 3D view, so the
 * playhead means the same thing everywhere.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  BIN_MS,
  activityMatrix,
  populationRateSeries,
  subsetRateSeries,
} from '../data/activity';
import { clock } from '../store/clock';
import { useStore, type RateScope } from '../store/useStore';
import { Legend } from './Legend';
import { Timeline } from './Timeline';
import { SegmentedControl, fmt, fmtCompact, fmtInt } from './ui/primitives';

type Tab = 'raster' | 'rate' | 'heatmap' | 'legend';

export function BottomDock() {
  const [tab, setTab] = useState<Tab>('raster');
  const spikeIndex = useStore((s) => s.spikeIndex);

  return (
    <div className="flex flex-col h-full" style={{ background: 'rgba(8,12,18,0.82)' }}>
      <div className="hair-b">
        <Timeline />
      </div>

      <div className="flex items-center gap-3 px-3 py-[6px] hair-b shrink-0">
        <div style={{ width: 330 }}>
          <SegmentedControl
            options={[
              { value: 'raster', label: 'Spike raster' },
              { value: 'rate', label: 'Firing rate' },
              { value: 'heatmap', label: 'Heatmap' },
              { value: 'legend', label: 'Legend' },
            ]}
            value={tab}
            onChange={setTab}
          />
        </div>
        {spikeIndex && (
          <span className="num" style={{ fontSize: 9.5, color: 'var(--ink-faint)' }}>
            {fmtCompact(spikeIndex.spikes.count)} spikes &middot;{' '}
            {fmtInt(spikeIndex.activeNeurons.length)} active neurons &middot;{' '}
            {fmtInt(spikeIndex.durationMs)} ms &middot; {spikeIndex.trials} trial
            {spikeIndex.trials > 1 ? 's' : ''}
          </span>
        )}
      </div>

      <div className="flex-1 min-h-0 relative">
        {!spikeIndex && tab !== 'legend' && (
          <div className="absolute inset-0 grid place-items-center">
            <span className="num" style={{ fontSize: 11, color: 'var(--ink-faint)' }}>
              No spike data. Run a simulation to populate this view.
            </span>
          </div>
        )}
        {spikeIndex && tab === 'raster' && <SpikeRaster />}
        {spikeIndex && tab === 'rate' && <FiringRateChart />}
        {spikeIndex && tab === 'heatmap' && <ActivityHeatmap />}
        {tab === 'legend' && <Legend />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// raster
// ---------------------------------------------------------------------------

const GUTTER = 44;

/**
 * Spike raster with zoom, pan, hover and click-to-select.
 *
 * Rows are neurons ordered by total spike count, so the drivers of the run sit
 * at the top instead of being scattered by index. Clicking a row selects that
 * neuron in the 3D view.
 */
function SpikeRaster() {
  const spikeIndex = useStore((s) => s.spikeIndex)!;
  const selectNeuron = useStore((s) => s.selectNeuron);
  const selected = useStore((s) => s.selectedNeuron);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [view, setView] = useState({ t0: 0, t1: spikeIndex.durationMs });
  const [hover, setHover] = useState<{ x: number; y: number; neuron: number; t: number } | null>(
    null,
  );

  useEffect(() => {
    setView({ t0: 0, t1: spikeIndex.durationMs });
  }, [spikeIndex]);

  // Row index per neuron, so a spike can be placed without a search.
  const rowOf = useMemo(() => {
    const map = new Int32Array(spikeIndex.neuronCount).fill(-1);
    spikeIndex.activeNeurons.forEach((n, r) => {
      map[n] = r;
    });
    return map;
  }, [spikeIndex]);

  const rows = spikeIndex.activeNeurons.length;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let frame = 0;

    const render = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w === 0 || h === 0) {
        frame = requestAnimationFrame(render);
        return;
      }
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const plotW = w - GUTTER - 6;
      const plotH = h - 20;
      const span = Math.max(view.t1 - view.t0, 0.1);
      const rowH = plotH / Math.max(rows, 1);

      // axes
      ctx.strokeStyle = 'rgba(148,176,214,0.16)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(GUTTER, 0);
      ctx.lineTo(GUTTER, plotH);
      ctx.lineTo(GUTTER + plotW, plotH);
      ctx.stroke();

      ctx.font = '9px "IBM Plex Mono", monospace';
      ctx.fillStyle = 'rgba(148,176,214,0.6)';
      const ticks = 6;
      for (let i = 0; i <= ticks; i++) {
        const t = view.t0 + (span * i) / ticks;
        const x = GUTTER + (i / ticks) * plotW;
        ctx.fillText(`${t.toFixed(t < 10 ? 1 : 0)}`, x - 8, plotH + 12);
        ctx.strokeStyle = 'rgba(148,176,214,0.07)';
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, plotH);
        ctx.stroke();
      }
      ctx.fillText('ms', GUTTER + plotW - 12, plotH + 12);
      ctx.save();
      ctx.translate(11, plotH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(`neuron (${rows} active, by rate)`, -46, 0);
      ctx.restore();

      // spikes
      const { spikes } = spikeIndex;
      const markH = Math.max(1, Math.min(rowH * 0.85, 3));
      ctx.fillStyle = 'rgba(95,227,192,0.85)';

      for (let i = 0; i < spikes.count; i++) {
        const t = spikes.timeMs[i];
        if (t < view.t0 || t > view.t1) continue;
        const row = rowOf[spikes.neuronIndex[i]];
        if (row < 0) continue;
        const x = GUTTER + ((t - view.t0) / span) * plotW;
        const y = row * rowH;
        if (selected !== null && spikes.neuronIndex[i] === selected) {
          ctx.fillStyle = 'rgba(255,209,102,0.95)';
          ctx.fillRect(x, y, Math.max(1.5, markH), Math.max(markH, 2));
          ctx.fillStyle = 'rgba(95,227,192,0.85)';
        } else {
          ctx.fillRect(x, y, 1, markH);
        }
      }

      // selected row band
      if (selected !== null && rowOf[selected] >= 0) {
        ctx.fillStyle = 'rgba(255,209,102,0.10)';
        ctx.fillRect(GUTTER, rowOf[selected] * rowH - 1, plotW, Math.max(rowH, 3));
      }

      // playhead
      const t = clock.timeMs;
      if (t >= view.t0 && t <= view.t1) {
        const x = GUTTER + ((t - view.t0) / span) * plotW;
        ctx.strokeStyle = 'rgba(255,209,102,0.9)';
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, plotH);
        ctx.stroke();
      }

      frame = requestAnimationFrame(render);
    };

    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [spikeIndex, view, rowOf, rows, selected]);

  const locate = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const plotW = rect.width - GUTTER - 6;
      const plotH = rect.height - 20;
      if (x < GUTTER || y > plotH) return null;
      const span = view.t1 - view.t0;
      const t = view.t0 + ((x - GUTTER) / plotW) * span;
      const row = Math.floor((y / plotH) * rows);
      const neuron = spikeIndex.activeNeurons[Math.max(0, Math.min(rows - 1, row))];
      return { x, y, neuron, t };
    },
    [view, rows, spikeIndex],
  );

  return (
    <div className="absolute inset-0">
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        style={{ cursor: 'crosshair' }}
        onPointerMove={(e) => setHover(locate(e))}
        onPointerLeave={() => setHover(null)}
        onClick={(e) => {
          const hit = locate(e as unknown as React.PointerEvent<HTMLCanvasElement>);
          if (hit) void selectNeuron(hit.neuron, false);
        }}
        onWheel={(e) => {
          const canvas = canvasRef.current;
          if (!canvas) return;
          const rect = canvas.getBoundingClientRect();
          const plotW = rect.width - GUTTER - 6;
          const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left - GUTTER) / plotW));
          const span = view.t1 - view.t0;
          // zoom about the cursor, so the feature under it stays put
          const factor = e.deltaY > 0 ? 1.18 : 1 / 1.18;
          const nextSpan = Math.max(1, Math.min(spikeIndex.durationMs, span * factor));
          const anchor = view.t0 + fraction * span;
          let t0 = anchor - fraction * nextSpan;
          let t1 = t0 + nextSpan;
          if (t0 < 0) {
            t0 = 0;
            t1 = nextSpan;
          }
          if (t1 > spikeIndex.durationMs) {
            t1 = spikeIndex.durationMs;
            t0 = t1 - nextSpan;
          }
          setView({ t0, t1 });
        }}
      />

      {hover && (
        <div
          className="panel num absolute pointer-events-none px-2 py-1"
          style={{
            left: Math.min(hover.x + 12, (canvasRef.current?.clientWidth ?? 0) - 150),
            top: Math.max(4, hover.y - 34),
            fontSize: 10,
            color: 'var(--ink)',
          }}
        >
          #{hover.neuron} &middot; {fmt(hover.t, 1)} ms
          <div style={{ color: 'var(--ink-faint)', fontSize: 9 }}>
            {fmtInt(spikeIndex.countsByNeuron[hover.neuron])} spikes &middot; click to select
          </div>
        </div>
      )}

      {(view.t0 > 0 || view.t1 < spikeIndex.durationMs) && (
        <button
          type="button"
          onClick={() => setView({ t0: 0, t1: spikeIndex.durationMs })}
          className="num absolute"
          style={{
            right: 8,
            top: 6,
            background: 'rgba(10,14,21,0.9)',
            border: '1px solid var(--hairline-strong)',
            color: 'var(--ink-dim)',
            fontSize: 9,
            padding: '2px 6px',
            cursor: 'pointer',
          }}
        >
          RESET ZOOM
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// firing rate
// ---------------------------------------------------------------------------

function scopeLabel(scope: RateScope): string {
  switch (scope.kind) {
    case 'brain':
      return 'Whole brain';
    case 'module':
      return `Module ${String(scope.moduleId + 1).padStart(2, '0')}`;
    case 'neuron':
      return `Neuron #${scope.neuronIndex}`;
    case 'cellType':
      return scope.name;
  }
}

function FiringRateChart() {
  const spikeIndex = useStore((s) => s.spikeIndex)!;
  const connectome = useStore((s) => s.connectome);
  const scope = useStore((s) => s.rateScope);
  const setScope = useStore((s) => s.setRateScope);
  const selectedNeuron = useStore((s) => s.selectedNeuron);
  const selectedModule = useStore((s) => s.selectedModule);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const series = useMemo(() => {
    if (scope.kind === 'brain') return populationRateSeries(spikeIndex);
    if (scope.kind === 'neuron') {
      return subsetRateSeries(spikeIndex, new Set([scope.neuronIndex]));
    }
    if (scope.kind === 'module' && connectome) {
      const members = new Set<number>();
      for (let i = 0; i < connectome.neuronCount; i++) {
        if (connectome.moduleIds[i] === scope.moduleId) members.add(i);
      }
      return subsetRateSeries(spikeIndex, members);
    }
    if (scope.kind === 'cellType' && connectome) {
      const type = connectome.cellTypes.cellTypes.find((c) => c.name === scope.name);
      return subsetRateSeries(spikeIndex, new Set(type?.neuronIndices ?? []));
    }
    return populationRateSeries(spikeIndex);
  }, [scope, spikeIndex, connectome]);

  const peak = useMemo(() => Math.max(1, ...series), [series]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let frame = 0;

    const render = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w === 0 || h === 0) {
        frame = requestAnimationFrame(render);
        return;
      }
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const plotW = w - GUTTER - 8;
      const plotH = h - 20;

      ctx.font = '9px "IBM Plex Mono", monospace';
      ctx.fillStyle = 'rgba(148,176,214,0.6)';
      ctx.strokeStyle = 'rgba(148,176,214,0.08)';
      for (let i = 0; i <= 4; i++) {
        const y = plotH - (i / 4) * plotH;
        ctx.beginPath();
        ctx.moveTo(GUTTER, y);
        ctx.lineTo(GUTTER + plotW, y);
        ctx.stroke();
        ctx.fillText(((peak * i) / 4).toFixed(peak < 10 ? 1 : 0), 4, y + 3);
      }
      ctx.fillText('Hz', 4, 10);

      ctx.strokeStyle = '#5fe3c0';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let b = 0; b < series.length; b++) {
        const x = GUTTER + (b / Math.max(series.length - 1, 1)) * plotW;
        const y = plotH - (series[b] / peak) * plotH;
        if (b === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      ctx.lineTo(GUTTER + plotW, plotH);
      ctx.lineTo(GUTTER, plotH);
      ctx.closePath();
      ctx.fillStyle = 'rgba(95,227,192,0.10)';
      ctx.fill();

      const duration = spikeIndex.durationMs;
      for (let i = 0; i <= 6; i++) {
        const x = GUTTER + (i / 6) * plotW;
        ctx.fillStyle = 'rgba(148,176,214,0.6)';
        ctx.fillText(((duration * i) / 6).toFixed(0), x - 8, plotH + 12);
      }

      const t = clock.timeMs;
      if (duration > 0) {
        const x = GUTTER + (t / duration) * plotW;
        ctx.strokeStyle = 'rgba(255,209,102,0.9)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, plotH);
        ctx.stroke();
      }

      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [series, peak, spikeIndex]);

  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="flex items-center gap-2 px-3 py-1 shrink-0">
        <span className="label">Scope</span>
        <div style={{ width: 320 }}>
          <SegmentedControl
            options={[
              { value: 'brain', label: 'Whole brain' },
              { value: 'module', label: 'Module', title: 'Select a module first' },
              { value: 'neuron', label: 'Neuron', title: 'Select a neuron first' },
            ]}
            value={scope.kind === 'cellType' ? 'brain' : scope.kind}
            onChange={(kind) => {
              if (kind === 'brain') setScope({ kind: 'brain' });
              else if (kind === 'module' && selectedModule !== null)
                setScope({ kind: 'module', moduleId: selectedModule });
              else if (kind === 'neuron' && selectedNeuron !== null)
                setScope({ kind: 'neuron', neuronIndex: selectedNeuron });
            }}
          />
        </div>
        <span className="num" style={{ fontSize: 9.5, color: 'var(--ink-faint)' }}>
          {scopeLabel(scope)} &middot; peak {fmt(peak, 1)} Hz &middot; {BIN_MS} ms bins
          {spikeIndex.trials > 1 && ` · averaged over ${spikeIndex.trials} trials`}
        </span>
      </div>
      <canvas ref={canvasRef} className="flex-1 w-full block min-h-0" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// heatmap
// ---------------------------------------------------------------------------

/**
 * Neuron-by-time activity.
 *
 * Rows are the most active neurons, one row per neuron. Averaging unrelated
 * neurons together to fit more in would invent values no neuron had, so the
 * row count is capped and stated instead.
 */
function ActivityHeatmap() {
  const spikeIndex = useStore((s) => s.spikeIndex)!;
  const selectNeuron = useStore((s) => s.selectNeuron);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rows, setRows] = useState(64);

  const matrix = useMemo(
    () => activityMatrix(spikeIndex, rows, 220),
    [spikeIndex, rows],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let frame = 0;

    const render = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w === 0 || h === 0) {
        frame = requestAnimationFrame(render);
        return;
      }
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const plotW = w - GUTTER - 8;
      const plotH = h - 20;
      const cellW = plotW / matrix.columns;
      const cellH = plotH / Math.max(matrix.neurons.length, 1);
      const maxHz = Math.max(matrix.maxHz, 1);

      for (let r = 0; r < matrix.neurons.length; r++) {
        for (let c = 0; c < matrix.columns; c++) {
          const v = matrix.values[r * matrix.columns + c] / maxHz;
          if (v <= 0) continue;
          // perceptually ordered ramp: dark teal -> green -> amber -> white
          const t = Math.pow(v, 0.55);
          const red = Math.round(20 + 235 * Math.min(1, t * 1.5));
          const green = Math.round(60 + 175 * Math.min(1, t * 1.15));
          const blue = Math.round(70 + 150 * Math.max(0, t * 1.8 - 0.8));
          ctx.fillStyle = `rgb(${red},${green},${blue})`;
          ctx.fillRect(GUTTER + c * cellW, r * cellH, Math.ceil(cellW), Math.ceil(cellH));
        }
      }

      ctx.font = '9px "IBM Plex Mono", monospace';
      ctx.fillStyle = 'rgba(148,176,214,0.6)';
      for (let i = 0; i <= 6; i++) {
        const x = GUTTER + (i / 6) * plotW;
        ctx.fillText(((spikeIndex.durationMs * i) / 6).toFixed(0), x - 8, plotH + 12);
      }
      ctx.fillText('ms', GUTTER + plotW - 12, plotH + 12);
      ctx.save();
      ctx.translate(11, plotH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText('most active neurons', -48, 0);
      ctx.restore();

      const t = clock.timeMs;
      if (spikeIndex.durationMs > 0) {
        const x = GUTTER + (t / spikeIndex.durationMs) * plotW;
        ctx.strokeStyle = 'rgba(255,209,102,0.9)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, plotH);
        ctx.stroke();
      }

      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [matrix, spikeIndex]);

  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="flex items-center gap-3 px-3 py-1 shrink-0">
        <span className="num" style={{ fontSize: 9.5, color: 'var(--ink-faint)' }}>
          {matrix.neurons.length} of {fmtInt(spikeIndex.activeNeurons.length)} active neurons
          &middot; peak {fmt(matrix.maxHz, 1)} Hz per cell
        </span>
        <div style={{ width: 170 }}>
          <SegmentedControl
            options={[
              { value: '32', label: '32' },
              { value: '64', label: '64' },
              { value: '128', label: '128' },
              { value: '256', label: '256' },
            ]}
            value={String(rows)}
            onChange={(v) => setRows(Number(v))}
          />
        </div>
      </div>
      <canvas
        ref={canvasRef}
        className="flex-1 w-full block min-h-0"
        style={{ cursor: 'crosshair' }}
        onClick={(e) => {
          const canvas = canvasRef.current;
          if (!canvas) return;
          const rect = canvas.getBoundingClientRect();
          const plotH = rect.height - 20;
          const row = Math.floor(((e.clientY - rect.top) / plotH) * matrix.neurons.length);
          const neuron = matrix.neurons[Math.max(0, Math.min(matrix.neurons.length - 1, row))];
          if (neuron !== undefined) void selectNeuron(neuron, false);
        }}
      />
    </div>
  );
}
