/**
 * Authoritative Chess Engine wrapper around chess.js.
 *
 * Rules, move generation, validations, check, checkmate, stalemate,
 * castling, en passant, promotion, FEN, SAN, and world coordinate conversions.
 */

import { Chess } from 'chess.js';
import type { Move as ChessJsMove, Square } from 'chess.js';

export type { Square };
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type PieceColor = 'w' | 'b';
export type PlayerColor = 'WHITE' | 'BLACK';

export interface ChessPieceState {
  id: string;
  type: PieceType;
  color: PieceColor;
  square: Square;
  captured: boolean;
  /** Index in captured graveyard tray if captured */
  capturedIndex?: number;
}

export interface LegalMove {
  from: Square;
  to: Square;
  piece: PieceType;
  color: PieceColor;
  captured?: PieceType;
  promotion?: PieceType;
  san: string;
  lan: string;
  isCheck: boolean;
  isCheckmate: boolean;
  isCastling: boolean;
  isEnPassant: boolean;
  isCapture: boolean;
}

export interface ChessStatus {
  isOver: boolean;
  inCheck: boolean;
  isCheckmate: boolean;
  isStalemate: boolean;
  isDraw: boolean;
  isThreefoldRepetition: boolean;
  isInsufficientMaterial: boolean;
  is50MoveRule: boolean;
  winner: PieceColor | null;
  statusText: string;
}

export const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
export const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8'] as const;

/**
 * Coordinate mapping:
 * World coordinates: center of board is (0, 0, 0).
 * White is at rank 1 (positive z or south), Black is at rank 8 (negative z or north).
 * File 'a' is on White's left (negative x), File 'h' is on White's right (positive x).
 * Each square has size CELL_SIZE = 3.2. Total board 8 * 3.2 = 25.6.
 */
export const CHESS_BOARD = {
  cells: 8,
  cellSize: 3.2,
  get size() {
    return this.cells * this.cellSize;
  },
  deckY: 0.6,
  slabHeight: 1.2,
  whiteStation: [0, 2.5, 20.0] as [number, number, number],
  blackStation: [0, 2.5, -20.0] as [number, number, number],
  whiteGraveYard: [16.0, 0.6, 6.0] as [number, number, number],
  blackGraveYard: [-16.0, 0.6, -6.0] as [number, number, number],
} as const;

export function squareToCoords(square: Square): { file: number; rank: number } {
  const f = square.charCodeAt(0) - 97; // 'a' -> 0
  const r = parseInt(square[1], 10) - 1; // '1' -> 0
  return { file: f, rank: r };
}

export function coordsToSquare(file: number, rank: number): Square {
  const f = String.fromCharCode(97 + Math.max(0, Math.min(7, file)));
  const r = (Math.max(0, Math.min(7, rank)) + 1).toString();
  return `${f}${r}` as Square;
}

/**
 * Converts algebraic square to 3D world coordinates.
 */
export function squareToWorld(square: Square, heightOffset = 0): [number, number, number] {
  const { file, rank } = squareToCoords(square);
  const half = (CHESS_BOARD.cells - 1) / 2; // 3.5
  // file 0 ('a') -> -3.5 * 3.2, file 7 ('h') -> +3.5 * 3.2
  const x = (file - half) * CHESS_BOARD.cellSize;
  // rank 0 ('1', White) -> +3.5 * 3.2 (south), rank 7 ('8', Black) -> -3.5 * 3.2 (north)
  const z = -(rank - half) * CHESS_BOARD.cellSize;
  const y = CHESS_BOARD.deckY + heightOffset;
  return [x, y, z];
}

/**
 * Converts 3D world coordinate to nearest algebraic square if within board bounds.
 */
export function worldToSquare(xOrVec: number | [number, number, number], maybeZ?: number): Square | null {
  const x = Array.isArray(xOrVec) ? xOrVec[0] : xOrVec;
  const z = Array.isArray(xOrVec) ? xOrVec[2] : (maybeZ ?? 0);
  const half = (CHESS_BOARD.cells - 1) / 2;
  const halfSize = (CHESS_BOARD.cells * CHESS_BOARD.cellSize) / 2;
  if (Math.abs(x) > halfSize || Math.abs(z) > halfSize) {
    return null;
  }
  const file = Math.round(x / CHESS_BOARD.cellSize + half);
  const rank = Math.round(-z / CHESS_BOARD.cellSize + half);
  if (file < 0 || file > 7 || rank < 0 || rank > 7) {
    return null;
  }
  return coordsToSquare(file, rank);
}

/**
 * Creates a fresh Chess instance.
 */
export function createChess(fen: string = INITIAL_FEN): Chess {
  return new Chess(fen);
}

/**
 * Extracts all active and captured pieces from a Chess instance.
 */
export function extractPieces(chess: Chess): ChessPieceState[] {
  const pieces: ChessPieceState[] = [];
  const board = chess.board();

  // Keep a stable count for generating piece IDs
  const counts: Record<string, number> = {};

  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = board[r][f];
      if (p) {
        const sq = coordsToSquare(f, 7 - r);
        const key = `${p.color}_${p.type}`;
        counts[key] = (counts[key] || 0) + 1;
        const id = `${key}_${counts[key]}`;
        pieces.push({
          id,
          type: p.type as PieceType,
          color: p.color as PieceColor,
          square: sq,
          captured: false,
        });
      }
    }
  }

  return pieces;
}

/**
 * Gets all legal moves from the current position, optionally filtered by a starting square.
 */
export function getLegalMoves(chess: Chess, fromSquare?: Square): LegalMove[] {
  const verboseMoves: ChessJsMove[] = chess.moves({ verbose: true });
  const filtered = fromSquare
    ? verboseMoves.filter((m) => m.from === fromSquare)
    : verboseMoves;

  return filtered.map((m) => {
    const isCastling = m.flags.includes('k') || m.flags.includes('q');
    const isEnPassant = m.flags.includes('e');
    const isCapture = m.flags.includes('c') || isEnPassant;

    return {
      from: m.from as Square,
      to: m.to as Square,
      piece: m.piece as PieceType,
      color: m.color as PieceColor,
      captured: m.captured as PieceType | undefined,
      promotion: m.promotion as PieceType | undefined,
      san: m.san,
      lan: m.lan,
      /*
       * Whether this move *gives* check, read from the notation.
       *
       * It used to call `chess.inCheck()`, which reports whether the side to
       * move is in check *now* -- the position before the move. Every move in
       * the list therefore carried the same value and it was the wrong one: a
       * quiet move looked like a check whenever the mover was already in one.
       *
       * chess.js has already worked this out and written it into the SAN, so
       * reading the suffix is both correct and free. It also removes one
       * `inCheck()` call per legal move, which was a full attack scan each --
       * around thirty per position, every time the list was rebuilt.
       */
      isCheck: m.san.endsWith('+') || m.san.endsWith('#'),
      isCheckmate: m.san.endsWith('#'),
      isCastling,
      isEnPassant,
      isCapture,
    };
  });
}

/**
 * Validates and executes a move in the Chess instance.
 */
export function makeMove(
  chess: Chess,
  from: Square,
  to: Square,
  promotion?: PieceType
): { move: LegalMove | null; error?: string } {
  try {
    const moveObj = chess.move({
      from,
      to,
      promotion: promotion || 'q',
    });

    if (!moveObj) {
      return { move: null, error: 'Illegal move' };
    }

    const isCastling = moveObj.flags.includes('k') || moveObj.flags.includes('q');
    const isEnPassant = moveObj.flags.includes('e');

    const legal: LegalMove = {
      from: moveObj.from as Square,
      to: moveObj.to as Square,
      piece: moveObj.piece as PieceType,
      color: moveObj.color as PieceColor,
      captured: moveObj.captured as PieceType | undefined,
      promotion: moveObj.promotion as PieceType | undefined,
      san: moveObj.san,
      lan: moveObj.lan,
      isCheck: chess.inCheck(),
      isCheckmate: chess.isCheckmate(),
      isCastling,
      isEnPassant,
      isCapture: moveObj.flags.includes('c') || isEnPassant,
    };

    return { move: legal };
  } catch (err: any) {
    return { move: null, error: err?.message || 'Move failed' };
  }
}

/**
 * Returns comprehensive game status.
 */
export function getStatus(chess: Chess): ChessStatus {
  const inCheck = chess.inCheck();
  const isCheckmate = chess.isCheckmate();
  const isStalemate = chess.isStalemate();
  const isThreefold = chess.isThreefoldRepetition();
  const isInsufficient = chess.isInsufficientMaterial();
  const isDraw = chess.isDraw();
  const isOver = chess.isGameOver();

  let winner: PieceColor | null = null;
  let statusText = 'PLAYING';

  if (isCheckmate) {
    // Current turn is the player who was mated, so opponent won
    winner = chess.turn() === 'w' ? 'b' : 'w';
    statusText = winner === 'w' ? 'CHECKMATE - WHITE WINS' : 'CHECKMATE - BLACK WINS';
  } else if (isStalemate) {
    statusText = 'DRAW - STALEMATE';
  } else if (isThreefold) {
    statusText = 'DRAW - THREEFOLD REPETITION';
  } else if (isInsufficient) {
    statusText = 'DRAW - INSUFFICIENT MATERIAL';
  } else if (isDraw) {
    statusText = 'DRAW - 50-MOVE RULE';
  } else if (inCheck) {
    statusText = chess.turn() === 'w' ? 'CHECK - WHITE' : 'CHECK - BLACK';
  }

  return {
    isOver,
    inCheck,
    isCheckmate,
    isStalemate,
    isDraw,
    isThreefoldRepetition: isThreefold,
    isInsufficientMaterial: isInsufficient,
    is50MoveRule: isDraw && !isStalemate && !isThreefold && !isInsufficient,
    winner,
    statusText,
  };
}
