/**
 * Left column: stimulus, run control, layers, filters, camera, pathway.
 *
 * The stimulus defaults to a published experiment from code/benchmark.py
 * rather than an invented one, so the first run a user does is a real protocol
 * with real FlyWire target neurons.
 */

import { useState } from 'react';

import { CAMERA_POSES } from '../three/flyAnatomy';
import { useStore } from '../store/useStore';
import {
  Button,
  Field,
  NumberInput,
  ProvenanceBadge,
  Row,
  Section,
  SegmentedControl,
  Slider,
  Toggle,
  Unavailable,
  fmt,
  fmtCompact,
  fmtInt,
} from './ui/primitives';

export function ControlPanel() {
  return (
    <div className="h-full overflow-y-auto" style={{ background: 'rgba(8,12,18,0.72)' }}>
      <StimulusSection />
      <RunSection />
      <LayerSection />
      <FilterSection />
      <PathwaySection />
      <CameraSection />
    </div>
  );
}

// ---------------------------------------------------------------------------

function StimulusSection() {
  const config = useStore((s) => s.config);
  const setConfig = useStore((s) => s.setConfig);
  const experiments = useStore((s) => s.experiments);
  const applyExperiment = useStore((s) => s.applyExperiment);
  const backends = useStore((s) => s.backends);
  const model = useStore((s) => s.model);
  const spikeIndex = useStore((s) => s.spikeIndex);
  const selectedNeuron = useStore((s) => s.selectedNeuron);
  const simState = useStore((s) => s.simState);

  const [preset, setPreset] = useState<string>('sugar');
  const busy = simState === 'RUNNING' || simState === 'QUEUED' || simState === 'PROCESSING';

  const presetOptions = [
    ...experiments.map((e) => ({ value: e.key, label: e.key, title: e.name })),
    { value: 'custom', label: 'Custom', title: 'Choose your own input neurons' },
  ];

  const activeExperiment = experiments.find((e) => e.key === preset);

  return (
    <Section title="Stimulus" provenance="measured">
      <Field label="Protocol" hint="code/benchmark.py">
        <SegmentedControl
          options={presetOptions}
          value={preset}
          onChange={(value) => {
            setPreset(value);
            if (value !== 'custom') applyExperiment(value);
          }}
        />
      </Field>

      {activeExperiment && (
        <p style={{ fontSize: 10.5, color: 'var(--ink-faint)', lineHeight: 1.5, marginBottom: 8 }}>
          {activeExperiment.name} &mdash; {activeExperiment.inputNeurons.length} neurons
          identified by FlyWire ID in the repository, not selected by this
          interface.
        </p>
      )}

      <Field
        label="Input neurons"
        hint={`${config.inputNeurons.length} selected`}
      >
        <div
          className="num px-2 py-[6px]"
          style={{
            border: '1px solid var(--hairline)',
            background: 'rgba(0,0,0,0.3)',
            fontSize: 10.5,
            color: config.inputNeurons.length ? 'var(--ink-dim)' : 'var(--inhibitory)',
            maxHeight: 54,
            overflow: 'auto',
            lineHeight: 1.5,
          }}
        >
          {config.inputNeurons.length
            ? config.inputNeurons.slice(0, 40).map((i) => `#${i}`).join('  ') +
              (config.inputNeurons.length > 40 ? ` +${config.inputNeurons.length - 40} more` : '')
            : 'No input neurons — a simulation needs at least one'}
        </div>
      </Field>

      <div className="flex gap-1 mb-3">
        <Button
          disabled={selectedNeuron === null}
          title="Add the neuron selected in the 3D view to the stimulus set"
          onClick={() => {
            if (selectedNeuron === null) return;
            setPreset('custom');
            setConfig({
              inputNeurons: Array.from(new Set([...config.inputNeurons, selectedNeuron])),
            });
          }}
        >
          + Selected
        </Button>
        <Button
          disabled={config.inputNeurons.length === 0}
          onClick={() => {
            setPreset('custom');
            setConfig({ inputNeurons: [] });
          }}
        >
          Clear
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Rate" hint="Hz">
          <NumberInput
            value={config.inputRateHz}
            onChange={(v) => setConfig({ inputRateHz: v })}
            min={0}
            max={5000}
            step={10}
            disabled={busy}
          />
        </Field>
        <Field label="Duration" hint={`max ${model?.limits.maxDurationMs ?? 5000} ms`}>
          <NumberInput
            value={config.durationMs}
            onChange={(v) => setConfig({ durationMs: v })}
            min={1}
            max={model?.limits.maxDurationMs ?? 5000}
            step={50}
            disabled={busy}
          />
        </Field>
        <Field label="Trials" hint={`max ${model?.limits.maxTrials ?? 8}`}>
          <NumberInput
            value={config.trials}
            onChange={(v) => setConfig({ trials: Math.round(v) })}
            min={1}
            max={model?.limits.maxTrials ?? 8}
            disabled={busy}
          />
        </Field>
        <Field label="Seed" hint="Poisson RNG">
          <NumberInput
            value={config.seed}
            onChange={(v) => setConfig({ seed: Math.round(v) })}
            min={0}
            disabled={busy}
          />
        </Field>
      </div>

      <Field label="Probe neurons" hint={`${config.probeNeurons.length}/${model?.limits.maxProbeNeurons ?? 64}`}>
        <div className="flex gap-1">
          <Button
            disabled={selectedNeuron === null || busy}
            onClick={() => {
              if (selectedNeuron === null) return;
              setConfig({
                probeNeurons: Array.from(
                  new Set([...config.probeNeurons, selectedNeuron]),
                ).slice(0, model?.limits.maxProbeNeurons ?? 64),
              });
            }}
          >
            + Selected
          </Button>
          <Button
            disabled={!spikeIndex || busy}
            title="Probe the neurons that fired most in the last run"
            onClick={() => {
              if (!spikeIndex) return;
              setConfig({
                probeNeurons: Array.from(spikeIndex.activeNeurons.slice(0, 8)),
              });
            }}
          >
            Most active
          </Button>
          <Button disabled={!config.probeNeurons.length} onClick={() => setConfig({ probeNeurons: [] })}>
            Clear
          </Button>
        </div>
      </Field>
      <p style={{ fontSize: 10, color: 'var(--ink-faint)', lineHeight: 1.5, marginTop: -4 }}>
        Probes record membrane potential. Stimulated neurons read a flat
        &minus;52&nbsp;mV because the Poisson drive is strong enough to spike and
        reset them every step &mdash; probe downstream neurons to see voltage.
      </p>

      <Field label="Backend">
        <div
          style={{ border: '1px solid var(--hairline)', background: 'rgba(0,0,0,0.3)' }}
        >
          {backends.map((backend) => (
            <button
              key={backend.key}
              type="button"
              disabled={!backend.available}
              onClick={() => setConfig({ backend: backend.key })}
              title={backend.detail}
              className="w-full text-left px-2 py-[5px] hair-b"
              style={{
                background:
                  config.backend === backend.key ? 'rgba(53,208,192,0.12)' : 'transparent',
                border: 'none',
                cursor: backend.available ? 'pointer' : 'not-allowed',
                opacity: backend.available ? 1 : 0.45,
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="num" style={{ fontSize: 11, color: 'var(--ink)' }}>
                  {backend.label} <span style={{ color: 'var(--ink-faint)' }}>{backend.device}</span>
                  {backend.reference && (
                    <span style={{ color: 'var(--derived)', fontSize: 9 }}> &middot; reference</span>
                  )}
                </span>
                <span
                  className="num"
                  style={{
                    fontSize: 8.5,
                    color: backend.available ? 'var(--measured)' : 'var(--ink-faint)',
                  }}
                >
                  {backend.status}
                </span>
              </div>
            </button>
          ))}
          {backends.length === 0 && (
            <div className="px-2 py-2">
              <Unavailable reason="The simulation service is not reachable." />
            </div>
          )}
        </div>
      </Field>
    </Section>
  );
}

// ---------------------------------------------------------------------------

function RunSection() {
  const simState = useStore((s) => s.simState);
  const simStage = useStore((s) => s.simStage);
  const simProgress = useStore((s) => s.simProgress);
  const simSpikes = useStore((s) => s.simSpikesSoFar);
  const simElapsed = useStore((s) => s.simElapsed);
  const simError = useStore((s) => s.simError);
  const simErrorDetail = useStore((s) => s.simErrorDetail);
  const config = useStore((s) => s.config);
  const run = useStore((s) => s.runSimulation);
  const cancel = useStore((s) => s.cancelSimulation);
  const backends = useStore((s) => s.backends);
  const summary = useStore((s) => s.summary);

  const [showDetail, setShowDetail] = useState(false);

  const busy = simState === 'RUNNING' || simState === 'QUEUED' || simState === 'PROCESSING';
  const backend = backends.find((b) => b.key === config.backend);
  const blocked = !backend?.available || config.inputNeurons.length === 0;

  return (
    <Section title="Simulation" provenance="simulated">
      {!busy && (
        <Button variant="primary" full onClick={() => void run()} disabled={blocked}>
          Run simulation
        </Button>
      )}
      {busy && (
        <Button variant="danger" full onClick={() => void cancel()}>
          Cancel
        </Button>
      )}

      {blocked && !busy && (
        <p style={{ fontSize: 10.5, color: 'var(--simulated)', marginTop: 6, lineHeight: 1.5 }}>
          {config.inputNeurons.length === 0
            ? 'Select at least one input neuron first.'
            : `${backend?.label ?? 'This backend'} cannot run here: ${backend?.detail ?? 'unavailable'}`}
        </p>
      )}

      {busy && (
        <div className="mt-3">
          <div className="flex items-baseline justify-between mb-1">
            <span className="num" style={{ fontSize: 10.5, color: 'var(--focus)' }}>
              {simStage || simState}
            </span>
            <span className="num" style={{ fontSize: 10, color: 'var(--ink-faint)' }}>
              {(simProgress * 100).toFixed(0)}%
            </span>
          </div>
          <div style={{ height: 3, background: 'rgba(148,176,214,0.12)' }}>
            <div
              style={{
                width: `${simProgress * 100}%`,
                height: '100%',
                background: 'var(--focus)',
                transition: 'width 200ms linear',
              }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="num" style={{ fontSize: 9.5, color: 'var(--ink-faint)' }}>
              {fmtInt(simSpikes)} spikes
            </span>
            <span className="num" style={{ fontSize: 9.5, color: 'var(--ink-faint)' }}>
              {fmt(simElapsed, 1)} s elapsed
            </span>
          </div>
        </div>
      )}

      {simState === 'ERROR' && simError && (
        <div
          className="mt-3 p-2"
          style={{ border: '1px solid rgba(242,99,126,0.45)', background: 'rgba(242,99,126,0.07)' }}
        >
          <div className="label mb-1" style={{ color: 'var(--inhibitory)' }}>
            Simulation failed
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-dim)', lineHeight: 1.5 }}>{simError}</div>
          <Row label="Backend" value={`${backend?.label ?? config.backend} ${backend?.device ?? ''}`} />
          <div className="flex gap-1 mt-2">
            <Button onClick={() => void run()}>Retry</Button>
            {simErrorDetail && (
              <Button variant="ghost" onClick={() => setShowDetail((v) => !v)}>
                {showDetail ? 'Hide details' : 'View details'}
              </Button>
            )}
          </div>
          {showDetail && simErrorDetail && (
            <pre
              className="num mt-2 p-2 overflow-auto"
              style={{
                fontSize: 9,
                lineHeight: 1.45,
                color: 'var(--ink-faint)',
                background: 'rgba(0,0,0,0.4)',
                maxHeight: 170,
                whiteSpace: 'pre-wrap',
              }}
            >
              {simErrorDetail}
            </pre>
          )}
        </div>
      )}

      {simState === 'COMPLETE' && summary && (
        <div className="mt-3">
          <Row label="Backend" value={summary.backendLabel} />
          <Row label="Device" value={summary.device} />
          <Row label="Wall time" value={`${fmt(summary.timings.simulationSeconds, 2)} s`} />
          <Row
            label="Realtime ratio"
            value={`${fmt(summary.timings.realtimeRatio, 3)}×`}
            title="Simulated seconds per wall-clock second."
          />
          <Row label="Timestep" value={`${summary.timestepMs} ms`} />
          {summary.statistics.truncated && (
            <p style={{ fontSize: 10, color: 'var(--simulated)', marginTop: 4 }}>
              Spike recording hit its cap; the tail of this run was not stored.
            </p>
          )}
        </div>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------

function LayerSection() {
  const layers = useStore((s) => s.layers);
  const toggle = useStore((s) => s.toggleLayer);
  const xray = useStore((s) => s.xray);
  const setXray = useStore((s) => s.setXray);

  return (
    <Section title="Layers">
      <Field label="X-ray" hint={`${Math.round(xray * 100)}%`}>
        <Slider value={xray} onChange={setXray} min={0} max={1} marks={['Opaque', 'Glass']} />
      </Field>
      <Toggle
        checked={layers.anatomy}
        onChange={() => toggle('anatomy')}
        label="Fly anatomy"
        hint="Procedural body geometry and neuropil shells"
      />
      <Toggle checked={layers.neurons} onChange={() => toggle('neurons')} label="Neurons" />
      <Toggle
        checked={layers.connections}
        onChange={() => toggle('connections')}
        label="Connections"
      />
      <Toggle checked={layers.activity} onChange={() => toggle('activity')} label="Activity" />
      <Toggle checked={layers.labels} onChange={() => toggle('labels')} label="Labels" />
      <Toggle checked={layers.axes} onChange={() => toggle('axes')} label="Axes and grid" />
    </Section>
  );
}

// ---------------------------------------------------------------------------

function FilterSection() {
  const filters = useStore((s) => s.filters);
  const setFilters = useStore((s) => s.setFilters);
  const connectome = useStore((s) => s.connectome);

  const exported = connectome?.meta.exportedEdgeCount ?? 0;
  const total = connectome?.meta.connectionCount ?? 0;
  const shown = Math.floor(exported * filters.density);

  return (
    <Section title="Connection filters" provenance="measured">
      <Field label="Minimum synapses" hint={`≥ ${filters.minSynapses}`}>
        <Slider
          value={filters.minSynapses}
          onChange={(v) => setFilters({ minSynapses: Math.round(v) })}
          min={0}
          max={400}
          step={1}
          marks={['0', '200', '400']}
        />
      </Field>

      <Field label="Density" hint={`${Math.round(filters.density * 100)}%`}>
        <Slider
          value={filters.density}
          onChange={(v) => setFilters({ density: v })}
          min={0.01}
          max={1}
          marks={['Low', 'Medium', 'High']}
        />
      </Field>

      <Toggle
        checked={filters.showExcitatory}
        onChange={(v) => setFilters({ showExcitatory: v })}
        label="Excitatory"
      />
      <Toggle
        checked={filters.showInhibitory}
        onChange={(v) => setFilters({ showInhibitory: v })}
        label="Inhibitory"
      />

      <p style={{ fontSize: 10, color: 'var(--ink-faint)', lineHeight: 1.5, marginTop: 6 }}>
        Up to {fmtCompact(shown)} of the {fmtCompact(exported)} strongest
        connections are drawn, out of {fmtCompact(total)} measured. Selecting a
        neuron queries its full connectivity from the server.
      </p>
    </Section>
  );
}

// ---------------------------------------------------------------------------

function PathwaySection() {
  const source = useStore((s) => s.pathSource);
  const target = useStore((s) => s.pathTarget);
  const setEndpoint = useStore((s) => s.setPathEndpoint);
  const findPath = useStore((s) => s.findPath);
  const clearPath = useStore((s) => s.clearPath);
  const result = useStore((s) => s.pathResult);
  const busy = useStore((s) => s.pathBusy);
  const selected = useStore((s) => s.selectedNeuron);
  const setViewMode = useStore((s) => s.setViewMode);

  return (
    <Section title="Pathway" provenance="measured">
      <div className="grid grid-cols-2 gap-1 mb-2">
        <Button
          disabled={selected === null}
          onClick={() => setEndpoint('source', selected)}
          title="Use the selected neuron as the start of the route"
        >
          Set A {source !== null ? `#${source}` : ''}
        </Button>
        <Button
          disabled={selected === null}
          onClick={() => setEndpoint('target', selected)}
          title="Use the selected neuron as the end of the route"
        >
          Set B {target !== null ? `#${target}` : ''}
        </Button>
      </div>

      <div className="flex gap-1">
        <Button
          variant="primary"
          disabled={source === null || target === null || busy}
          onClick={() => {
            setViewMode('pathway');
            void findPath();
          }}
        >
          {busy ? 'Searching…' : 'Find route'}
        </Button>
        <Button variant="ghost" onClick={clearPath}>
          Clear
        </Button>
      </div>

      {result && result.found && (
        <div className="mt-2">
          <Row label="Hops" value={result.hops} />
          <Row label="Synapses on route" value={fmtInt(result.totalSynapses)} />
          <Row label="Weakest link" value={`${fmtInt(result.weakestLink)} syn`} />
          <Row label="Neurons searched" value={fmtCompact(result.searchedNeurons)} />
          <div
            className="num mt-2 p-2"
            style={{
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid var(--hairline)',
              fontSize: 10,
              color: 'var(--ink-dim)',
              lineHeight: 1.7,
              maxHeight: 110,
              overflow: 'auto',
            }}
          >
            {result.path.map((n, i) => (
              <div key={`${n}-${i}`}>
                {i > 0 && <span style={{ color: 'var(--ink-faint)' }}>{'↓ '}</span>}
                #{n}
                {i > 0 && (
                  <span style={{ color: 'var(--ink-faint)' }}>
                    {'  '}
                    {fmtInt(result.edges[i - 1].synapses)} syn
                    {result.edges[i - 1].sign < 0 ? ' (inh)' : ''}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {result && !result.found && (
        <p style={{ fontSize: 10.5, color: 'var(--simulated)', marginTop: 8, lineHeight: 1.5 }}>
          {result.reason}
        </p>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------

function CameraSection() {
  const request = useStore((s) => s.requestCamera);
  const selected = useStore((s) => s.selectedNeuron);
  const selectedModule = useStore((s) => s.selectedModule);

  return (
    <Section title="Camera">
      <div className="grid grid-cols-3 gap-1">
        {CAMERA_POSES.map((pose) => (
          <Button key={pose.key} onClick={() => request(pose.key)} title={pose.label}>
            {pose.label.replace('Brain (', '').replace(')', '')}
          </Button>
        ))}
        <Button
          disabled={selected === null && selectedModule === null}
          onClick={() => request('selection')}
          title="Frame the current selection"
        >
          Focus
        </Button>
      </div>
      <p style={{ fontSize: 10, color: 'var(--ink-faint)', lineHeight: 1.5, marginTop: 8 }}>
        Drag to orbit, scroll to zoom, right-drag to pan. Camera moves are
        interpolated so the fly stays one continuous object.
      </p>
      <div className="mt-2">
        <ProvenanceBadge kind="approximation" />
        <span style={{ fontSize: 10, color: 'var(--ink-faint)', marginLeft: 6 }}>
          Body geometry is drawn, not scanned.
        </span>
      </div>
    </Section>
  );
}
