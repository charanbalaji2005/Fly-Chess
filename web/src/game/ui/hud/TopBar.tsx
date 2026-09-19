/**
 * The top bar: brand, whose move it is, three actions.
 *
 * What used to live here -- six camera tabs, a telemetry toggle, a whole
 * brain button, a captioned pause button and a search-depth readout -- was
 * most of the screen's visual weight and none of its content. Camera presets
 * are a menu, telemetry is a developer setting, and the brain is a drawer.
 *
 * Search statistics in particular are gone from normal play. `Depth 4 /
 * Nodes 1311 / 1627ms` is something a developer reads while tuning the
 * engine; to a player it is noise that changes every second.
 */

import { useGame, type CameraPreset } from '../../store';
import { Dot, IconButton, TONE, label, panel } from './chrome';

const VIEWS: { id: CameraPreset; name: string }[] = [
  { id: 'BOARD', name: 'Board' },
  { id: 'WHITE', name: 'White side' },
  { id: 'BLACK', name: 'Black side' },
  { id: 'PIECE', name: 'Piece' },
  { id: 'NEURAL', name: 'Neural' },
  { id: 'SPECTATOR', name: 'Stands' },
];

export function TopBar({ onExit }: { onExit: () => void }) {
  const turn = useGame((s) => s.turn);
  const status = useGame((s) => s.status);
  const players = useGame((s) => s.players);
  const aiThinking = useGame((s) => s.aiThinking);
  const paused = useGame((s) => s.paused);
  const setPaused = useGame((s) => s.setPaused);
  const uiPanel = useGame((s) => s.uiPanel);
  const togglePanel = useGame((s) => s.togglePanel);
  const setUiPanel = useGame((s) => s.setUiPanel);
  const brainVisOpen = useGame((s) => s.brainVisOpen);
  const toggleBrainVis = useGame((s) => s.toggleBrainVis);
  const camera = useGame((s) => s.camera);
  const setCamera = useGame((s) => s.setCamera);
  const aiLevel = useGame((s) => s.config.aiLevel);

  const mover = turn === 'w' ? players[0] : players[1];
  const human = mover.controller === 'HUMAN';

  // One source of truth for the game's status line. It used to be stated in
  // three places at once, in three different wordings.
  const statusLine = status.isOver
    ? status.statusText
    : aiThinking
      ? 'Fly AI thinking'
      : human
        ? 'Your turn'
        : `${turn === 'w' ? 'White' : 'Black'} to move`;

  const statusColor = status.isOver
    ? TONE.warn
    : status.inCheck
      ? TONE.bad
      : turn === 'w'
        ? '#f2efe6'
        : '#8fa4bd';

  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3"
      style={{ padding: '12px 12px 0', zIndex: 10 }}
    >
      {/* --- brand ------------------------------------------------------ */}
      <div className="pointer-events-auto" style={{ ...panel(), padding: '7px 13px' }}>
        <div style={{ ...label, fontSize: 8.5, color: TONE.accent, marginBottom: 1 }}>
          Drosophila
        </div>
        <div
          style={{
            fontSize: 13,
            fontWeight: 800,
            letterSpacing: '0.06em',
            color: TONE.ink,
            lineHeight: 1,
          }}
        >
          NEURAL CHESS
        </div>
      </div>

      {/* --- whose move ------------------------------------------------- */}
      <div
        className="pointer-events-auto"
        style={{ ...panel(), padding: '7px 15px', textAlign: 'center', minWidth: 168 }}
      >
        <div className="flex items-center justify-center" style={{ gap: 7 }}>
          <Dot color={statusColor} pulse={aiThinking} />
          <span
            style={{
              fontSize: 11.5,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: TONE.ink,
            }}
          >
            {statusLine}
          </span>
        </div>
        <div style={{ ...label, fontSize: 8.5, marginTop: 2 }}>
          {status.isOver ? 'Match over' : human ? `Your turn · vs AI (${aiLevel})` : `Fly AI · Level: ${mover.aiLevel ?? aiLevel}`}
        </div>
      </div>

      {/* --- actions ----------------------------------------------------- */}
      <div className="pointer-events-auto flex items-start" style={{ gap: 6 }}>
        <div style={{ position: 'relative' }}>
          <IconButton
            title="Camera view"
            active={uiPanel === 'VIEW'}
            onClick={() => togglePanel('VIEW')}
          >
            <EyeIcon />
          </IconButton>

          {uiPanel === 'VIEW' && (
            <div
              style={{
                ...panel(),
                position: 'absolute',
                top: 40,
                right: 0,
                width: 150,
                padding: 5,
              }}
            >
              {VIEWS.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => {
                    setCamera(v.id);
                    setUiPanel('NONE');
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '6px 9px',
                    borderRadius: 8,
                    border: 'none',
                    background: camera === v.id ? 'rgba(94,203,245,0.14)' : 'transparent',
                    color: camera === v.id ? TONE.accent : TONE.dim,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {v.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <IconButton
          title="FlyWire Connectome Brain Map (Hide/Show)"
          active={brainVisOpen}
          onClick={toggleBrainVis}
        >
          <BrainIcon />
        </IconButton>

        <IconButton
          title="Settings"
          active={uiPanel === 'SETTINGS'}
          onClick={() => togglePanel('SETTINGS')}
        >
          <GearIcon />
        </IconButton>

        <IconButton title={paused ? 'Resume' : 'Pause game'} onClick={() => setPaused(!paused)}>
          {paused ? <PlayIcon /> : <PauseIcon />}
        </IconButton>

        <IconButton title="Leave match" onClick={onExit}>
          <CloseIcon />
        </IconButton>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// icons
//
// One family, drawn inline: a single stroke weight and a single 24-unit grid,
// rather than the mix of emoji and unicode the old bar used.
// ---------------------------------------------------------------------------

const stroke = {
  width: 15,
  height: 15,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

const EyeIcon = () => (
  <svg {...stroke}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const BrainIcon = () => (
  <svg {...stroke}>
    <path d="M9.5 3A2.5 2.5 0 0 0 7 5.5 2.5 2.5 0 0 0 5 8a2.5 2.5 0 0 0 .5 1.5A2.5 2.5 0 0 0 5 13a2.5 2.5 0 0 0 2 2.4V17a2.5 2.5 0 0 0 5 0V5.5A2.5 2.5 0 0 0 9.5 3Z" />
    <path d="M14.5 3A2.5 2.5 0 0 1 17 5.5 2.5 2.5 0 0 1 19 8a2.5 2.5 0 0 1-.5 1.5A2.5 2.5 0 0 1 19 13a2.5 2.5 0 0 1-2 2.4V17a2.5 2.5 0 0 1-5 0" />
  </svg>
);

const GearIcon = () => (
  <svg {...stroke}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" />
  </svg>
);

const PauseIcon = () => (
  <svg {...stroke}>
    <rect x="6" y="4" width="4" height="16" rx="1" />
    <rect x="14" y="4" width="4" height="16" rx="1" />
  </svg>
);

const PlayIcon = () => (
  <svg {...stroke}>
    <path d="M6 4l14 8-14 8V4Z" />
  </svg>
);

const CloseIcon = () => (
  <svg {...stroke}>
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);
