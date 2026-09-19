/**
 * Run analytics.
 *
 * Every number here is computed from the spike train the backend returned or
 * from the connectome files. Nothing is a placeholder: before a run the panel
 * says so rather than showing zeros, because "no simulation" and "no spikes"
 * are different facts.
 */

import { useMemo } from 'react';

import { moduleActivity } from '../data/activity';
import { useStore } from '../store/useStore';
import {
  Meter,
  Row,
  Section,
  Stat,
  fmt,
  fmtCompact,
  fmtInt,
} from './ui/primitives';

export function AnalyticsPanel() {
  const connectome = useStore((s) => s.connectome);
  const spikeIndex = useStore((s) => s.spikeIndex);
  const summary = useStore((s) => s.summary);
  const simState = useStore((s) => s.simState);
  const subnetwork = useStore((s) => s.activeSubnetwork);
  const selectModule = useStore((s) => s.selectModule);
  const selectedModule = useStore((s) => s.selectedModule);
  const requestCamera = useStore((s) => s.requestCamera);

  const modules = useMemo(
    () => (spikeIndex && connectome ? moduleActivity(spikeIndex, connectome) : []),
    [spikeIndex, connectome],
  );

  const maxModuleRate = Math.max(1, ...modules.map((m) => m.meanRateHz));
  const stats = summary?.statistics;

  return (
    <>
      <Section title="Neural activity" provenance="simulated">
        {!stats && (
          <p style={{ fontSize: 11, color: 'var(--ink-faint)', lineHeight: 1.55 }}>
            {simState === 'IDLE'
              ? 'No simulation has been run yet. Configure a stimulus and press Run.'
              : `Simulation ${simState.toLowerCase()}.`}
          </p>
        )}
        {stats && (
          <>
            <div className="grid grid-cols-2 gap-3 mb-2">
              <Stat
                label="Active neurons"
                value={fmtInt(stats.activeNeuronCount)}
                accent="var(--measured)"
                title="Neurons that fired at least once during the run."
              />
              <Stat label="Spikes" value={fmtCompact(stats.spikeCount)} />
              <Stat
                label="Mean rate"
                value={fmt(stats.meanFiringRateHz, 1)}
                unit="Hz"
                title={stats.rateBasis + ', averaged over active neurons only'}
              />
              <Stat
                label="Peak rate"
                value={fmt(stats.peakFiringRateHz, 1)}
                unit="Hz"
                accent="var(--simulated)"
                title="Highest single-neuron firing rate in the run."
              />
            </div>
            <Row label="Median rate" value={`${fmt(stats.medianFiringRateHz, 2)} Hz`} />
            <Row
              label="Population rate"
              value={`${fmtCompact(stats.populationRateHz)} Hz`}
              title="Total spikes per second across the whole network."
            />
            <Row
              label="Silent neurons"
              value={
                connectome
                  ? `${fmtCompact(connectome.neuronCount - stats.activeNeuronCount)} (${fmt(
                      ((connectome.neuronCount - stats.activeNeuronCount) /
                        connectome.neuronCount) *
                        100,
                      2,
                    )}%)`
                  : '--'
              }
              title="The stimulus reaches a small subnetwork; most of the brain never fires."
            />
          </>
        )}
      </Section>

      {stats && summary && (
        <Section title="Run" provenance="simulated">
          <Row label="Duration" value={`${fmtInt(summary.durationMs)} ms`} />
          <Row label="Trials" value={summary.trials} />
          <Row label="Input rate" value={`${fmtInt(summary.inputRateHz)} Hz`} />
          <Row label="Input neurons" value={fmtInt(summary.inputNeurons.length)} />
          {summary.silencedNeurons.length > 0 && (
            <Row label="Silenced" value={fmtInt(summary.silencedNeurons.length)} />
          )}
          <Row label="Seed" value={summary.seed} />
          <Row label="Execution" value={`${fmt(summary.timings.simulationSeconds, 2)} s`} />
        </Section>
      )}

      <Section title="Network" provenance="measured">
        <Row label="Neurons" value={connectome ? fmtInt(connectome.meta.neuronCount) : '--'} />
        <Row
          label="Connections"
          value={connectome ? fmtCompact(connectome.meta.connectionCount) : '--'}
        />
        <Row
          label="Synapses"
          value={connectome ? fmtCompact(connectome.meta.synapseCount) : '--'}
        />
        <Row
          label="Drawable subset"
          value={connectome ? fmtCompact(connectome.meta.exportedEdgeCount) : '--'}
          title="Strongest connections exported to the browser by synapse count."
        />
        {subnetwork && (
          <Row
            label="Active subnetwork"
            value={`${fmtCompact(subnetwork.edgeCount)} edges`}
            title="Exact measured connections among the neurons that fired."
          />
        )}
      </Section>

      {modules.length > 0 && (
        <Section title="Module activity" provenance="derived">
          <p style={{ fontSize: 10, color: 'var(--ink-faint)', lineHeight: 1.5, marginBottom: 8 }}>
            Connectivity communities, not neuropils. Rate is averaged over each
            module&rsquo;s active neurons.
          </p>
          {modules
            .slice()
            .sort((a, b) => b.meanRateHz - a.meanRateHz)
            .map((m) => (
              <Meter
                key={m.moduleId}
                label={`${m.label}  ${m.activeNeurons}/${fmtCompact(m.neuronCount)}`}
                value={m.meanRateHz}
                max={maxModuleRate}
                valueLabel={`${fmt(m.meanRateHz, 1)} Hz`}
                color="var(--derived)"
                active={selectedModule === m.moduleId}
                onClick={() => {
                  selectModule(selectedModule === m.moduleId ? null : m.moduleId);
                  if (selectedModule !== m.moduleId) requestCamera('selection');
                }}
              />
            ))}
        </Section>
      )}
    </>
  );
}
