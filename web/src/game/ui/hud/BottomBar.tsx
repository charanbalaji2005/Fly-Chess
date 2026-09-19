/**
 * Bottom centre: the actions available right now, and nothing else.
 *
 * Undo only appears when there is something to undo; Cancel only while a
 * piece is in hand; Resign only in a live game. A bar of permanently
 * disabled buttons is a bar the player learns to ignore.
 *
 * The selected-piece readout lives here too, immediately above the buttons,
 * rather than floating over the board -- which is where it used to be, in a
 * sentence long enough to cover two files.
 */

import { useMemo } from 'react';

import { useGame } from '../../store';
import { TONE, TextButton, label, panel } from './chrome';

const PIECE_NAME: Record<string, string> = {
  p: 'Pawn',
  n: 'Knight',
  b: 'Bishop',
  r: 'Rook',
  q: 'Queen',
  k: 'King',
};

export function BottomBar() {
  const selectedSquare = useGame((s) => s.selectedSquare);
  const legalMoves = useGame((s) => s.legalMovesForSelected);
  const pieces = useGame((s) => s.pieces);
  const moveHistory = useGame((s) => s.moveHistory);
  const aiThinking = useGame((s) => s.aiThinking);
  const over = useGame((s) => s.status.isOver);
  const mode = useGame((s) => s.config.mode);
  const selectSquare = useGame((s) => s.selectSquare);
  const undoMove = useGame((s) => s.undoMove);
  const resign = useGame((s) => s.resign);

  const selected = useMemo(
    () => pieces.find((p) => p.square === selectedSquare && !p.captured) ?? null,
    [pieces, selectedSquare],
  );

  const canUndo = mode === 'HUMAN_VS_AI' && moveHistory.length > 0 && !aiThinking && !over;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 flex flex-col items-center"
      style={{ bottom: 16, gap: 8, zIndex: 10 }}
    >
      {/* what is in hand */}
      {selected && !over && (
        <div
          className="pointer-events-auto"
          style={{ ...panel(), padding: '6px 12px', textAlign: 'center' }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: TONE.ink, letterSpacing: '0.06em' }}>
            {PIECE_NAME[selected.type] ?? selected.type}
            <span style={{ color: TONE.faint }}> · </span>
            <span style={{ textTransform: 'uppercase' }}>{selected.square}</span>
          </div>
          <div style={{ ...label, fontSize: 8.5, marginTop: 2 }}>
            {legalMoves.length === 0
              ? 'No legal moves'
              : `${legalMoves.length} legal move${legalMoves.length === 1 ? '' : 's'}`}
          </div>
        </div>
      )}

      <div className="pointer-events-auto flex items-center" style={{ gap: 8 }}>
        {selected && !over && (
          <TextButton onClick={() => selectSquare(null)} title="Deselect piece">
            Cancel
          </TextButton>
        )}

        {canUndo && (
          <TextButton onClick={undoMove} title="Take back the last move">
            ↶ Undo
          </TextButton>
        )}

        {!over && (
          <TextButton onClick={resign} tone="danger" title="Resign the match">
            Resign
          </TextButton>
        )}
      </div>
    </div>
  );
}
