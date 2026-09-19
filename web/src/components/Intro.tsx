/**
 * Entry state and connectome loading.
 *
 * The intro is one screen and one button, because the point of the product is
 * on the other side of it. Loading steps report what is actually being read
 * and how big it was; no step is faked and no progress bar is animated past
 * work that has not happened.
 */

import { useEffect } from 'react';

import { useStore } from '../store/useStore';
import { fmtCompact } from './ui/primitives';

export function Intro() {
  const enter = useStore((s) => s.enter);
  const bootstrap = useStore((s) => s.bootstrap);
  const connectome = useStore((s) => s.connectome);
  const loadError = useStore((s) => s.loadError);

  // Start loading behind the intro so the button is rarely a wait.
  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const ready = Boolean(connectome);

  return (
    <div
      className="fixed inset-0 grid place-items-center px-6"
      style={{ background: 'radial-gradient(ellipse at 50% 40%, #0a1420 0%, #04060a 70%)' }}
    >
      <div className="w-full" style={{ maxWidth: 560 }}>
        <div className="label mb-4" style={{ color: 'var(--measured)' }}>
          FlyWire 783 connectome &middot; spiking network model
        </div>

        <h1
          style={{
            fontSize: 'clamp(34px, 7vw, 62px)',
            lineHeight: 0.95,
            fontWeight: 600,
            letterSpacing: '-0.035em',
            margin: 0,
          }}
        >
          Drosophila
          <br />
          <span style={{ color: 'var(--ink-dim)' }}>Neural Laboratory</span>
        </h1>

        <p
          className="mt-5"
          style={{ color: 'var(--ink-dim)', fontSize: 14, maxWidth: 460, lineHeight: 1.6 }}
        >
          Open a fruit fly, look inside its head, stimulate its neurons and watch
          the network respond. The wiring is measured. The activity is simulated
          by the model in this repository. The body is drawn.
        </p>

        <div className="mt-8 grid grid-cols-3 gap-5" style={{ maxWidth: 420 }}>
          <Figure
            value={connectome ? fmtCompact(connectome.meta.neuronCount) : '138,639'}
            label="neurons"
          />
          <Figure
            value={connectome ? fmtCompact(connectome.meta.connectionCount) : '15.09M'}
            label="connections"
          />
          <Figure
            value={connectome ? fmtCompact(connectome.meta.synapseCount) : '54.5M'}
            label="synapses"
          />
        </div>

        <div className="mt-9 flex items-center gap-4 flex-wrap">
          <button
            type="button"
            onClick={enter}
            disabled={!ready && !loadError}
            className="num"
            style={{
              padding: '11px 26px',
              fontSize: 11,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: ready ? '#04060a' : 'var(--ink-dim)',
              background: ready ? 'var(--measured)' : 'transparent',
              border: `1px solid ${ready ? 'var(--measured)' : 'var(--hairline-strong)'}`,
              cursor: ready || loadError ? 'pointer' : 'wait',
              transition: 'background 200ms ease, color 200ms ease',
            }}
          >
            {loadError ? 'Continue anyway' : ready ? 'Enter laboratory' : 'Loading connectome'}
          </button>

          {!ready && !loadError && (
            <span className="num pulse" style={{ fontSize: 10, color: 'var(--ink-faint)' }}>
              reading 8.2 MB of connectome artefacts
            </span>
          )}
        </div>

        {loadError && (
          <div
            className="mt-5 p-3"
            style={{
              border: '1px solid rgba(242,99,126,0.4)',
              background: 'rgba(242,99,126,0.07)',
              fontSize: 11.5,
              color: 'var(--ink-dim)',
            }}
          >
            <div className="label mb-1" style={{ color: 'var(--inhibitory)' }}>
              Connectome data unavailable
            </div>
            {loadError}
          </div>
        )}

        <p className="mt-10" style={{ fontSize: 10.5, color: 'var(--ink-faint)', lineHeight: 1.65 }}>
          The fly body and the neuropil shells are a procedural visualisation.
          This repository ships no anatomical mesh and no soma coordinates, so
          neuron positions are a layout derived from measured connectivity, not
          anatomical locations. Every figure in the interface is labelled with
          where it came from.
        </p>
      </div>
    </div>
  );
}

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div
        className="num"
        style={{ fontSize: 21, fontWeight: 500, letterSpacing: '-0.02em' }}
      >
        {value}
      </div>
      <div className="label mt-[2px]">{label}</div>
    </div>
  );
}

/** Step-by-step loading report, shown once the laboratory is open. */
export function LoadingOverlay() {
  const steps = useStore((s) => s.loadSteps);
  const connectome = useStore((s) => s.connectome);
  const loadError = useStore((s) => s.loadError);

  if (connectome || loadError) return null;

  return (
    <div
      className="absolute inset-0 z-30 grid place-items-center"
      style={{ background: 'rgba(4,6,10,0.88)', backdropFilter: 'blur(6px)' }}
    >
      <div className="panel p-5" style={{ minWidth: 330 }}>
        <div className="label mb-3">Initialising fly brain</div>
        {steps.map((step) => (
          <div key={step.key} className="flex items-baseline gap-2 py-[3px]">
            <span
              className="num"
              style={{
                width: 12,
                color:
                  step.state === 'done'
                    ? 'var(--measured)'
                    : step.state === 'error'
                      ? 'var(--inhibitory)'
                      : 'var(--ink-faint)',
              }}
            >
              {step.state === 'done' ? '✓' : step.state === 'error' ? '✗' : '·'}
            </span>
            <span
              className="flex-1"
              style={{
                fontSize: 11.5,
                color: step.state === 'pending' ? 'var(--ink-faint)' : 'var(--ink-dim)',
              }}
            >
              {step.label}
            </span>
            <span className="num" style={{ fontSize: 9.5, color: 'var(--ink-faint)' }}>
              {step.detail ?? ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
