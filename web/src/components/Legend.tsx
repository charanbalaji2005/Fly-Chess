/**
 * What every mark in the 3D view means.
 *
 * Each entry pairs a colour with a distinct shape or size, so the encoding
 * survives for colour-blind readers: a spiking neuron is not merely a
 * different hue, it is larger and carries a ring.
 */

import { MODEL_DELAY_MS, PULSE_STRETCH } from '../three/BrainLayers';
import { useStore } from '../store/useStore';
import { ProvenanceBadge } from './ui/primitives';

export function Legend() {
  const connectome = useStore((s) => s.connectome);

  return (
    <div className="absolute inset-0 overflow-auto px-4 py-3">
      <div className="grid gap-x-8 gap-y-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))' }}>
        <div>
          <div className="label mb-2">Neurons</div>
          <Entry
            mark={<Dot size={4} color="#4b6b8a" />}
            label="Inactive"
            note="Sized by measured out-degree"
          />
          <Entry
            mark={<Dot size={6} color="#5fe3c0" />}
            label="Active"
            note="Fired recently; brightness decays"
          />
          <Entry
            mark={<Dot size={9} color="#fff1c9" ring />}
            label="Spiking"
            note="Firing now; larger, with a ring"
          />
          <Entry
            mark={<Dot size={9} color="#ffd166" ring />}
            label="Selected"
            note="Click a neuron or search for one"
          />
        </div>

        <div>
          <div className="label mb-2">Connections</div>
          <Entry
            mark={<Line color="#3fbf9c" />}
            label="Excitatory"
            note="Positive Excitatory x Connectivity"
          />
          <Entry
            mark={<Line color="#e2566f" />}
            label="Inhibitory"
            note="Negative Excitatory x Connectivity"
          />
          <Entry
            mark={<Line color="#ffd166" thick />}
            label="Pathway"
            note="A measured route between two neurons"
          />
          <Entry
            mark={<Dot size={5} color="#b8ffe9" />}
            label="Spike pulse"
            note={`Travel time exaggerated ${PULSE_STRETCH}x (model delay ${MODEL_DELAY_MS} ms)`}
          />
        </div>

        <div>
          <div className="label mb-2">Provenance</div>
          <Entry
            mark={<ProvenanceBadge kind="measured" compact />}
            label="Measured"
            note="FlyWire 783 datasets in data/"
          />
          <Entry
            mark={<ProvenanceBadge kind="simulated" compact />}
            label="Simulated"
            note="Output of the repository's spiking model"
          />
          <Entry
            mark={<ProvenanceBadge kind="derived" compact />}
            label="Derived"
            note="Layout and modules, computed from measured data"
          />
          <Entry
            mark={<ProvenanceBadge kind="approximation" compact />}
            label="Approximation"
            note="The fly body and neuropil shells. Drawn, not measured."
          />
        </div>

        <div>
          <div className="label mb-2">Reading the scene</div>
          <p style={{ fontSize: 10.5, color: 'var(--ink-dim)', lineHeight: 1.6 }}>
            Neuron positions are a force-directed layout of the measured
            connectivity, not soma coordinates. Two neurons drawn close together
            are strongly connected; they are not necessarily neighbours in the
            animal.
          </p>
          {connectome?.meta.layout.separationRatio !== undefined && (
            <p className="num" style={{ fontSize: 10, color: 'var(--ink-faint)', marginTop: 6, lineHeight: 1.6 }}>
              Connected pairs sit{' '}
              {(1 / connectome.meta.layout.separationRatio).toFixed(1)}&times; closer
              than random pairs (ratio {connectome.meta.layout.separationRatio.toFixed(3)}).
            </p>
          )}
        </div>

        <div>
          <div className="label mb-2">Keyboard</div>
          <Shortcut keys="/" action="Focus search" />
          <Shortcut keys="Space" action="Play / pause" />
          <Shortcut keys="← →" action="Step 5 ms" />
          <Shortcut keys="Shift + ← →" action="Step 50 ms" />
          <Shortcut keys="Home" action="Restart timeline" />
          <Shortcut keys="Esc" action="Close search" />
        </div>
      </div>
    </div>
  );
}

function Entry({
  mark,
  label,
  note,
}: {
  mark: React.ReactNode;
  label: string;
  note: string;
}) {
  return (
    <div className="flex items-start gap-2 py-[3px]">
      <span
        className="shrink-0 grid place-items-center"
        style={{ width: 22, height: 14 }}
      >
        {mark}
      </span>
      <span className="min-w-0">
        <span style={{ fontSize: 11, color: 'var(--ink)' }}>{label}</span>
        <span style={{ fontSize: 10, color: 'var(--ink-faint)', display: 'block', lineHeight: 1.4 }}>
          {note}
        </span>
      </span>
    </div>
  );
}

function Dot({ size, color, ring }: { size: number; color: string; ring?: boolean }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: 99,
        background: color,
        boxShadow: ring ? `0 0 0 2px ${color}55, 0 0 6px ${color}` : `0 0 5px ${color}88`,
        display: 'block',
      }}
    />
  );
}

function Line({ color, thick }: { color: string; thick?: boolean }) {
  return <span style={{ width: 18, height: thick ? 2.5 : 1, background: color, display: 'block' }} />;
}

function Shortcut({ keys, action }: { keys: string; action: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-[2px]">
      <kbd
        className="num"
        style={{
          fontSize: 9.5,
          color: 'var(--ink-dim)',
          border: '1px solid var(--hairline)',
          padding: '1px 5px',
        }}
      >
        {keys}
      </kbd>
      <span style={{ fontSize: 10.5, color: 'var(--ink-faint)' }}>{action}</span>
    </div>
  );
}
