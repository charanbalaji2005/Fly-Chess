/**
 * Data-source disclosure.
 *
 * The single most important panel in the application. It states, without
 * hedging, which parts of what the user is looking at are measured, which are
 * simulated, which are computed, and which are simply drawn. Everything here is
 * read from the artefacts and the API rather than typed in, so it cannot drift
 * away from what the application is actually doing.
 */

import { useStore } from '../store/useStore';
import { MODEL_DELAY_MS, PULSE_STRETCH } from '../three/BrainLayers';
import { FLY_FRAME } from '../three/flyAnatomy';
import { ProvenanceBadge, Row, fmt, fmtCompact } from './ui/primitives';

export function AboutPanel({ onClose }: { onClose: () => void }) {
  const connectome = useStore((s) => s.connectome);
  const model = useStore((s) => s.model);
  const backends = useStore((s) => s.backends);
  const serviceError = useStore((s) => s.serviceError);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center px-4 py-6"
      style={{ background: 'rgba(4,6,10,0.8)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
      role="presentation"
    >
      <div
        className="panel overflow-y-auto"
        style={{ maxWidth: 860, width: '100%', maxHeight: '100%' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Data sources"
      >
        <header className="flex items-center justify-between gap-3 px-4 py-3 hair-b">
          <h2 className="num" style={{ fontSize: 13, letterSpacing: '0.1em' }}>
            DATA SOURCES &amp; SCIENTIFIC LIMITS
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="num"
            style={{
              background: 'transparent',
              border: '1px solid var(--hairline)',
              color: 'var(--ink-dim)',
              padding: '3px 9px',
              fontSize: 10,
              cursor: 'pointer',
            }}
          >
            CLOSE
          </button>
        </header>

        <div className="px-4 py-4 grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
          {/* ---------------------------------------------------------- */}
          <section>
            <Heading kind="measured">Measured</Heading>
            <p style={COPY}>
              Read directly from the datasets in <code>data/</code>. Not
              modified by this application.
            </p>
            {connectome && (
              <>
                <Row label="Neurons" value={fmtCompact(connectome.meta.neuronCount)} />
                <Row label="Connections" value={fmtCompact(connectome.meta.connectionCount)} />
                <Row label="Synapses" value={fmtCompact(connectome.meta.synapseCount)} />
                <Row label="Named SEZ cell types" value={connectome.meta.sezCellTypeCount} />
                <Row label="Neurons in those types" value={connectome.meta.sezNeuronCount} />
                <div className="num mt-2" style={{ fontSize: 10, color: 'var(--ink-faint)', lineHeight: 1.6 }}>
                  {Object.entries(connectome.meta.sources).map(([key, path]) => (
                    <div key={key}>{path}</div>
                  ))}
                </div>
              </>
            )}
          </section>

          {/* ---------------------------------------------------------- */}
          <section>
            <Heading kind="simulated">Simulated</Heading>
            <p style={COPY}>
              Spike times, firing rates and membrane voltages come from running
              the model defined in this repository. Nothing is replayed from a
              file or generated in the browser.
            </p>
            {model && (
              <>
                <Row label="Model" value={model.name} />
                <Row label="Source" value={model.source} />
                <Row label="Timestep" value={`${model.timestepMs} ms`} />
                <Row label="Threshold" value={`${model.parameters.vThreshold} mV`} />
                <Row label="Resting potential" value={`${model.parameters.vRest} mV`} />
                <Row label="Membrane tau" value={`${model.parameters.tauMem} ms`} />
                <Row label="Synaptic tau" value={`${model.parameters.tauSyn} ms`} />
                <Row label="Axonal delay" value={`${model.parameters.tDelay} ms`} />
                <Row label="Refractory" value={`${model.parameters.tRefrac} ms`} />
              </>
            )}
            {serviceError && (
              <p style={{ ...COPY, color: 'var(--inhibitory)' }}>{serviceError}</p>
            )}
          </section>

          {/* ---------------------------------------------------------- */}
          <section>
            <Heading kind="derived">Derived</Heading>
            <p style={COPY}>
              Computed by this application from measured data. Reproducible from
              a fixed seed, but not something the datasets state.
            </p>
            {connectome && (
              <>
                <Row label="Layout" value={connectome.meta.layout.method} />
                <Row label="Seed" value={connectome.meta.layout.seed} />
                {connectome.meta.layout.separationRatio !== undefined && (
                  <Row
                    label="Separation ratio"
                    value={fmt(connectome.meta.layout.separationRatio, 3)}
                    title={connectome.meta.layout.separationNote}
                  />
                )}
                <Row label="Modules" value={connectome.meta.moduleCount} />
                <p style={{ ...COPY, marginTop: 8 }}>{connectome.modules.method}</p>
                <p style={{ ...COPY, color: 'var(--simulated)' }}>
                  {connectome.meta.layout.warning}
                </p>
              </>
            )}
          </section>

          {/* ---------------------------------------------------------- */}
          <section>
            <Heading kind="approximation">Approximation</Heading>
            <p style={COPY}>
              <strong>The fly you are looking at is drawn, not scanned.</strong>{' '}
              This repository contains no 3D model in any format (glb, gltf, obj,
              fbx, stl, ply, blend, dae) and no neuron soma coordinates. The body,
              the compound eyes, the wings, the legs and the neuropil shells are
              procedural geometry proportioned from published descriptions of
              adult <em>Drosophila melanogaster</em>.
            </p>
            <Row label="Frame" value={`${FLY_FRAME.axes.x} / ${FLY_FRAME.axes.y} / ${FLY_FRAME.axes.z}`} />
            <Row label="Scale" value={`1 unit ≈ ${FLY_FRAME.unitMicrons} µm`} />
            <Row label="Pulse exaggeration" value={`${PULSE_STRETCH}× of ${MODEL_DELAY_MS} ms`} />
            {connectome && (
              <p style={{ ...COPY, marginTop: 8 }}>{connectome.anatomy.note}</p>
            )}
            <p style={{ ...COPY, color: 'var(--simulated)' }}>
              No neuron is assigned to a compartment and no statistic is computed
              over one. Where the interface would otherwise show a brain region,
              it shows &ldquo;Data unavailable&rdquo; instead.
            </p>
          </section>

          {/* ---------------------------------------------------------- */}
          <section style={{ gridColumn: '1 / -1' }}>
            <Heading>Simulation backends</Heading>
            <p style={COPY}>
              The repository ships runners for six backends. A backend is only
              offered here if it can actually execute in this environment;
              availability is probed at startup rather than assumed.
            </p>
            <div className="grid gap-x-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
              {backends.map((b) => (
                <div key={b.key} className="flex items-baseline justify-between gap-2 py-[3px]">
                  <span className="num" style={{ fontSize: 11 }}>
                    {b.label} <span style={{ color: 'var(--ink-faint)' }}>{b.device}</span>
                  </span>
                  <span
                    className="num"
                    style={{
                      fontSize: 9.5,
                      color: b.available ? 'var(--measured)' : 'var(--ink-faint)',
                    }}
                    title={b.detail}
                  >
                    {b.status}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* ---------------------------------------------------------- */}
          <section style={{ gridColumn: '1 / -1' }}>
            <Heading>What this cannot tell you</Heading>
            <ul style={{ ...COPY, paddingLeft: 16, listStyle: 'disc' }}>
              <li>
                Which neuropil a neuron belongs to. The datasets carry no region
                annotation, so mushroom body, central complex, optic lobe and the
                rest cannot be identified from them.
              </li>
              <li>
                Where a neuron sits in the head. There are no soma coordinates;
                position encodes connectivity, not anatomy.
              </li>
              <li>
                What the fly would do. This is a brain connectome with no motor
                output, no body model and no sensory transduction &mdash; the
                stimulus is Poisson current injected into named neurons.
              </li>
              <li>
                Anything about the ventral nerve cord, which is outside this
                dataset.
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

const COPY: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--ink-dim)',
  lineHeight: 1.65,
  margin: '0 0 8px',
};

function Heading({
  children,
  kind,
}: {
  children: React.ReactNode;
  kind?: 'measured' | 'simulated' | 'derived' | 'approximation';
}) {
  return (
    <h3 className="flex items-center gap-2 mb-2">
      <span className="label">{children}</span>
      {kind && <ProvenanceBadge kind={kind} compact />}
    </h3>
  );
}
