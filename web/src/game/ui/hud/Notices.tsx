/**
 * Transient notices, and the one overlay that is allowed to stop the game.
 *
 * Notices sit just under the top bar, never over the board, and clear
 * themselves. The result overlay is the single exception to "nothing covers
 * the centre" -- at that point there is no move left to read.
 */

import { useEffect, useState } from 'react';

import { useGame } from '../../store';
import { TONE, TextButton, label, panel } from './chrome';
import { useViewport } from './useViewport';

const TONE_COLOR = {
  INFO: TONE.accent,
  GOOD: TONE.good,
  WARN: TONE.warn,
  BAD: TONE.bad,
} as const;

/** How long a notice stays up. Long enough to read, short enough to forget. */
const DWELL_MS = 2600;

export function Notice() {
  const notification = useGame((s) => s.notification);
  const dismiss = useGame((s) => s.dismissNotification);

  useEffect(() => {
    if (!notification) return;
    const id = notification.id;
    const handle = setTimeout(() => dismiss(id), DWELL_MS);
    return () => clearTimeout(handle);
  }, [notification, dismiss]);

  if (!notification) return null;

  const colour = TONE_COLOR[notification.tone];

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute inset-x-0 flex justify-center"
      style={{ top: 78, zIndex: 70 }}
    >
      <div
        style={{
          ...panel({ borderColor: `${colour}55` }),
          padding: '7px 16px',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.09em',
          textTransform: 'uppercase',
          color: colour,
          animation: 'hudRise 220ms cubic-bezier(0.22,1,0.36,1)',
        }}
      >
        {notification.text}
      </div>
    </div>
  );
}

/**
 * The result.
 *
 * The one overlay allowed near the middle of the screen, and even then it
 * is deliberately small and only lightly dimmed: the position that produced
 * the result is the most interesting thing on screen at that moment, and
 * the board stays visible behind it. "View board" dismisses it entirely.
 *
 * On a phone it is a bottom sheet, so it cannot overflow a small viewport.
 */
export function GameOverOverlay() {
  const status = useGame((s) => s.status);
  const winner = useGame((s) => s.winner);
  const setScreen = useGame((s) => s.setScreen);
  const resetCamera = useGame((s) => s.resetCamera);
  const { kind } = useViewport();
  const [dismissed, setDismissed] = useState(false);

  // a new result re-opens it
  useEffect(() => {
    if (!status.isOver) setDismissed(false);
  }, [status.isOver]);

  if (!status.isOver || dismissed) return null;

  const mobile = kind === 'MOBILE';

  const headline = status.isCheckmate
    ? 'Checkmate'
    : status.isStalemate
      ? 'Stalemate'
      : status.isDraw
        ? 'Draw'
        : 'Game over';

  // The engine states the reason -- "DRAW - THREEFOLD REPETITION" -- and the
  // headline has already said the first half of it, so show only the rest.
  const reason = status.statusText.includes('-')
    ? status.statusText.split('-').slice(1).join('-').trim()
    : status.statusText;

  return (
    <div
      className="pointer-events-auto absolute inset-0 flex justify-center"
      style={{
        zIndex: 50,
        alignItems: mobile ? 'flex-end' : 'center',
        background: 'rgba(4,7,12,0.4)',
      }}
    >
      <div
        style={{
          ...panel({
            borderColor: 'rgba(240,180,41,0.35)',
            borderRadius: mobile ? '16px 16px 0 0' : undefined,
          }),
          padding: mobile
            ? '22px 22px calc(22px + env(safe-area-inset-bottom, 0px))'
            : '26px 34px',
          textAlign: 'center',
          width: mobile ? '100%' : undefined,
          minWidth: mobile ? undefined : 300,
          animation: 'hudRise 260ms cubic-bezier(0.22,1,0.36,1)',
        }}
      >
        <div
          style={{
            fontSize: 26,
            fontWeight: 900,
            letterSpacing: '0.1em',
            color: TONE.warn,
            textTransform: 'uppercase',
          }}
        >
          {headline}
        </div>

        {winner !== null && (
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: '0.12em',
              color: TONE.ink,
              marginTop: 6,
              textTransform: 'uppercase',
            }}
          >
            {winner === 0 ? 'White' : 'Black'} wins
          </div>
        )}

        <div style={{ ...label, fontSize: 11, marginTop: 8 }}>{reason}</div>

        <div className="flex justify-center flex-wrap" style={{ gap: 8, marginTop: 20 }}>
          <TextButton onClick={() => setScreen('SETUP')} title="Start a new match">
            New game
          </TextButton>
          <TextButton onClick={() => setScreen('RESULT')} title="See the full match record">
            Details
          </TextButton>
          {/* the position is worth looking at; let them */}
          <TextButton
            onClick={() => {
              // put the camera back on the board it is asking them to look at
              resetCamera();
              setDismissed(true);
            }}
            title="Dismiss and study the position"
          >
            View board
          </TextButton>
        </div>
      </div>
    </div>
  );
}
