/**
 * The Neural Lab.
 *
 * The original connectome instrument: three columns over a dock, with the 3D
 * view given everything that is left. Reached from the game's menu, and the
 * only place in the app where measured neural data is shown -- the board's
 * neural core is a gameplay visualisation and says so.
 *
 * Three columns over a dock, with the 3D view given everything that is left.
 * The viewer is never smaller than the panels around it, and on narrow screens
 * the panels collapse into drawers over it rather than squeezing it.
 */

import { useEffect, useState } from 'react';

import { AboutPanel } from './components/AboutPanel';
import { BottomDock } from './components/BottomDock';
import { ControlPanel } from './components/ControlPanel';
import { InspectorPanel } from './components/InspectorPanel';
import { Intro, LoadingOverlay } from './components/Intro';
import { TopBar } from './components/TopBar';
import { Scene } from './three/Scene';
import { useStore } from './store/useStore';
import { fmtCompact } from './components/ui/primitives';

export function LabApp({ onExit }: { onExit: () => void }) {
  const entered = useStore((s) => s.entered);
  const [about, setAbout] = useState(false);
  const [drawer, setDrawer] = useState<'controls' | 'inspector' | null>(null);

  if (!entered) return <Intro />;

  return (
    <div className="flex flex-col h-full">
      <TopBar onOpenAbout={() => setAbout(true)} />

      {/* return path to the game; the lab is reached from its menu */}
      <button
        type="button"
        onClick={onExit}
        className="num"
        style={{
          position: 'absolute',
          left: 12,
          bottom: 260,
          zIndex: 45,
          background: 'rgba(10,14,21,0.94)',
          border: '1px solid var(--hairline-strong)',
          color: 'var(--ink-dim)',
          padding: '6px 11px',
          fontSize: 9.5,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          cursor: 'pointer',
        }}
      >
        &larr; Back to Ludo
      </button>

      <div className="flex-1 flex min-h-0">
        {/* left column ------------------------------------------------- */}
        <aside
          className="hair-r hidden lg:block shrink-0"
          style={{ width: 286 }}
          aria-label="Simulation controls"
        >
          <ControlPanel />
        </aside>

        {/* viewer ------------------------------------------------------ */}
        <main className="flex-1 relative min-w-0">
          <Scene />
          <LoadingOverlay />
          <ViewerOverlay />
          <MobileDrawerButtons onOpen={setDrawer} />
        </main>

        {/* right column ------------------------------------------------ */}
        <aside
          className="hair-l hidden xl:block shrink-0"
          style={{ width: 306 }}
          aria-label="Inspector and analytics"
        >
          <InspectorPanel />
        </aside>
      </div>

      {/* dock ---------------------------------------------------------- */}
      <div className="hair-t shrink-0" style={{ height: 246 }}>
        <BottomDock />
      </div>

      {/* drawers for narrow screens ------------------------------------ */}
      {drawer && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          style={{ background: 'rgba(4,6,10,0.7)' }}
          onClick={() => setDrawer(null)}
          role="presentation"
        >
          <div
            className="absolute top-0 bottom-0 panel"
            style={{ width: 'min(320px, 88vw)', [drawer === 'controls' ? 'left' : 'right']: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            {drawer === 'controls' ? <ControlPanel /> : <InspectorPanel />}
          </div>
        </div>
      )}

      {about && <AboutPanel onClose={() => setAbout(false)} />}
    </div>
  );
}

/**
 * Status corner over the 3D view.
 *
 * Keeps the two facts you need while looking at the scene -- what is hovered
 * and how the run is going -- next to the thing they describe, instead of
 * making you look away to a side panel.
 */
function ViewerOverlay() {
  const hovered = useStore((s) => s.hoveredNeuron);
  const connectome = useStore((s) => s.connectome);
  const spikeIndex = useStore((s) => s.spikeIndex);
  const simState = useStore((s) => s.simState);
  const simStage = useStore((s) => s.simStage);
  const simProgress = useStore((s) => s.simProgress);
  const simSpikes = useStore((s) => s.simSpikesSoFar);
  const simElapsed = useStore((s) => s.simElapsed);
  const viewMode = useStore((s) => s.viewMode);
  const debug = useStore((s) => s.debug);
  const selectNeuron = useStore((s) => s.selectNeuron);

  const busy = simState === 'RUNNING' || simState === 'QUEUED' || simState === 'PROCESSING';

  return (
    <>
      {/* running banner */}
      {busy && (
        <div
          className="panel absolute px-4 py-3 pointer-events-none"
          style={{ left: '50%', top: 18, transform: 'translateX(-50%)', minWidth: 290 }}
        >
          <div className="label mb-2" style={{ color: 'var(--focus)' }}>
            Simulation running
          </div>
          <div
            className="relative overflow-hidden"
            style={{ height: 3, background: 'rgba(148,176,214,0.12)' }}
          >
            <div
              style={{
                width: `${simProgress * 100}%`,
                height: '100%',
                background: 'var(--focus)',
                transition: 'width 200ms linear',
              }}
            />
          </div>
          <div className="flex justify-between mt-2">
            <span className="num" style={{ fontSize: 10, color: 'var(--ink-dim)' }}>
              {simStage}
            </span>
            <span className="num" style={{ fontSize: 10, color: 'var(--ink-faint)' }}>
              {fmtCompact(simSpikes)} spikes &middot; {simElapsed.toFixed(1)} s
            </span>
          </div>
        </div>
      )}

      {/* hovered neuron */}
      {hovered !== null && connectome && (
        <button
          type="button"
          onClick={() => void selectNeuron(hovered, false)}
          className="panel absolute text-left px-3 py-2"
          style={{ left: 12, bottom: 12, cursor: 'pointer' }}
        >
          <div className="num" style={{ fontSize: 11, color: 'var(--ink)' }}>
            #{hovered}
          </div>
          <div className="num" style={{ fontSize: 9.5, color: 'var(--ink-faint)' }}>
            {connectome.flywireIds[hovered].toString()}
          </div>
          <div className="num" style={{ fontSize: 9.5, color: 'var(--ink-faint)' }}>
            {connectome.degrees[hovered * 2]} in &middot; {connectome.degrees[hovered * 2 + 1]} out
            {spikeIndex && ` · ${spikeIndex.countsByNeuron[hovered]} spikes`}
          </div>
        </button>
      )}

      {/* mode caption */}
      <div
        className="absolute pointer-events-none num"
        style={{ right: 12, bottom: 12, fontSize: 9.5, color: 'var(--ink-faint)', textAlign: 'right' }}
      >
        <div style={{ textTransform: 'uppercase', letterSpacing: '0.1em' }}>{viewMode}</div>
        <div>procedural body &middot; measured connectome</div>
      </div>

      {debug && connectome && <DebugHud />}
    </>
  );
}

/** Frame rate and scene counts. Off by default; the numbers are live. */
function DebugHud() {
  const connectome = useStore((s) => s.connectome)!;
  const spikeIndex = useStore((s) => s.spikeIndex);
  const subnetwork = useStore((s) => s.activeSubnetwork);
  const filters = useStore((s) => s.filters);
  const [fps, setFps] = useState(0);

  useEffect(() => {
    let frames = 0;
    let last = performance.now();
    let handle = 0;
    const tick = () => {
      frames++;
      const now = performance.now();
      if (now - last >= 500) {
        setFps((frames * 1000) / (now - last));
        frames = 0;
        last = now;
      }
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, []);

  return (
    <div
      className="panel absolute num px-3 py-2 pointer-events-none"
      style={{ right: 12, top: 12, fontSize: 9.5, color: 'var(--ink-dim)', lineHeight: 1.7 }}
    >
      <div style={{ color: fps < 30 ? 'var(--inhibitory)' : 'var(--measured)' }}>
        FPS {fps.toFixed(0)}
      </div>
      <div>Neurons {fmtCompact(connectome.neuronCount)}</div>
      <div>Edges drawn {fmtCompact(Math.floor(connectome.edges.count * filters.density))}</div>
      <div>Active subnet {subnetwork ? fmtCompact(subnetwork.edgeCount) : '--'}</div>
      <div>Spikes {spikeIndex ? fmtCompact(spikeIndex.spikes.count) : '--'}</div>
    </div>
  );
}

function MobileDrawerButtons({
  onOpen,
}: {
  onOpen: (drawer: 'controls' | 'inspector') => void;
}) {
  return (
    <div className="absolute lg:hidden flex gap-1" style={{ left: 12, top: 12 }}>
      <DrawerButton label="Controls" onClick={() => onOpen('controls')} />
      <DrawerButton label="Inspector" onClick={() => onOpen('inspector')} />
    </div>
  );
}

function DrawerButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="num"
      style={{
        background: 'rgba(10,14,21,0.92)',
        border: '1px solid var(--hairline-strong)',
        color: 'var(--ink-dim)',
        padding: '5px 9px',
        fontSize: 9.5,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}
