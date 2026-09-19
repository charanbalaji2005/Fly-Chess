/**
 * The phone layout.
 *
 * A phone has no room for panels around a board, so it gets a different
 * arrangement rather than a shrunken desktop one: a thin status line at the
 * top, the whole middle left clear for the board, and one strip at the
 * bottom carrying both clocks and the actions.
 *
 * Everything optional -- history, neural, settings -- is a bottom sheet
 * behind a 44px button, which is also the only shape of control that is
 * comfortable to hit with a thumb.
 *
 * Safe-area insets are honoured on all four edges, so nothing hides under a
 * notch or a home indicator.
 *
 * Type is held to a floor of 11px for secondary labels and 13px for anything
 * primary. The desktop HUD can afford 9px eyebrows because it is read from
 * 60cm on a large display; a phone is read at arm's length in daylight, and
 * the same sizes there are simply illegible.
 */

/** Smallest secondary label on a phone. Below this it stops being readable. */
const SMALL = 11;

import { useGame } from '../../store';
import { Dot, TONE, label, mono, panel } from './chrome';

const SAFE_TOP = 'env(safe-area-inset-top, 0px)';
const SAFE_BOTTOM = 'env(safe-area-inset-bottom, 0px)';

function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`;
}

export function MobileTopBar({ onExit }: { onExit: () => void }) {
  const turn = useGame((s) => s.turn);
  const players = useGame((s) => s.players);
  const status = useGame((s) => s.status);
  const aiThinking = useGame((s) => s.aiThinking);
  const togglePanel = useGame((s) => s.togglePanel);
  const uiPanel = useGame((s) => s.uiPanel);

  const mover = turn === 'w' ? players[0] : players[1];
  const human = mover.controller === 'HUMAN';

  const line = status.isOver
    ? status.statusText
    : status.inCheck
      ? 'Check'
      : aiThinking
        ? 'AI thinking'
        : human
          ? 'Your turn'
          : `${turn === 'w' ? 'White' : 'Black'} to move`;

  const colour = status.inCheck ? TONE.bad : turn === 'w' ? '#f2efe6' : '#8fa4bd';

  return (
    <div
      className="pointer-events-none absolute inset-x-0 flex items-center justify-between"
      style={{
        top: `calc(8px + ${SAFE_TOP})`,
        paddingLeft: `calc(10px + env(safe-area-inset-left, 0px))`,
        paddingRight: `calc(10px + env(safe-area-inset-right, 0px))`,
        gap: 8,
        zIndex: 10,
      }}
    >
      <div
        className="pointer-events-auto"
        style={{ ...panel(), padding: '7px 12px', flex: 1, minWidth: 0 }}
      >
        {/* the brand, small: enough to know what this is, not a desktop title */}
        <div
          style={{
            ...label,
            fontSize: SMALL,
            color: TONE.accent,
            marginBottom: 2,
            whiteSpace: 'nowrap',
          }}
        >
          Neural Chess
        </div>
        <div className="flex items-center" style={{ gap: 7 }}>
          <Dot color={colour} pulse={aiThinking} />
          <span
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: TONE.ink,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {line}
          </span>
        </div>
        <div style={{ ...label, fontSize: SMALL, marginTop: 2 }}>
          {turn === 'w' ? 'White' : 'Black'}
          {human ? '' : ` · ${mover.aiLevel}`}
        </div>
      </div>

      <TouchButton
        label="Settings"
        active={uiPanel === 'SETTINGS'}
        onClick={() => togglePanel('SETTINGS')}
      >
        ⚙
      </TouchButton>

      <TouchButton label="Leave match" onClick={onExit}>
        ✕
      </TouchButton>
    </div>
  );
}

/**
 * The bottom strip: both clocks, then the actions.
 *
 * Clocks and actions share one surface because two stacked panels at the
 * foot of a phone eat the board.
 */
export function MobileBottomBar({ portrait = true }: { portrait?: boolean }) {
  const players = useGame((s) => s.players);
  const clocks = useGame((s) => s.clocks);
  const turn = useGame((s) => s.turn);
  const timed = useGame((s) => s.config.timePreset) !== 'CASUAL';
  const selectedSquare = useGame((s) => s.selectedSquare);
  const selectSquare = useGame((s) => s.selectSquare);
  const moveHistory = useGame((s) => s.moveHistory);
  const aiThinking = useGame((s) => s.aiThinking);
  const over = useGame((s) => s.status.isOver);
  const mode = useGame((s) => s.config.mode);
  const undoMove = useGame((s) => s.undoMove);
  const resign = useGame((s) => s.resign);
  const togglePanel = useGame((s) => s.togglePanel);
  const uiPanel = useGame((s) => s.uiPanel);

  const canUndo = mode === 'HUMAN_VS_AI' && moveHistory.length > 0 && !aiThinking && !over;

  return (
    <div
      className="pointer-events-auto absolute inset-x-0"
      style={{
        bottom: `calc(8px + ${SAFE_BOTTOM})`,
        paddingLeft: `calc(10px + env(safe-area-inset-left, 0px))`,
        paddingRight: `calc(10px + env(safe-area-inset-right, 0px))`,
        zIndex: 10,
      }}
    >
      <div style={{ ...panel(), padding: '8px 10px' }}>
        {/*
          In landscape the clocks move out to the sides, beside the board,
          and only the actions stay along the bottom -- a phone on its side
          has width to spare and almost no height, so stacking two rows here
          would eat the board.
        */}
        {timed && portrait && (
          <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
            {([0, 1] as const).map((seat) => {
              const active = (turn === 'w') === (seat === 0);
              return (
                <div
                  key={seat}
                  style={{
                    textAlign: seat === 0 ? 'left' : 'right',
                    opacity: active ? 1 : 0.55,
                  }}
                >
                  <div style={{ ...label, fontSize: SMALL }}>{players[seat].color}</div>
                  <div
                    style={{
                      ...mono,
                      fontSize: 21,
                      fontWeight: 700,
                      lineHeight: 1.1,
                      color: active ? TONE.ink : TONE.dim,
                    }}
                  >
                    {clock(clocks[seat])}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* actions: 44px targets, and only the ones that apply */}
        <div className="flex items-center" style={{ gap: 7 }}>
          {selectedSquare && !over ? (
            <TouchWide onClick={() => selectSquare(null)}>Cancel</TouchWide>
          ) : (
            <>
              {canUndo && <TouchWide onClick={undoMove}>↶ Undo</TouchWide>}
              <TouchWide onClick={() => togglePanel('HISTORY')} active={uiPanel === 'HISTORY'}>
                Moves
              </TouchWide>
              <TouchWide onClick={() => togglePanel('NEURAL')} active={uiPanel === 'NEURAL'}>
                🧠
              </TouchWide>
              {!over && (
                <TouchWide onClick={resign} danger>
                  Resign
                </TouchWide>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * A bottom sheet.
 *
 * Slides on `transform` and stays mounted, so opening it does not rebuild
 * its contents and closing it does not drop scroll position.
 */
export function MobileSheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      aria-hidden={!open}
      aria-label={title}
      className="absolute inset-x-0"
      style={{
        bottom: 0,
        zIndex: 60,
        transform: open ? 'translateY(0)' : 'translateY(105%)',
        transition: 'transform 240ms cubic-bezier(0.22,1,0.36,1)',
        pointerEvents: open ? 'auto' : 'none',
      }}
    >
      <div
        style={{
          ...panel({ borderRadius: '16px 16px 0 0' }),
          padding: `12px 14px calc(16px + ${SAFE_BOTTOM})`,
          maxHeight: '58vh',
          overflowY: 'auto',
        }}
      >
        {/* a grab handle, because a sheet without one does not read as one */}
        <div
          style={{
            width: 34,
            height: 4,
            borderRadius: 2,
            background: 'rgba(255,255,255,0.18)',
            margin: '0 auto 11px',
          }}
        />
        <div className="flex items-center justify-between" style={{ marginBottom: 9 }}>
          <span style={{ ...label, fontSize: SMALL }}>{title}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${title}`}
            style={{
              minWidth: 44,
              minHeight: 32,
              border: 'none',
              background: 'none',
              color: TONE.faint,
              fontSize: 15,
              cursor: 'pointer',
            }}
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// touch-sized controls
// ---------------------------------------------------------------------------

function TouchButton({
  children,
  onClick,
  label: name,
  active = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={name}
      title={name}
      className="pointer-events-auto"
      style={{
        ...panel(),
        width: 44,
        height: 44,
        flex: 'none',
        display: 'grid',
        placeItems: 'center',
        fontSize: 16,
        color: active ? TONE.accent : TONE.dim,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function TouchWide({
  children,
  onClick,
  danger = false,
  active = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        minHeight: 44,
        borderRadius: 10,
        border: `1px solid ${
          danger ? 'rgba(244,63,94,0.3)' : active ? 'rgba(94,203,245,0.4)' : 'rgba(255,255,255,0.09)'
        }`,
        background: danger
          ? 'rgba(244,63,94,0.12)'
          : active
            ? 'rgba(94,203,245,0.14)'
            : 'rgba(255,255,255,0.05)',
        color: danger ? '#fca5b5' : active ? TONE.accent : TONE.ink,
        fontSize: 13,
        fontWeight: 700,
        letterSpacing: '0.04em',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

/**
 * Landscape clocks, pinned to the two sides of the board.
 *
 * White on the left, Black on the right, matching where each player sits
 * at the table and where their fly stands in the arena.
 */
export function MobileSideClocks() {
  const players = useGame((s) => s.players);
  const clocks = useGame((s) => s.clocks);
  const turn = useGame((s) => s.turn);
  const timed = useGame((s) => s.config.timePreset) !== 'CASUAL';

  if (!timed) return null;

  return (
    <>
      {([0, 1] as const).map((seat) => {
        const active = (turn === 'w') === (seat === 0);
        return (
          <div
            key={seat}
            className="pointer-events-none absolute"
            style={{
              [seat === 0 ? 'left' : 'right']:
                `calc(10px + env(safe-area-inset-${seat === 0 ? 'left' : 'right'}, 0px))`,
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 10,
            }}
          >
            <div
              style={{
                ...panel(),
                padding: '8px 11px',
                textAlign: 'center',
                opacity: active ? 1 : 0.6,
                transition: 'opacity 200ms ease',
              }}
            >
              <div style={{ ...label, fontSize: SMALL }}>{players[seat].color}</div>
              <div
                style={{
                  ...mono,
                  fontSize: 20,
                  fontWeight: 700,
                  lineHeight: 1.15,
                  color: active ? TONE.ink : TONE.dim,
                }}
              >
                {clock(clocks[seat])}
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}
