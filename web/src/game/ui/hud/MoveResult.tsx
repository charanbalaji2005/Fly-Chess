/**
 * What just happened, in three words.
 *
 *     WHITE · e4
 *
 * The notation is the engine's own SAN -- `Bxc6`, `O-O`, `Qh7#` -- never
 * assembled here. If the engine did not produce a move, nothing is shown;
 * there is no code path that can invent one.
 *
 * It appears when the piece lands (the store stamps `lastMoveAt` inside
 * `completeCarry`, not when the move is chosen) and fades after a couple of
 * seconds. The board's own marks on the two squares stay until the next
 * move, so the information does not vanish with the toast -- this is the
 * announcement, the board is the record.
 */

import { useEffect, useState } from 'react';

import { useGame } from '../../store';
import { TONE, mono, panel } from './chrome';
import type { ViewportKind } from './useViewport';

const DWELL_MS = 2200;
const FADE_MS = 320;

export function MoveResult({ kind }: { kind: ViewportKind }) {
  const moveHistory = useGame((s) => s.moveHistory);
  const lastMoveAt = useGame((s) => s.lastMoveAt);
  const carry = useGame((s) => s.carry);
  const isOver = useGame((s) => s.status.isOver);

  const last = moveHistory[moveHistory.length - 1] ?? null;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!last || !lastMoveAt) return;
    setVisible(true);
    const handle = setTimeout(() => setVisible(false), DWELL_MS);
    return () => clearTimeout(handle);
  }, [last, lastMoveAt]);

  // While the next piece is already travelling, the previous result is
  // stale; and once the match is decided the result overlay speaks instead.
  if (!last || carry || isOver) return null;

  const white = last.color === 'w';

  // Mobile puts it under the board, where the eye already is after a move.
  // Desktop tucks it under the turn status so the top bar stays one column.
  const placement =
    kind === 'MOBILE'
      ? { bottom: 'calc(150px + env(safe-area-inset-bottom, 0px))', top: 'auto' }
      : kind === 'TABLET'
        ? { bottom: 96, top: 'auto' }
        : { top: 86, bottom: 'auto' };

  return (
    <div
      className="pointer-events-none absolute inset-x-0 flex justify-center"
      style={{ ...placement, zIndex: 20 }}
      aria-live="polite"
    >
      <div
        style={{
          ...panel({
            borderColor: white ? 'rgba(242,239,230,0.22)' : 'rgba(143,164,189,0.26)',
          }),
          padding: '6px 14px',
          display: 'flex',
          alignItems: 'baseline',
          gap: 9,
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(4px)',
          transition: `opacity ${FADE_MS}ms ease, transform ${FADE_MS}ms ease`,
        }}
      >
        <span
          style={{
            fontSize: 9.5,
            fontWeight: 800,
            letterSpacing: '0.14em',
            color: white ? '#f2efe6' : '#8fa4bd',
          }}
        >
          {white ? 'WHITE' : 'BLACK'}
        </span>
        <span
          style={{
            ...mono,
            fontSize: 15,
            fontWeight: 700,
            color: TONE.ink,
            letterSpacing: '0.02em',
          }}
        >
          {last.san}
        </span>
        {last.isCapture && !last.san.includes('#') && (
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: TONE.bad }}>
            CAPTURE
          </span>
        )}
      </div>
    </div>
  );
}
