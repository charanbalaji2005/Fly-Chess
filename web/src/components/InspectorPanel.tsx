/**
 * Right column: inspector for whatever is selected, then run analytics.
 *
 * Three things can be selected and each gets a different inspector: a neuron
 * (measured record plus simulated activity), a connectivity module (derived),
 * or a body part (drawn geometry, and an honest note that the datasets say
 * nothing about it).
 */

import { useEffect, useState } from 'react';

import * as api from '../api/client';
import { neuronRateHz, neuronSpikeTimes } from '../data/activity';
import { FLY_PART_BY_KEY } from '../three/flyAnatomy';
import { useStore } from '../store/useStore';
import type { PartnerResponse } from '../types';
import { AnalyticsPanel } from './AnalyticsPanel';
import { MembraneTrace, SpikeTrainStrip } from './NeuronCharts';
import {
  Button,
  ProvenanceBadge,
  Row,
  Section,
  SegmentedControl,
  Unavailable,
  fmt,
  fmtCompact,
  fmtFlywire,
  fmtInt,
} from './ui/primitives';

export function InspectorPanel() {
  const selectedNeuron = useStore((s) => s.selectedNeuron);
  const selectedModule = useStore((s) => s.selectedModule);
  const selectedPart = useStore((s) => s.selectedPart);

  return (
    <div className="h-full overflow-y-auto" style={{ background: 'rgba(8,12,18,0.72)' }}>
      {selectedNeuron !== null && <NeuronInspector index={selectedNeuron} />}
      {selectedNeuron === null && selectedModule !== null && (
        <ModuleInspector moduleId={selectedModule} />
      )}
      {selectedNeuron === null && selectedModule === null && selectedPart && (
        <PartInspector partKey={selectedPart} />
      )}
      {selectedNeuron === null && selectedModule === null && !selectedPart && <NothingSelected />}
      <AnalyticsPanel />
    </div>
  );
}

function NothingSelected() {
  return (
    <Section title="Inspector">
      <p style={{ fontSize: 11.5, color: 'var(--ink-faint)', lineHeight: 1.6 }}>
        Click a neuron in the 3D view, a body part, or a module in the activity
        list. Search by FlyWire ID to jump straight to one.
      </p>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// neuron
// ---------------------------------------------------------------------------

function NeuronInspector({ index }: { index: number }) {
  const record = useStore((s) => s.neuronRecord);
  const error = useStore((s) => s.inspectorError);
  const spikeIndex = useStore((s) => s.spikeIndex);
  const traces = useStore((s) => s.traces);
  const connectome = useStore((s) => s.connectome);
  const selectNeuron = useStore((s) => s.selectNeuron);
  const requestCamera = useStore((s) => s.requestCamera);
  const setRateScope = useStore((s) => s.setRateScope);

  const [direction, setDirection] = useState<'in' | 'out'>('out');
  const [partners, setPartners] = useState<PartnerResponse | null>(null);
  const [partnerError, setPartnerError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPartners(null);
    setPartnerError(null);
    api
      .getPartners(index, direction, 60)
      .then((response) => {
        if (!cancelled) setPartners(response);
      })
      .catch((e: unknown) => {
        if (!cancelled) setPartnerError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [index, direction]);

  const spikeCount = spikeIndex ? spikeIndex.countsByNeuron[index] : null;
  const rate = spikeIndex ? neuronRateHz(spikeIndex, index) : null;
  const spikeTimes = spikeIndex ? neuronSpikeTimes(spikeIndex, index) : [];
  const trace = traces?.probes.find((p) => p.neuronIndex === index);
  const moduleId = connectome?.moduleIds[index];

  return (
    <>
      <Section
        title="Neuron"
        provenance="measured"
        actions={
          <div className="flex gap-1">
            <Button variant="ghost" onClick={() => requestCamera('selection')} title="Focus camera">
              Focus
            </Button>
            <Button variant="ghost" onClick={() => void selectNeuron(null)} title="Clear selection">
              &times;
            </Button>
          </div>
        }
      >
        {error && (
          <p style={{ fontSize: 11, color: 'var(--inhibitory)', lineHeight: 1.5 }}>{error}</p>
        )}

        <Row label="Index" value={`#${index}`} />
        <Row
          label="FlyWire ID"
          value={record ? fmtFlywire(record.flywireId) : '…'}
          title="Identifier in the FlyWire 783 reconstruction"
        />
        <Row
          label="Cell type"
          value={
            record ? (
              record.cellType ?? (
                <Unavailable reason="The datasets name only 101 SEZ cell types; this neuron is not among them." />
              )
            ) : (
              '…'
            )
          }
        />
        <Row
          label="Region"
          value={
            <Unavailable reason="data/2025_Completeness_783.csv contains no neuropil annotation for any neuron." />
          }
        />
        <Row
          label="Module"
          value={
            moduleId !== undefined ? (
              <span>
                {`Module ${String(moduleId + 1).padStart(2, '0')}`}{' '}
                <ProvenanceBadge kind="derived" compact />
              </span>
            ) : (
              '--'
            )
          }
          title="Connectivity community derived from the measured graph, not an anatomical region."
        />
      </Section>

      <Section title="Connectivity" provenance="measured">
        <Row label="Incoming" value={record ? fmtInt(record.inDegree) : '…'} />
        <Row label="Outgoing" value={record ? fmtInt(record.outDegree) : '…'} />
        <Row label="Input synapses" value={record ? fmtInt(record.inSynapses) : '…'} />
        <Row label="Output synapses" value={record ? fmtInt(record.outSynapses) : '…'} />
        <Row
          label="Excitatory output"
          value={
            record ? (
              record.excitatoryFraction === null ? (
                <Unavailable reason="This neuron has no outgoing synapses to compute a ratio from." />
              ) : (
                `${fmt(record.excitatoryFraction * 100, 0)}%`
              )
            ) : (
              '…'
            )
          }
        />
      </Section>

      <Section title="Activity" provenance="simulated">
        {!spikeIndex && (
          <p style={{ fontSize: 11, color: 'var(--ink-faint)', lineHeight: 1.5 }}>
            No simulation loaded. Run one to see this neuron&rsquo;s spikes.
          </p>
        )}
        {spikeIndex && (
          <>
            <Row
              label="Status"
              value={
                spikeCount && spikeCount > 0 ? (
                  <span style={{ color: 'var(--measured)' }}>ACTIVE</span>
                ) : (
                  <span style={{ color: 'var(--ink-faint)' }}>SILENT</span>
                )
              }
            />
            <Row label="Spike count" value={fmtInt(spikeCount ?? 0)} />
            <Row label="Firing rate" value={`${fmt(rate ?? 0, 2)} Hz`} />
            <button
              type="button"
              onClick={() => setRateScope({ kind: 'neuron', neuronIndex: index })}
              className="num"
              style={{
                marginTop: 4,
                background: 'transparent',
                border: '1px solid var(--hairline)',
                color: 'var(--ink-dim)',
                fontSize: 9.5,
                padding: '3px 7px',
                cursor: 'pointer',
              }}
            >
              PLOT RATE
            </button>

            {spikeTimes.length > 0 && (
              <div className="mt-3">
                <div className="label mb-1">Spike train</div>
                <SpikeTrainStrip times={spikeTimes} />
              </div>
            )}

            <div className="mt-3">
              <div className="label mb-1">Membrane potential</div>
              {trace && traces ? (
                <MembraneTrace
                  times={traces.timesMs}
                  voltages={trace.voltageMv}
                  threshold={traces.thresholdMv}
                  rest={traces.restMv}
                />
              ) : (
                <p style={{ fontSize: 10.5, color: 'var(--ink-faint)', lineHeight: 1.5 }}>
                  Not recorded. Add this neuron to the probe set in the stimulus
                  panel and re-run &mdash; voltage is only stored for probed
                  neurons, since keeping it for all 138,639 would be gigabytes.
                </p>
              )}
            </div>
          </>
        )}
      </Section>

      <Section
        title="Synaptic partners"
        provenance="measured"
        actions={
          <div style={{ width: 128 }}>
            <SegmentedControl
              options={[
                { value: 'in', label: 'Incoming' },
                { value: 'out', label: 'Outgoing' },
              ]}
              value={direction}
              onChange={setDirection}
            />
          </div>
        }
      >
        {partnerError && (
          <p style={{ fontSize: 11, color: 'var(--inhibitory)' }}>{partnerError}</p>
        )}
        {!partners && !partnerError && (
          <p style={{ fontSize: 11, color: 'var(--ink-faint)' }}>Loading&hellip;</p>
        )}
        {partners && (
          <>
            <div style={{ maxHeight: 220, overflow: 'auto' }}>
              {partners.partners.map((partner) => (
                <button
                  key={partner.neuronIndex}
                  type="button"
                  onClick={() => void selectNeuron(partner.neuronIndex, false)}
                  className="w-full text-left flex items-center justify-between gap-2 py-[3px]"
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                >
                  <span className="num truncate" style={{ fontSize: 10.5, color: 'var(--ink-dim)' }}>
                    #{partner.neuronIndex}
                    {partner.cellType && (
                      <span style={{ color: 'var(--measured)' }}> {partner.cellType}</span>
                    )}
                  </span>
                  <span
                    className="num shrink-0"
                    style={{
                      fontSize: 10,
                      color: partner.sign > 0 ? 'var(--excitatory)' : 'var(--inhibitory)',
                    }}
                    title={partner.sign > 0 ? 'Excitatory' : 'Inhibitory'}
                  >
                    {partner.sign > 0 ? '+' : '−'}
                    {fmtInt(partner.synapses)}
                  </span>
                </button>
              ))}
            </div>
            {partners.truncated && (
              <p style={{ fontSize: 10, color: 'var(--ink-faint)', marginTop: 6 }}>
                Showing the {partners.returned} strongest of {fmtInt(partners.total)}{' '}
                {direction === 'in' ? 'inputs' : 'outputs'}.
              </p>
            )}
          </>
        )}
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------
// module
// ---------------------------------------------------------------------------

function ModuleInspector({ moduleId }: { moduleId: number }) {
  const connectome = useStore((s) => s.connectome);
  const spikeIndex = useStore((s) => s.spikeIndex);
  const selectModule = useStore((s) => s.selectModule);
  const requestCamera = useStore((s) => s.requestCamera);
  const setRateScope = useStore((s) => s.setRateScope);

  const mod = connectome?.modules.modules.find((m) => m.id === moduleId);
  if (!mod || !connectome) return null;

  let activeNeurons = 0;
  let spikeCount = 0;
  if (spikeIndex) {
    for (let i = 0; i < connectome.neuronCount; i++) {
      if (connectome.moduleIds[i] !== moduleId) continue;
      const c = spikeIndex.countsByNeuron[i];
      if (c > 0) {
        activeNeurons++;
        spikeCount += c;
      }
    }
  }
  const seconds = spikeIndex
    ? (spikeIndex.durationMs / 1000) * Math.max(spikeIndex.trials, 1)
    : 0;

  return (
    <>
      <Section
        title="Module"
        provenance="derived"
        actions={
          <div className="flex gap-1">
            <Button variant="ghost" onClick={() => requestCamera('selection')}>
              Focus
            </Button>
            <Button variant="ghost" onClick={() => selectModule(null)}>
              &times;
            </Button>
          </div>
        }
      >
        <div
          className="mb-2 p-2"
          style={{ background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.3)' }}
        >
          <p style={{ fontSize: 10.5, color: 'var(--ink-dim)', lineHeight: 1.5 }}>
            A connectivity community found by clustering the measured graph
            &mdash; <strong>not</strong> an anatomical neuropil. The datasets
            carry no region labels, so mushroom body, central complex and the
            rest cannot be identified from them.
          </p>
        </div>

        <Row label="Label" value={mod.label} />
        <Row label="Neurons" value={fmtInt(mod.neuronCount)} />
        <Row label="Internal connections" value={fmtCompact(mod.internalEdges)} />
        <Row label="Outgoing connections" value={fmtCompact(mod.outgoingEdges)} />
        <Row label="Incoming connections" value={fmtCompact(mod.incomingEdges)} />
        <Row label="Mean out-degree" value={fmt(mod.meanOutDegree, 1)} />
        <Row
          label="Named SEZ neurons"
          value={mod.sezNeurons > 0 ? fmtInt(mod.sezNeurons) : '0'}
          title="Neurons in this module that appear in data/sez_neurons.pickle"
        />
      </Section>

      <Section title="Module activity" provenance="simulated">
        {!spikeIndex && (
          <p style={{ fontSize: 11, color: 'var(--ink-faint)' }}>No simulation loaded.</p>
        )}
        {spikeIndex && (
          <>
            <Row label="Active neurons" value={fmtInt(activeNeurons)} />
            <Row
              label="Fraction active"
              value={`${fmt((activeNeurons / Math.max(mod.neuronCount, 1)) * 100, 2)}%`}
            />
            <Row label="Spikes" value={fmtInt(spikeCount)} />
            <Row
              label="Mean rate"
              value={
                activeNeurons > 0
                  ? `${fmt(spikeCount / activeNeurons / seconds, 2)} Hz`
                  : '0 Hz'
              }
              title="Averaged over active neurons in this module."
            />
            <button
              type="button"
              onClick={() => setRateScope({ kind: 'module', moduleId })}
              className="num"
              style={{
                marginTop: 6,
                background: 'transparent',
                border: '1px solid var(--hairline)',
                color: 'var(--ink-dim)',
                fontSize: 9.5,
                padding: '3px 7px',
                cursor: 'pointer',
              }}
            >
              PLOT RATE
            </button>
          </>
        )}
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------
// body part
// ---------------------------------------------------------------------------

function PartInspector({ partKey }: { partKey: string }) {
  const part = FLY_PART_BY_KEY.get(partKey as never);
  const selectPart = useStore((s) => s.selectPart);
  const setViewMode = useStore((s) => s.setViewMode);
  const requestCamera = useStore((s) => s.requestCamera);

  if (!part) return null;

  const isHead = part.key === 'head';

  return (
    <Section
      title="Body part"
      provenance="approximation"
      actions={
        <Button variant="ghost" onClick={() => selectPart(null)}>
          &times;
        </Button>
      }
    >
      <Row label="Part" value={part.label} />
      <Row label="Region" value={part.group} />

      <p style={{ fontSize: 10.5, color: 'var(--ink-faint)', lineHeight: 1.55, marginTop: 8 }}>
        {part.dataNote}
      </p>

      <div className="flex gap-1 mt-3">
        {isHead && (
          <Button
            variant="primary"
            onClick={() => {
              setViewMode('xray');
              requestCamera('brain');
            }}
          >
            Look inside
          </Button>
        )}
        <Button onClick={() => requestCamera(part.key.startsWith('eye') ? part.key : 'whole')}>
          Focus
        </Button>
      </div>
    </Section>
  );
}
