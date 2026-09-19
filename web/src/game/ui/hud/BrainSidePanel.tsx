/**
 * Right-Side Google FlyWire Drosophila Connectome Visualization Panel.
 *
 * Displays a live, interactive 3D map of the fruit fly brain with real-time
 * neural firing, synaptic cascades, and cognitive telemetry while the fly AI is thinking.
 * Includes smooth hide/unhide toggling.
 */

import { useEffect, useState } from 'react';
import { useGame } from '../../store';
import { BrainCanvas } from '../../render/BrainCanvas';
import { liveBrain, type BrainTelemetry } from '../../neural/liveBrainStream';

export function BrainSidePanel() {
  const brainVisOpen = useGame((s) => s.brainVisOpen);
  const toggleBrainVis = useGame((s) => s.toggleBrainVis);
  const aiThinking = useGame((s) => s.aiThinking);
  const aiMetrics = useGame((s) => s.aiMetrics);
  const carry = useGame((s) => s.carry);

  // 3D Canvas layer toggles
  const [autoRotate, setAutoRotate] = useState(true);
  const [showSynapses, setShowSynapses] = useState(true);
  const [showNeuropils, setShowNeuropils] = useState(true);
  const [showCuticle, setShowCuticle] = useState(true);

  // Live neural telemetry state
  const [telemetry, setTelemetry] = useState<BrainTelemetry>(liveBrain.telemetry);

  useEffect(() => {
    return liveBrain.subscribe(setTelemetry);
  }, []);

  return (
    <>
      {/* ------------------------------------------------------------- */}
      {/* Floating Unhide Tab (shown when side panel is hidden)          */}
      {/* ------------------------------------------------------------- */}
      {!brainVisOpen && (
        <button
          type="button"
          onClick={toggleBrainVis}
          className={`pointer-events-auto fixed right-0 top-1/2 -translate-y-1/2 z-30 flex items-center gap-2 rounded-l-xl px-3 py-2.5 shadow-2xl transition-all duration-200 border border-r-0 ${
            aiThinking
              ? 'bg-cyan-950/90 border-cyan-400 text-cyan-200 shadow-cyan-500/20 ring-2 ring-cyan-500/40 animate-pulse'
              : 'bg-[#060a14]/90 border-cyan-500/30 text-slate-300 hover:bg-cyan-950/60 hover:text-cyan-300'
          }`}
          title="Open Fly Brain Connectome visualization"
        >
          <span className="relative flex h-3 w-3">
            <span
              className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${
                aiThinking ? 'animate-ping bg-amber-400' : 'bg-cyan-400'
              }`}
            />
            <span
              className={`relative inline-flex h-3 w-3 rounded-full ${
                aiThinking ? 'bg-amber-400' : 'bg-cyan-500'
              }`}
            />
          </span>
          <div className="flex flex-col text-left">
            <span className="text-[11px] font-bold tracking-wider uppercase font-mono">
              Fly Brain Map
            </span>
            {aiThinking ? (
              <span className="text-[9px] font-semibold text-amber-300 tracking-wide uppercase">
                Thinking · {telemetry.rateHz} Hz
              </span>
            ) : (
              <span className="text-[9px] text-slate-400 tracking-wide uppercase">
                {telemetry.rateHz} Hz Baseline
              </span>
            )}
          </div>
          <span className="text-xs text-cyan-400 font-bold">&larr;</span>
        </button>
      )}

      {/* ------------------------------------------------------------- */}
      {/* Right-Side Whole-Brain Visualizer Panel                       */}
      {/* ------------------------------------------------------------- */}
      <aside
        aria-label="FlyWire Connectome Brain Visualizer"
        className={`pointer-events-auto fixed right-0 top-0 bottom-0 z-30 flex w-[420px] max-w-[94vw] flex-col bg-[#050813]/92 backdrop-blur-2xl border-l border-cyan-500/30 shadow-2xl transition-transform duration-300 ease-out ${
          brainVisOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header ---------------------------------------------------- */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-cyan-500/20 bg-cyan-950/20">
          <div className="flex items-center gap-2.5">
            <div className="relative flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/10 border border-cyan-500/30">
              <span className="text-sm">🧠</span>
              {aiThinking && (
                <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-amber-400 animate-ping" />
              )}
            </div>
            <div>
              <div className="text-xs font-black tracking-widest text-cyan-300 uppercase font-mono">
                Drosophila Connectome
              </div>
              <div className="text-[10px] text-slate-400 font-mono tracking-tight">
                FlyWire Map · 138,639 Neurons · 15M Synapses
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={toggleBrainVis}
            className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-cyan-500/30 bg-cyan-950/40 text-cyan-300 hover:bg-cyan-800/40 hover:text-white transition-colors"
            title="Hide Brain Visualizer"
          >
            <span>Hide</span>
            <span className="font-mono text-xs">&rarr;</span>
          </button>
        </div>

        {/* 3D Connectome Canvas Viewport ------------------------------ */}
        <div className="relative flex-1 min-h-[280px] w-full overflow-hidden bg-gradient-to-b from-[#03060d] to-[#040916]">
          <BrainCanvas
            autoRotate={autoRotate}
            showSynapses={showSynapses}
            showNeuropils={showNeuropils}
            showCuticle={showCuticle}
          />

          {/* Floating Canvas Controls Overlay ------------------------ */}
          <div className="absolute top-2.5 left-2.5 right-2.5 flex flex-wrap items-center justify-between gap-1.5 pointer-events-none">
            <div className="flex items-center gap-1 pointer-events-auto bg-[#050813]/80 backdrop-blur-md rounded-lg p-1 border border-cyan-500/20">
              <button
                type="button"
                onClick={() => setAutoRotate(!autoRotate)}
                className={`px-2 py-0.5 rounded text-[10px] font-mono tracking-wider transition-colors ${
                  autoRotate
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Toggle continuous 3D rotation"
              >
                {autoRotate ? '⟳ Orbit' : '⏸ Orbit'}
              </button>
              <button
                type="button"
                onClick={() => setShowSynapses(!showSynapses)}
                className={`px-2 py-0.5 rounded text-[10px] font-mono tracking-wider transition-colors ${
                  showSynapses
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Toggle synaptic connections"
              >
                Synapses
              </button>
              <button
                type="button"
                onClick={() => setShowNeuropils(!showNeuropils)}
                className={`px-2 py-0.5 rounded text-[10px] font-mono tracking-wider transition-colors ${
                  showNeuropils
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Toggle anatomical neuropil compartments"
              >
                Neuropils
              </button>
              <button
                type="button"
                onClick={() => setShowCuticle(!showCuticle)}
                className={`px-2 py-0.5 rounded text-[10px] font-mono tracking-wider transition-colors ${
                  showCuticle
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Toggle transparent head outline"
              >
                Cuticle
              </button>
            </div>
          </div>

          {/* Quick instructions pill at bottom of canvas ------------- */}
          <div className="absolute bottom-2 inset-x-2 flex justify-center pointer-events-none">
            <span className="text-[9.5px] font-mono tracking-wider text-slate-400 bg-black/60 backdrop-blur px-2.5 py-0.5 rounded-full border border-white/10">
              Drag to Rotate 360° · Scroll to Zoom · Right-Click to Pan
            </span>
          </div>
        </div>

        {/* Live Telemetry & Cognition Section ------------------------ */}
        <div className="flex flex-col gap-3 p-4 border-t border-cyan-500/20 bg-[#060a17]/95">
          {/* Cognitive State Banner ---------------------------------- */}
          <div
            className={`flex items-center justify-between rounded-xl px-3.5 py-2.5 border transition-all ${
              aiThinking
                ? 'bg-amber-950/30 border-amber-400/50 shadow-lg shadow-amber-500/10 ring-1 ring-amber-400/20'
                : carry
                  ? 'bg-emerald-950/30 border-emerald-400/40'
                  : 'bg-cyan-950/20 border-cyan-500/20'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span
                  className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${
                    aiThinking
                      ? 'animate-ping bg-amber-400'
                      : carry
                        ? 'animate-ping bg-emerald-400'
                        : 'bg-cyan-400'
                  }`}
                />
                <span
                  className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                    aiThinking
                      ? 'bg-amber-400'
                      : carry
                        ? 'bg-emerald-400'
                        : 'bg-cyan-400'
                  }`}
                />
              </span>
              <div>
                <div
                  className={`text-[11px] font-black uppercase font-mono tracking-wide ${
                    aiThinking
                      ? 'text-amber-300'
                      : carry
                        ? 'text-emerald-300'
                        : 'text-cyan-300'
                  }`}
                >
                  {aiThinking
                    ? '⚡ AI Thinking'
                    : carry
                      ? '✈ Carrying Piece'
                      : '👁 Optic Sensing'}
                </div>
                <div className="text-[9.5px] text-slate-400 font-mono">
                  {telemetry.phaseLabel}
                </div>
              </div>
            </div>

            <div className="text-right font-mono">
              <div
                className={`text-sm font-extrabold ${
                  aiThinking
                    ? 'text-amber-300'
                    : carry
                      ? 'text-emerald-300'
                      : 'text-cyan-300'
                }`}
              >
                {telemetry.rateHz}{' '}
                <span className="text-[10px] font-normal text-slate-400">Hz</span>
              </div>
              <div className="text-[9px] text-slate-400">
                {aiThinking
                  ? `${telemetry.thoughtSpikes.toLocaleString()} spikes`
                  : 'Spontaneous rate'}
              </div>
            </div>
          </div>

          {/* Neuropil Activity Meters -------------------------------- */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-0.5">
              <span>Active Neuropil Circuits</span>
              <span className="text-cyan-400">Biological Load</span>
            </div>

            <RegionBar
              label="👁 Optic Lobes (Sensory)"
              value={telemetry.neuropils.optic}
              color="#38bdf8"
            />
            <RegionBar
              label="🧠 Central Complex (Tactics)"
              value={telemetry.neuropils.central}
              color="#818cf8"
            />
            <RegionBar
              label="🍄 Mushroom Body (Memory)"
              value={telemetry.neuropils.mushroom}
              color="#c084fc"
            />
            <RegionBar
              label="⚡ SEZ / Pre-Motor (Locomotion)"
              value={telemetry.neuropils.motor}
              color="#fbbf24"
            />
          </div>

          {/* Engine Search Telemetry --------------------------------- */}
          {aiMetrics && (
            <div className="rounded-lg bg-black/40 border border-white/5 p-2.5 font-mono text-[10.5px]">
              <div className="flex justify-between text-slate-400 text-[9px] uppercase tracking-wider mb-1.5">
                <span>Fly Search Telemetry</span>
                <span className="text-cyan-400">FIDE Decision</span>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="rounded bg-white/5 p-1">
                  <div className="text-[9px] text-slate-400">Depth</div>
                  <div className="font-bold text-white">{aiMetrics.depth} ply</div>
                </div>
                <div className="rounded bg-white/5 p-1">
                  <div className="text-[9px] text-slate-400">Nodes</div>
                  <div className="font-bold text-white">
                    {aiMetrics.nodes >= 1000
                      ? `${(aiMetrics.nodes / 1000).toFixed(1)}k`
                      : aiMetrics.nodes}
                  </div>
                </div>
                <div className="rounded bg-white/5 p-1">
                  <div className="text-[9px] text-slate-400">Time</div>
                  <div className="font-bold text-white">{aiMetrics.timeMs}ms</div>
                </div>
                <div className="rounded bg-white/5 p-1">
                  <div className="text-[9px] text-slate-400">Eval</div>
                  <div
                    className={`font-bold ${
                      aiMetrics.score > 0
                        ? 'text-emerald-400'
                        : aiMetrics.score < 0
                          ? 'text-rose-400'
                          : 'text-white'
                    }`}
                  >
                    {aiMetrics.score > 0 ? '+' : ''}
                    {aiMetrics.score.toFixed(1)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

function RegionBar({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  const percent = Math.min(100, Math.max(4, Math.round(value * 100)));

  return (
    <div className="flex items-center gap-2 font-mono text-[10px]">
      <span className="w-44 truncate text-slate-300 tracking-tight">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden relative">
        <div
          className="h-full rounded-full transition-all duration-150 ease-out"
          style={{ width: `${percent}%`, backgroundColor: color }}
        />
      </div>
      <span className="w-8 text-right font-semibold" style={{ color }}>
        {percent}%
      </span>
    </div>
  );
}
