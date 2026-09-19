/**
 * Pure projection of authoritative chess game state for the stadium sky display.
 *
 * Exposes:
 *   - Last move played (piece glyph, SAN, squares, capture/check flags)
 *   - Next to move (player, role, prompt, thinking status)
 *   - AI Hardness level and Elo rating
 *   - Live countdown clocks
 *   - Move history ribbon
 */

import type { LegalMove, PieceType } from '../chessEngine';
import type { PlayerState, SeatId } from '../types';

export interface BillboardSide {
  color: 'WHITE' | 'BLACK';
  role: string;
  level: string;
  clock: string;
  timed: boolean;
  captured: PieceType[];
  active: boolean;
  winner: boolean;
}

export interface BillboardData {
  title: string;
  subtitle: string;

  white: BillboardSide;
  black: BillboardSide;

  // Last move
  lastMovePiece: string | null;
  lastMoveSquares: string | null;
  lastMoveSan: string | null;
  lastMoveBy: 'WHITE' | 'BLACK' | null;
  lastMoveCapture: boolean;

  // Next to move
  nextColor: 'WHITE' | 'BLACK';
  nextRole: 'YOU' | 'FLY AI' | 'HUMAN';
  nextPrompt: string;
  isCheck: boolean;
  isGameOver: boolean;
  statusHeadline: string;

  banner: string | null;
  bannerTone: 'NEUTRAL' | 'WARN' | 'DANGER' | 'GOOD';

  thinking: boolean;
  search: { depth: number; nodes: number; timeMs: number } | null;

  aiLevelName: string;
  aiElo: string;

  moves: { n: number; white?: string; black?: string }[];
}

export interface BillboardInput {
  players: [PlayerState, PlayerState];
  clocks: { 0: number; 1: number };
  timed: boolean;
  turn: 'w' | 'b';
  moveHistory: LegalMove[];
  status: {
    isOver: boolean;
    inCheck: boolean;
    isCheckmate: boolean;
    isStalemate: boolean;
    isDraw: boolean;
    statusText: string;
  };
  winner: SeatId | null;
  aiThinking: boolean;
  aiMetrics: { depth: number; nodes: number; timeMs: number; score: number } | null;
}

const PIECE_GLYPH: Record<string, string> = {
  p: '♟',
  n: '♞',
  b: '♝',
  r: '♜',
  q: '♛',
  k: '♚',
};

const AI_RATINGS: Record<string, string> = {
  BEGINNER: 'Elo ~600',
  EASY: 'Elo ~1000',
  NORMAL: 'Elo ~1400',
  HARD: 'Elo ~1800',
  EXPERT: 'Elo ~2100',
  MASTER: 'Elo ~2400+',
};

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function billboardData(input: BillboardInput): BillboardData {
  const { players, clocks, timed, turn, moveHistory, status, winner } = input;

  const last = moveHistory.length > 0 ? moveHistory[moveHistory.length - 1] : null;
  const whiteActive = turn === 'w' && !status.isOver;
  const blackActive = turn === 'b' && !status.isOver;

  const whitePlayer = players[0];
  const blackPlayer = players[1];

  // Active AI level
  const aiPlayer = blackPlayer.controller === 'AI' ? blackPlayer : whitePlayer.controller === 'AI' ? whitePlayer : blackPlayer;
  const aiLevelName = aiPlayer.aiLevel || 'HARD';
  const aiElo = AI_RATINGS[aiLevelName] || 'Elo ~1800';

  // Last move details
  let lastPiece = '';
  if (last) {
    lastPiece = PIECE_GLYPH[last.piece.toLowerCase()] || '♟';
  }

  // Next move & prompt details
  const nextColor: 'WHITE' | 'BLACK' = turn === 'w' ? 'WHITE' : 'BLACK';
  const activePlayer = turn === 'w' ? whitePlayer : blackPlayer;
  const isHumanTurn = activePlayer.controller === 'HUMAN';
  const nextRole: 'YOU' | 'FLY AI' | 'HUMAN' = isHumanTurn ? 'YOU' : 'FLY AI';

  let nextPrompt = '';
  let statusHeadline = '';

  if (status.isOver) {
    statusHeadline = status.statusText;
    if (status.isCheckmate) {
      const winnerName = winner === 0 ? 'WHITE' : 'BLACK';
      nextPrompt = `CHECKMATE! ${winnerName} IS VICTORIOUS`;
    } else if (status.isStalemate) {
      nextPrompt = 'DRAW BY STALEMATE — NO LEGAL MOVES';
    } else {
      nextPrompt = 'MATCH CONCLUDED — DRAW';
    }
  } else if (input.aiThinking) {
    statusHeadline = `${nextColor} FLY AI SEARCHING...`;
    nextPrompt = `Neural engine evaluating optimal 3D line...`;
  } else if (isHumanTurn) {
    statusHeadline = `${nextColor} TO MOVE`;
    nextPrompt = `Your turn: select any piece on the board to move`;
  } else {
    statusHeadline = `${nextColor} TO MOVE`;
    nextPrompt = `Fly AI preparing move...`;
  }

  // Banner event
  let banner: string | null = null;
  let bannerTone: BillboardData['bannerTone'] = 'NEUTRAL';

  if (status.isCheckmate) {
    banner = 'CHECKMATE';
    bannerTone = 'GOOD';
  } else if (status.isStalemate) {
    banner = 'STALEMATE';
    bannerTone = 'WARN';
  } else if (status.isDraw) {
    banner = 'DRAW';
    bannerTone = 'WARN';
  } else if (status.inCheck) {
    banner = 'CHECK';
    bannerTone = 'DANGER';
  } else if (last?.promotion) {
    banner = 'PROMOTION';
    bannerTone = 'GOOD';
  } else if (last?.isCapture) {
    banner = 'CAPTURE';
    bannerTone = 'WARN';
  }

  // History pairs
  const pairs: { n: number; white?: string; black?: string }[] = [];
  for (let i = 0; i < moveHistory.length; i += 2) {
    pairs.push({
      n: i / 2 + 1,
      white: moveHistory[i]?.san,
      black: moveHistory[i + 1]?.san,
    });
  }

  return {
    title: 'DROSOPHILA NEURAL CHESS',
    subtitle: 'AERIAL STADIUM DISPLAY',

    white: {
      color: 'WHITE',
      role: whitePlayer.controller === 'HUMAN' ? 'HUMAN (YOU)' : 'FLY AI',
      level: whitePlayer.controller === 'AI' ? whitePlayer.aiLevel : '',
      clock: formatClock(clocks[0]),
      timed,
      captured: whitePlayer.capturedPieces,
      active: whiteActive,
      winner: winner === 0,
    },
    black: {
      color: 'BLACK',
      role: blackPlayer.controller === 'HUMAN' ? 'HUMAN (YOU)' : 'FLY AI',
      level: blackPlayer.controller === 'AI' ? blackPlayer.aiLevel : '',
      clock: formatClock(clocks[1]),
      timed,
      captured: blackPlayer.capturedPieces,
      active: blackActive,
      winner: winner === 1,
    },

    lastMovePiece: lastPiece || null,
    lastMoveSquares: last ? `${last.from} ➔ ${last.to}` : null,
    lastMoveSan: last?.san ?? null,
    lastMoveBy: last ? (last.color === 'w' ? 'WHITE' : 'BLACK') : null,
    lastMoveCapture: !!last?.isCapture,

    nextColor,
    nextRole,
    nextPrompt,
    isCheck: status.inCheck,
    isGameOver: status.isOver,
    statusHeadline,

    banner,
    bannerTone,

    thinking: input.aiThinking,
    search: input.aiMetrics
      ? {
          depth: input.aiMetrics.depth,
          nodes: input.aiMetrics.nodes,
          timeMs: input.aiMetrics.timeMs,
        }
      : null,

    aiLevelName,
    aiElo,

    moves: pairs.slice(-6),
  };
}
