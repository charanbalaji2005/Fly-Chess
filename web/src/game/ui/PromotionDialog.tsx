/**
 * Choosing what the pawn becomes.
 *
 * Deliberately small and un-dimmed. The old version blacked out the whole
 * scene behind a full-screen scrim, which hides the one thing the player
 * needs in order to choose: the position the new piece is about to join.
 *
 * On a phone it is a bottom sheet with thumb-sized targets; everywhere else
 * a compact panel low on the screen, clear of the board's centre.
 */

import { useGame } from '../store';
import { TONE, label, panel } from './hud/chrome';
import { useViewport } from './hud/useViewport';
import type { PieceType } from '../chessEngine';

const OPTIONS: { type: PieceType; name: string; white: string; black: string }[] = [
  { type: 'q', name: 'Queen', white: '♕', black: '♛' },
  { type: 'r', name: 'Rook', white: '♖', black: '♜' },
  { type: 'b', name: 'Bishop', white: '♗', black: '♝' },
  { type: 'n', name: 'Knight', white: '♘', black: '♞' },
];

export function PromotionDialog() {
  const phase = useGame((s) => s.phase);
  const choosePromotion = useGame((s) => s.choosePromotion);
  const pending = useGame((s) => s.pendingPromotion);
  const turn = useGame((s) => s.turn);
  const { kind } = useViewport();

  if (phase !== 'PROMOTION_DIALOG') return null;

  const mobile = kind === 'MOBILE';
  const white = turn === 'w';

  return (
    <div
      className="pointer-events-none absolute inset-x-0 flex justify-center"
      style={{
        bottom: mobile ? 0 : 92,
        zIndex: 50,
        paddingLeft: 10,
        paddingRight: 10,
      }}
    >
      <div
        className="pointer-events-auto"
        style={{
          ...panel({
            borderColor: 'rgba(240,180,41,0.35)',
            borderRadius: mobile ? '16px 16px 0 0' : undefined,
          }),
          padding: mobile
            ? '14px 16px calc(18px + env(safe-area-inset-bottom, 0px))'
            : '13px 16px',
          width: mobile ? '100%' : 'auto',
          animation: 'hudRise 200ms cubic-bezier(0.22,1,0.36,1)',
        }}
      >
        <div className="flex items-baseline justify-between" style={{ marginBottom: 9 }}>
          <span style={{ ...label, color: TONE.warn }}>Promote</span>
          {pending && (
            <span
              style={{
                fontSize: 10,
                color: TONE.faint,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              {pending.from} → {pending.to}
            </span>
          )}
        </div>

        <div className="flex" style={{ gap: 8 }}>
          {OPTIONS.map((opt) => (
            <button
              key={opt.type}
              type="button"
              onClick={() => choosePromotion(opt.type)}
              aria-label={`Promote to ${opt.name}`}
              title={opt.name}
              style={{
                flex: 1,
                // 44px is the smallest target that is comfortable to tap
                minWidth: 52,
                minHeight: mobile ? 56 : 48,
                borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.05)',
                color: TONE.ink,
                cursor: 'pointer',
                display: 'grid',
                placeItems: 'center',
                gap: 1,
              }}
            >
              <span style={{ fontSize: mobile ? 26 : 22, lineHeight: 1 }}>
                {white ? opt.white : opt.black}
              </span>
              <span style={{ ...label, fontSize: 8 }}>{opt.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
