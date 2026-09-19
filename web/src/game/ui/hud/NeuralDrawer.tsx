/**
 * The neural drawer, and the developer readout inside it.
 *
 * Everything scientific now lives behind one button. That is a deliberate
 * demotion: the six channels are genuinely interesting, but a player
 * deciding on a move does not need them on screen, and permanently
 * displaying search telemetry is what made the old interface read as a
 * debugging tool.
 *
 * Search statistics appear only with Developer Mode on. They describe the
 * engine, not the game.
 */

import { useGame } from '../../store';
import { NEURAL_CHANNELS, NEURAL_LABELS } from '../../neural/state';
import { Drawer, Meter, TONE, TextButton, label, mono } from './chrome';

const CHANNEL_COLOR: Record<string, string> = {
  visual: '#5ecbf5',
  attention: '#7dd3fc',
  decision: '#a78bfa',
  motor: '#4ade80',
  threat: '#f43f5e',
  reward: '#f0b429',
};

export function NeuralDrawer() {
  const uiPanel = useGame((s) => s.uiPanel);
  const setUiPanel = useGame((s) => s.setUiPanel);

  return (
    <Drawer open={uiPanel === 'NEURAL'} title="Neural state" onClose={() => setUiPanel('NONE')}>
      <NeuralReadout />
    </Drawer>
  );
}

/**
 * The readout itself, without the drawer around it.
 *
 * Shared by the desktop drawer and the phone's bottom sheet, so the two can
 * never show different channels.
 */
export function NeuralReadout() {
  const neuralState = useGame((s) => s.neuralState);
  const carry = useGame((s) => s.carry);
  const aiThinking = useGame((s) => s.aiThinking);
  const aiMetrics = useGame((s) => s.aiMetrics);
  const developer = useGame((s) => s.settings.debugOverlay);
  const selectedSquare = useGame((s) => s.selectedSquare);

  // What the fly is doing, in one phrase, derived from what is actually
  // happening rather than from a separate animation clock.
  const activity = carry
    ? 'Motor execution'
    : aiThinking
      ? 'Search'
      : selectedSquare
        ? 'Target acquisition'
        : 'Idle';

  const toggleBrainVis = useGame((s) => s.toggleBrainVis);

  return (
    <>
      {NEURAL_CHANNELS.map((c) => (
        <Meter
          key={c}
          name={NEURAL_LABELS[c]}
          value={neuralState[c]}
          color={CHANNEL_COLOR[c] ?? TONE.accent}
        />
      ))}

      <div
        style={{
          marginTop: 10,
          paddingTop: 9,
          borderTop: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        <div style={label}>State</div>
        <div style={{ fontSize: 12, fontWeight: 700, color: TONE.ink, marginTop: 2 }}>
          {activity}
        </div>

        {carry && (
          <>
            <div style={{ ...label, marginTop: 8 }}>Target</div>
            <div
              style={{
                ...mono,
                fontSize: 12,
                color: TONE.accent,
                marginTop: 2,
                textTransform: 'uppercase',
              }}
            >
              {carry.to}
            </div>
          </>
        )}
      </div>

      {/* Engine internals: developers only. */}
      {developer && aiMetrics && (
        <div
          style={{
            marginTop: 10,
            paddingTop: 9,
            borderTop: '1px solid rgba(255,255,255,0.07)',
          }}
        >
          <div style={{ ...label, marginBottom: 4 }}>Search</div>
          {[
            ['Depth', String(aiMetrics.depth)],
            ['Nodes', aiMetrics.nodes.toLocaleString()],
            ['Time', `${aiMetrics.timeMs} ms`],
            ['Score', aiMetrics.score.toFixed(2)],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between" style={{ ...mono, fontSize: 10 }}>
              <span style={{ color: TONE.faint }}>{k}</span>
              <span style={{ color: TONE.dim }}>{v}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        <TextButton onClick={toggleBrainVis} title="Open the 3D whole-brain connectome visualization">
          FlyWire 3D Connectome Map
        </TextButton>
      </div>

      {/*
        Kept from the old telemetry modal, because it is the honest part.
        These channels are computed from the chess position; they are not
        the measured connectome, and the panel should not let anyone think
        otherwise.
      */}
      <p
        style={{
          marginTop: 11,
          fontSize: 9,
          lineHeight: 1.5,
          color: TONE.faint,
        }}
      >
        These channels are computed from the 8×8 position. The measured
        Drosophila whole-brain connectome is in the Neural Lab.
      </p>
    </>
  );
}
