/**
 * Move history: the last few moves, with the rest a click away.
 *
 * A full game is 40-odd pairs. Showing all of them means a panel that grows
 * until it reaches the board, which is what it was doing. What a player
 * actually reads mid-game is the last two or three moves, so that is what
 * is on screen; the archive is still there, it just is not in the way.
 */

import { useEffect, useMemo, useRef } from 'react';

import { useGame } from '../../store';
import { TONE, label, mono, panel } from './chrome';

const VISIBLE_PAIRS = 5;

interface Pair {
  n: number;
  white?: string;
  black?: string;
}

function pairsOf(sans: string[]): Pair[] {
  const out: Pair[] = [];
  for (let i = 0; i < sans.length; i += 2) {
    out.push({ n: i / 2 + 1, white: sans[i], black: sans[i + 1] });
  }
  return out;
}

export function MoveList() {
  const moveHistory = useGame((s) => s.moveHistory);
  const uiPanel = useGame((s) => s.uiPanel);
  const togglePanel = useGame((s) => s.togglePanel);
  const brainVisOpen = useGame((s) => s.brainVisOpen);

  const pairs = useMemo(() => pairsOf(moveHistory.map((m) => m.san)), [moveHistory]);
  const expanded = uiPanel === 'HISTORY';
  const shown = expanded ? pairs : pairs.slice(-VISIBLE_PAIRS);

  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // keep the latest move in view when the full list is open
    if (expanded && scroller.current) {
      scroller.current.scrollTop = scroller.current.scrollHeight;
    }
  }, [expanded, pairs.length]);

  if (pairs.length === 0) return null;

  return (
    <div
      className="pointer-events-auto absolute"
      // capped at 196px so it never reaches the board, on a tablet or a
      // widescreen monitor
      style={{
        right: brainVisOpen ? 432 : 12,
        top: 118,
        width: 196,
        maxWidth: '22vw',
        zIndex: 10,
        transition: 'right 0.3s ease',
      }}
    >
      <div style={{ ...panel(), padding: '9px 10px 8px' }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
          <span style={label}>Moves</span>
          <button
            type="button"
            onClick={() => togglePanel('HISTORY')}
            aria-label={expanded ? 'Collapse move history' : 'Show all moves'}
            aria-expanded={expanded}
            style={{
              border: 'none',
              background: 'none',
              padding: 0,
              cursor: 'pointer',
              color: TONE.faint,
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}
          >
            {expanded ? 'Less' : 'All'}
          </button>
        </div>

        <div
          ref={scroller}
          style={{
            ...mono,
            fontSize: 11,
            maxHeight: expanded ? 240 : undefined,
            overflowY: expanded ? 'auto' : 'visible',
          }}
        >
          {shown.map((pair) => {
            const isLast = pair.n === pairs.length;
            return (
              <div
                key={pair.n}
                className="flex items-baseline"
                style={{
                  gap: 6,
                  padding: '2px 4px 2px 0',
                  // the current move gets a hairline, not a filled block
                  borderLeft: `2px solid ${isLast ? TONE.accent : 'transparent'}`,
                  paddingLeft: 6,
                  color: isLast ? TONE.ink : TONE.dim,
                }}
              >
                <span style={{ color: TONE.faint, width: 20, flex: 'none' }}>{pair.n}.</span>
                <span style={{ flex: 1 }}>{pair.white ?? ''}</span>
                <span style={{ flex: 1 }}>{pair.black ?? ''}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
