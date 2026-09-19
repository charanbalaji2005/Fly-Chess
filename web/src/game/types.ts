/**
 * Core types for Drosophila Neural Chess.
 *
 * Provides pure data contracts for chess rules, players, AI difficulty,
 * game phases, and time controls.
 */

import type { Square, PieceType, PieceColor, LegalMove, ChessStatus } from './chessEngine';

export type { Square, PieceType, PieceColor, LegalMove, ChessStatus };

// ---------------------------------------------------------------------------
// Players & Seats
// ---------------------------------------------------------------------------

/** Seat 0 = White (South station), Seat 1 = Black (North station). */
export type SeatId = 0 | 1;

export type PlayerColor = 'WHITE' | 'BLACK';

export type Controller = 'HUMAN' | 'AI' | 'EMPTY';

export type AiLevel = 'BEGINNER' | 'EASY' | 'NORMAL' | 'HARD' | 'EXPERT' | 'MASTER';

export type GameMode = 'HUMAN_VS_AI' | 'HUMAN_VS_HUMAN' | 'AI_VS_AI';

export type TimePreset = 'CASUAL' | '1+0' | '3+0' | '5+0' | '10+0' | '15+10' | '30+0';

export interface PlayerStats {
  moves: number;
  captures: number;
  checksGiven: number;
  timeSpentMs: number;
}

export interface PlayerState {
  seat: SeatId;
  color: PlayerColor;
  name: string;
  controller: Controller;
  aiLevel: AiLevel;
  clockMs: number;
  capturedPieces: PieceType[];
  stats: PlayerStats;
}

// ---------------------------------------------------------------------------
// Game Phases
// ---------------------------------------------------------------------------

/**
 * State machine for chess turn flow:
 * READY -> human or AI turn starts
 * THINKING -> AI calculating best move
 * PIECE_SELECTED -> piece clicked by human, legal squares highlighted
 * FLY_CARRY -> fly physically carrying piece along 3D arc
 * PROMOTION_DIALOG -> waiting for human promotion choice
 * GAME_OVER -> checkmate, stalemate, or draw
 */
export type GamePhase =
  | 'READY'
  | 'THINKING'
  | 'PIECE_SELECTED'
  | 'FLY_CARRY'
  | 'PROMOTION_DIALOG'
  | 'GAME_OVER';

// ---------------------------------------------------------------------------
// Chess Match State
// ---------------------------------------------------------------------------

export interface ChessMatchState {
  fen: string;
  turn: PieceColor;
  currentSeat: SeatId;
  phase: GamePhase;
  selectedSquare: Square | null;
  legalMoves: LegalMove[];
  moveHistory: LegalMove[];
  players: [PlayerState, PlayerState];
  status: ChessStatus;
  winner: SeatId | null;
  round: number;
  lastMove: LegalMove | null;
  aiThinking: boolean;
  aiMetrics?: {
    depth: number;
    nodes: number;
    timeMs: number;
    score: number;
  };
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export type Environment = 'SUN' | 'NIGHT';
export type Quality = 'LOW' | 'MEDIUM' | 'HIGH';

export interface GameSettings {
  environment: Environment;
  quality: Quality;
  soundVolume: number;
  neuralVisuals: boolean;
  reducedMotion: boolean;
  cameraFollow: boolean;
  cameraSensitivity: number;
  debugOverlay: boolean;
}
