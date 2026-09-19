/**
 * The two player cards.
 *
 * Small on purpose. The old ones were 240px wide with a captured-piece tray
 * that was empty for the first ten moves and a name that said "Human Player"
 * -- a lot of panel for three facts. These are ~150px and say only the three
 * things that change: who, what they are, and how long they have left.
 *
 * The inactive card fades rather than disappearing, so the layout never
 * shifts when the turn passes.
 */

import { useGame } from '../../store';
import { Dot, TONE, label, mono, panel } from './chrome';
import type { PlayerState } from '../../types';

const PIECE_GLYPH: Record<string, string> = {
  p: '♟',
  n: '♞',
  b: '♝',
  r: '♜',
  q: '♛',
  k: '♚',
};

function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function PlayerCards() {
  const players = useGame((s) => s.players);
  const clocks = useGame((s) => s.clocks);
  const turn = useGame((s) => s.turn);
  const timed = useGame((s) => s.config.timePreset) !== 'CASUAL';
  const aiThinking = useGame((s) => s.aiThinking);
  const over = useGame((s) => s.status.isOver);
  const brainVisOpen = useGame((s) => s.brainVisOpen);

  return (
    <>
      <div
        className="pointer-events-auto absolute"
        style={{ left: 12, bottom: 14, zIndex: 10 }}
      >
        <Card
          player={players[0]}
          ms={clocks[0]}
          timed={timed}
          active={!over && turn === 'w'}
          thinking={aiThinking && turn === 'w'}
          accent="#f2efe6"
        />
      </div>

      <div
        className="pointer-events-auto absolute"
        style={{
          right: brainVisOpen ? 432 : 12,
          bottom: 14,
          zIndex: 10,
          transition: 'right 0.3s ease',
        }}
      >
        <Card
          player={players[1]}
          ms={clocks[1]}
          timed={timed}
          active={!over && turn === 'b'}
          thinking={aiThinking && turn === 'b'}
          accent="#8fa4bd"
          alignRight
        />
      </div>
    </>
  );
}

function Card({
  player,
  ms,
  timed,
  active,
  thinking,
  accent,
  alignRight = false,
}: {
  player: PlayerState;
  ms: number;
  timed: boolean;
  active: boolean;
  thinking: boolean;
  accent: string;
  alignRight?: boolean;
}) {
  const isHuman = player.controller === 'HUMAN';
  // "Fly AI / Hard" on two lines reads faster than "Fly AI (HARD)" on one
  const role = isHuman ? 'Human' : 'Fly AI';
  const sub = isHuman ? null : player.aiLevel;

  return (
    <div
      style={{
        ...panel({
          borderColor: active ? 'rgba(94,203,245,0.35)' : 'rgba(255,255,255,0.07)',
        }),
        width: 152,
        padding: '9px 11px',
        opacity: active ? 1 : 0.62,
        transition: 'opacity 200ms ease, border-color 200ms ease',
        textAlign: alignRight ? 'right' : 'left',
      }}
    >
      <div
        className="flex items-center"
        style={{ gap: 6, justifyContent: alignRight ? 'flex-end' : 'flex-start' }}
      >
        <Dot color={active ? accent : TONE.faint} pulse={thinking} />
        <span
          style={{
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: '0.1em',
            color: TONE.ink,
          }}
        >
          {player.color}
        </span>
      </div>

      <div style={{ ...label, fontSize: 9, marginTop: 3 }}>
        {thinking ? 'Thinking' : role}
        {sub ? ` · ${sub}` : ''}
      </div>

      {timed && (
        <div
          style={{
            ...mono,
            fontSize: 20,
            fontWeight: 700,
            lineHeight: 1.1,
            marginTop: 4,
            color: active ? TONE.ink : TONE.dim,
            textShadow: active ? `0 0 14px ${accent}44` : undefined,
          }}
        >
          {clock(ms)}
        </div>
      )}

      {/* Only shown once there is something to show. An empty tray on every
          card for the first ten moves is pure noise. */}
      {player.capturedPieces.length > 0 && (
        <div
          style={{
            marginTop: 5,
            fontSize: 12,
            lineHeight: 1,
            color: TONE.faint,
            letterSpacing: '0.04em',
            wordBreak: 'break-all',
          }}
        >
          {player.capturedPieces.map((p, i) => (
            <span key={i}>{PIECE_GLYPH[p] ?? p}</span>
          ))}
        </div>
      )}
    </div>
  );
}
