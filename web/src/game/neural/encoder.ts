/**
 * Sensory encoder: transforms live Chess position into 7 normalized [0, 1] neural channels.
 */

import { Chess } from 'chess.js';
import type { SensoryState } from './types';
import type { SeatId } from '../types';

const PIECE_VALS: Record<string, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

const CENTER_SQUARES = ['d4', 'd5', 'e4', 'e5'];

export function encodeSensoryState(chess: Chess, seat: SeatId): SensoryState {
  const isWhite = seat === 0;
  const myColor = isWhite ? 'w' : 'b';

  // 1. Material Balance
  let myMaterial = 0;
  let oppMaterial = 0;
  let centerScore = 0;

  const board = chess.board();
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = board[r][f];
      if (!p) continue;
      const val = PIECE_VALS[p.type] || 0;
      if (p.color === myColor) {
        myMaterial += val;
      } else {
        oppMaterial += val;
      }

      // Check center occupation
      const fileChar = String.fromCharCode(97 + f);
      const rankChar = (8 - r).toString();
      const sq = `${fileChar}${rankChar}`;
      if (CENTER_SQUARES.includes(sq)) {
        if (p.color === myColor) centerScore += 0.25;
      }
    }
  }

  // Material ratio: 0.5 is even, > 0.5 is ahead
  const totalMat = Math.max(1, myMaterial + oppMaterial);
  const materialBalance = Math.max(0, Math.min(1, myMaterial / totalMat));

  // 2. Movement Opportunity (Mobility)
  const legalMoves = chess.moves({ verbose: true });
  const myTurn = chess.turn() === myColor;
  const movesCount = myTurn ? legalMoves.length : 20;
  const movementOpportunity = Math.max(0, Math.min(1, movesCount / 40));

  // 3. Tactical Tension (Captures & Checks available)
  const capturesCount = legalMoves.filter((m) => m.captured).length;
  const tacticalTension = Math.max(0, Math.min(1, capturesCount / 8));

  // 4. Opponent Threat
  let opponentThreat = 0;
  if (chess.inCheck() && myTurn) {
    opponentThreat = 0.85;
  } else {
    opponentThreat = Math.max(0, Math.min(1, (oppMaterial - myMaterial + 10) / 20));
  }

  // 5. King Safety
  let kingSafety = 0.7;
  if (chess.inCheck() && myTurn) {
    kingSafety = 0.2;
  }

  // 6. Tempo
  const currentTurn = myTurn ? 1 : 0;

  return {
    opponentThreat: Math.max(0, Math.min(1, opponentThreat)),
    materialBalance: Math.max(0, Math.min(1, materialBalance)),
    movementOpportunity: Math.max(0, Math.min(1, movementOpportunity)),
    centerControl: Math.max(0, Math.min(1, centerScore)),
    kingSafety: Math.max(0, Math.min(1, kingSafety)),
    tacticalTension: Math.max(0, Math.min(1, tacticalTension)),
    currentTurn,
  };
}
