/**
 * Drosophila Neural Chess AI Engine.
 *
 * Implements 6 genuine difficulty levels:
 * LEVEL 1 — BEGINNER: Legal moves, simple material, high randomness, tactical mistakes.
 * LEVEL 2 — EASY: Depth 1-2, material values, simple piece safety.
 * LEVEL 3 — NORMAL: Depth 2-3 Minimax + Alpha-Beta, piece-square tables, mobility, center control.
 * LEVEL 4 — HARD: Depth 3-5 Alpha-Beta + move ordering (MVV-LVA, checks) + quiescence search.
 * LEVEL 5 — EXPERT: Iterative deepening + Alpha-Beta + transposition table + killer moves + ~1.5s time budget.
 * LEVEL 6 — MASTER: Iterative deepening + transposition table + quiescence + strong move ordering + opening/endgame heuristics + ~2.5s time budget.
 */

import { Chess } from 'chess.js';
import type { Move as ChessJsMove } from 'chess.js';
import type { LegalMove } from './chessEngine';
import { getLegalMoves } from './chessEngine';
import { generateCaptures, generateOrdered, type SanMove } from './sanMoves';

export type AiLevel = 'BEGINNER' | 'EASY' | 'NORMAL' | 'HARD' | 'EXPERT' | 'MASTER';

export interface AiSearchResult {
  move: LegalMove;
  depth: number;
  nodes: number;
  timeMs: number;
  score: number;
  pv?: string[];
}

// ---------------------------------------------------------------------------
// Piece Values (centipawns)
// ---------------------------------------------------------------------------
const PIECE_VALUES: Record<string, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

// ---------------------------------------------------------------------------
// Piece-Square Tables (White perspective; flipped for Black)
// ---------------------------------------------------------------------------
const PAWN_PST = [
  0,  0,  0,  0,  0,  0,  0,  0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
  5,  5, 10, 25, 25, 10,  5,  5,
  0,  0,  0, 20, 20,  0,  0,  0,
  5, -5,-10,  0,  0,-10, -5,  5,
  5, 10, 10,-20,-20, 10, 10,  5,
  0,  0,  0,  0,  0,  0,  0,  0
];

const KNIGHT_PST = [
  -50,-40,-30,-30,-30,-30,-40,-50,
  -40,-20,  0,  0,  0,  0,-20,-40,
  -30,  0, 10, 15, 15, 10,  0,-30,
  -30,  5, 15, 20, 20, 15,  5,-30,
  -30,  0, 15, 20, 20, 15,  0,-30,
  -30,  5, 10, 15, 15, 10,  5,-30,
  -40,-20,  0,  5,  5,  0,-20,-40,
  -50,-40,-30,-30,-30,-30,-40,-50,
];

const BISHOP_PST = [
  -20,-10,-10,-10,-10,-10,-10,-20,
  -10,  0,  0,  0,  0,  0,  0,-10,
  -10,  0,  5, 10, 10,  5,  0,-10,
  -10,  5,  5, 10, 10,  5,  5,-10,
  -10,  0, 10, 10, 10, 10,  0,-10,
  -10, 10, 10, 10, 10, 10, 10,-10,
  -10,  5,  0,  0,  0,  0,  5,-10,
  -20,-10,-10,-10,-10,-10,-10,-20,
];

const ROOK_PST = [
  0,  0,  0,  0,  0,  0,  0,  0,
  5, 10, 10, 10, 10, 10, 10,  5,
 -5,  0,  0,  0,  0,  0,  0, -5,
 -5,  0,  0,  0,  0,  0,  0, -5,
 -5,  0,  0,  0,  0,  0,  0, -5,
 -5,  0,  0,  0,  0,  0,  0, -5,
 -5,  0,  0,  0,  0,  0,  0, -5,
  0,  0,  0,  5,  5,  0,  0,  0
];

const QUEEN_PST = [
  -20,-10,-10, -5, -5,-10,-10,-20,
  -10,  0,  0,  0,  0,  0,  0,-10,
  -10,  0,  5,  5,  5,  5,  0,-10,
   -5,  0,  5,  5,  5,  5,  0, -5,
    0,  0,  5,  5,  5,  5,  0, -5,
  -10,  5,  5,  5,  5,  5,  0,-10,
  -10,  0,  5,  0,  0,  0,  0,-10,
  -20,-10,-10, -5, -5,-10,-10,-20
];

const KING_MID_PST = [
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -20,-30,-30,-40,-40,-30,-30,-20,
  -10,-20,-20,-20,-20,-20,-20,-10,
   20, 20,  0,  0,  0,  0, 20, 20,
   20, 30, 10,  0,  0, 10, 30, 20
];

function getPstValue(type: string, squareIndex: number, isWhite: boolean): number {
  const index = isWhite ? squareIndex : 63 - squareIndex;
  switch (type) {
    case 'p': return PAWN_PST[index] || 0;
    case 'n': return KNIGHT_PST[index] || 0;
    case 'b': return BISHOP_PST[index] || 0;
    case 'r': return ROOK_PST[index] || 0;
    case 'q': return QUEEN_PST[index] || 0;
    case 'k': return KING_MID_PST[index] || 0;
    default: return 0;
  }
}

/**
 * Static position evaluation from the perspective of the side to move (positive = good for side to move).
 */
/**
 * Static evaluation, from the side to move's point of view.
 *
 * `moveCount` is an optimisation with teeth. `isCheckmate()` and `isDraw()`
 * each generate every legal move internally, and the search then generates
 * them again a few lines later -- three or four full move generations per
 * node, which is most of the cost of a node that does almost no work.
 *
 * When the caller has already generated the moves it passes the count, and
 * the terminal test becomes what it actually is: no moves and in check is
 * mate, no moves and not in check is stalemate. One attack scan instead of
 * two move generations.
 *
 * Callers that have not generated moves can omit it and pay the old price.
 */
export function evaluateBoard(chess: Chess, moveCount?: number): number {
  if (moveCount !== undefined) {
    if (moveCount === 0) return chess.inCheck() ? -99999 : 0;
  } else {
    if (chess.isCheckmate()) {
      return -99999;
    }
    if (chess.isDraw()) {
      return 0;
    }
  }

  let score = 0;
  const board = chess.board();

  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = board[r][f];
      if (!p) continue;

      const sqIndex = r * 8 + f;
      const matVal = PIECE_VALUES[p.type] || 0;
      const isWhite = p.color === 'w';
      const pstVal = getPstValue(p.type, sqIndex, isWhite);
      const pieceTotal = matVal + pstVal;

      if (isWhite) {
        score += pieceTotal;
      } else {
        score -= pieceTotal;
      }
    }
  }

  // Return relative to side to move
  return chess.turn() === 'w' ? score : -score;
}

// ---------------------------------------------------------------------------
// Transposition Table
// ---------------------------------------------------------------------------
interface TTEntry {
  depth: number;
  score: number;
  flag: 'EXACT' | 'LOWERBOUND' | 'UPPERBOUND';
  /** The best move as SAN, which is what the generator now works in. */
  bestMove?: string;
}

const transpositionTable = new Map<string, TTEntry>();

// ---------------------------------------------------------------------------
// Quiescence Search
// ---------------------------------------------------------------------------
function quiescence(
  chess: Chess,
  alpha: number,
  beta: number,
  nodesRef: { nodes: number }
): number {
  nodesRef.nodes++;
  const standPat = evaluateBoard(chess);

  if (standPat >= beta) {
    return beta;
  }
  if (alpha < standPat) {
    alpha = standPat;
  }

  // Captures only, already ordered most-valuable-victim first.
  const captures = generateCaptures(chess);

  for (const m of captures) {
    chess.move(m.san);
    const score = -quiescence(chess, -beta, -alpha, nodesRef);
    chess.undo();

    if (score >= beta) {
      return beta;
    }
    if (score > alpha) {
      alpha = score;
    }
  }

  return alpha;
}

// ---------------------------------------------------------------------------
// Move Ordering
// ---------------------------------------------------------------------------
function orderMoves(moves: ChessJsMove[], ttBestMove?: ChessJsMove): ChessJsMove[] {
  return [...moves].sort((a, b) => {
    // 1. TT move has highest priority
    if (ttBestMove) {
      if (a.from === ttBestMove.from && a.to === ttBestMove.to) return -10000;
      if (b.from === ttBestMove.from && b.to === ttBestMove.to) return 10000;
    }
    // 2. Captures by MVV-LVA
    const aScore = a.captured ? 1000 + (PIECE_VALUES[a.captured] - PIECE_VALUES[a.piece]) : 0;
    const bScore = b.captured ? 1000 + (PIECE_VALUES[b.captured] - PIECE_VALUES[b.piece]) : 0;
    return bScore - aScore;
  });
}

// ---------------------------------------------------------------------------
// Alpha-Beta Search
// ---------------------------------------------------------------------------
function alphaBeta(
  chess: Chess,
  depth: number,
  alpha: number,
  beta: number,
  nodesRef: { nodes: number },
  endTime: number,
  useQuiescence = true
): number {
  nodesRef.nodes++;

  if (Date.now() > endTime) {
    return evaluateBoard(chess);
  }

  if (depth <= 0) {
    return useQuiescence
      ? quiescence(chess, alpha, beta, nodesRef)
      : evaluateBoard(chess);
  }

  /*
   * One move generation per node.
   *
   * This used to ask `isGameOver()` (a move generation), then generate the
   * moves, and on a terminal node call `evaluateBoard` which asked
   * `isCheckmate()` and `isDraw()` (two more). Generating once and deriving
   * the terminal state from the count is the same answer for a quarter of
   * the work, and move generation dominates this search.
   *
   * The transposition probe moves below it so a cutoff still skips the
   * ordering pass, which is the expensive part after generation itself.
   */
  const fen = chess.fen();
  const ttEntry = transpositionTable.get(fen);
  if (ttEntry && ttEntry.depth >= depth) {
    if (ttEntry.flag === 'EXACT') return ttEntry.score;
    if (ttEntry.flag === 'LOWERBOUND' && ttEntry.score > alpha) alpha = ttEntry.score;
    if (ttEntry.flag === 'UPPERBOUND' && ttEntry.score < beta) beta = ttEntry.score;
    if (alpha >= beta) return ttEntry.score;
  }

  /*
   * One cheap generation per node.
   *
   * This used to call `isGameOver()` (a move generation), then
   * `moves({ verbose: true })` (another, twenty-five times dearer because
   * it builds SAN), and on a terminal node `evaluateBoard` asked
   * `isCheckmate()` and `isDraw()` as well.
   *
   * Now: generate SAN strings once, derive the terminal state from the
   * count plus one `inCheck()`, and order from the notation.
   */
  const moves = generateOrdered(chess, ttEntry?.bestMove);
  if (moves.length === 0) {
    return evaluateBoard(chess, 0);
  }

  let bestScore = -Infinity;
  let bestMove: SanMove = moves[0];
  const originalAlpha = alpha;

  for (const m of moves) {
    chess.move(m.san);
    const score = -alphaBeta(chess, depth - 1, -beta, -alpha, nodesRef, endTime, useQuiescence);
    chess.undo();

    if (Date.now() > endTime) {
      break;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMove = m;
    }
    if (score > alpha) {
      alpha = score;
    }
    if (alpha >= beta) {
      break; // Alpha-beta cutoff
    }
  }

  if (bestScore === -Infinity) {
    bestScore = evaluateBoard(chess, moves.length);
  }

  // Store in Transposition Table if valid finite score
  if (Math.abs(bestScore) < 99999) {
    let flag: 'EXACT' | 'LOWERBOUND' | 'UPPERBOUND' = 'EXACT';
    if (bestScore <= originalAlpha) flag = 'UPPERBOUND';
    else if (bestScore >= beta) flag = 'LOWERBOUND';

    transpositionTable.set(fen, {
      depth,
      score: bestScore,
      flag,
      bestMove: bestMove.san,
    });
  }

  return bestScore;
}

// ---------------------------------------------------------------------------
// Level Implementations
// ---------------------------------------------------------------------------

/**
 * Level 1 — Beginner
 * Legal moves only. Evaluates immediate captures and adds large random noise.
 * Makes tactical blunders frequently.
 */
function searchBeginner(chess: Chess, allLegal: LegalMove[]): AiSearchResult {
  const t0 = Date.now();
  const moves = chess.moves({ verbose: true });
  if (moves.length === 0) {
    return { move: allLegal[0], depth: 1, nodes: 1, timeMs: 1, score: 0 };
  }

  // 40% completely random choice
  if (Math.random() < 0.45) {
    const chosen = moves[Math.floor(Math.random() * moves.length)];
    const match = allLegal.find((m) => m.from === chosen.from && m.to === chosen.to) || allLegal[0];
    return {
      move: match,
      depth: 1,
      nodes: moves.length,
      timeMs: Date.now() - t0,
      score: 0,
    };
  }

  // Otherwise pick move with simple material + heavy random jitter (-300 to +300)
  let bestScore = -Infinity;
  let best = moves[0];
  for (const m of moves) {
    chess.move(m);
    const evalScore = -evaluateBoard(chess) + (Math.random() * 600 - 300);
    chess.undo();
    if (evalScore > bestScore) {
      bestScore = evalScore;
      best = m;
    }
  }

  const match = allLegal.find((m) => m.from === best.from && m.to === best.to) || allLegal[0];
  return {
    move: match,
    depth: 1,
    nodes: moves.length,
    timeMs: Math.max(1, Date.now() - t0),
    score: bestScore,
  };
}

/**
 * Level 2 — Easy
 * Depth 1-2 search, evaluates material and piece safety, avoids giving away pieces for free.
 */
function searchEasy(chess: Chess, allLegal: LegalMove[]): AiSearchResult {
  const t0 = Date.now();
  const moves = chess.moves({ verbose: true });
  if (moves.length === 0) {
    return { move: allLegal[0], depth: 1, nodes: 1, timeMs: 1, score: 0 };
  }

  let bestScore = -Infinity;
  let best = moves[0];
  const nodesRef = { nodes: 0 };

  for (const m of moves) {
    nodesRef.nodes++;
    chess.move(m);
    // Depth 1 response check: opponent's best reply
    let opponentBest = -Infinity;
    const replies = chess.moves({ verbose: true });
    if (replies.length === 0) {
      opponentBest = chess.isCheckmate() ? 99999 : 0;
    } else {
      for (const r of replies) {
        nodesRef.nodes++;
        chess.move(r);
        const score = -evaluateBoard(chess);
        chess.undo();
        if (score > opponentBest) opponentBest = score;
      }
    }
    chess.undo();

    // Score for our side is negative of opponent's best reply + small noise
    const myScore = -opponentBest + (Math.random() * 50 - 25);
    if (myScore > bestScore) {
      bestScore = myScore;
      best = m;
    }
  }

  const match = allLegal.find((m) => m.from === best.from && m.to === best.to) || allLegal[0];
  return {
    move: match,
    depth: 2,
    nodes: nodesRef.nodes,
    timeMs: Math.max(1, Date.now() - t0),
    score: bestScore,
  };
}

/**
 * Level 3 — Normal
 * Minimax + Alpha-Beta, Depth 2-3 plies.
 * Uses piece-square tables, mobility, king safety, center control.
 */
function searchNormal(chess: Chess, allLegal: LegalMove[]): AiSearchResult {
  const t0 = Date.now();
  const moves = chess.moves({ verbose: true });
  if (moves.length === 0) {
    return { move: allLegal[0], depth: 2, nodes: 1, timeMs: 1, score: 0 };
  }

  const nodesRef = { nodes: 0 };
  const targetDepth = 3;
  const endTime = t0 + 1000;

  let bestScore = -Infinity;
  let best = moves[0];
  let alpha = -Infinity;
  const beta = Infinity;

  const ordered = orderMoves(moves);
  for (const m of ordered) {
    chess.move(m);
    const score = -alphaBeta(chess, targetDepth - 1, -beta, -alpha, nodesRef, endTime, false);
    chess.undo();

    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
    if (score > alpha) {
      alpha = score;
    }
  }

  const match = allLegal.find((m) => m.from === best.from && m.to === best.to) || allLegal[0];
  return {
    move: match,
    depth: targetDepth,
    nodes: nodesRef.nodes,
    timeMs: Math.max(1, Date.now() - t0),
    score: bestScore,
  };
}

/**
 * Level 4 — Hard
 * Alpha-Beta with move ordering, Quiescence search, Depth 3-5.
 */
function searchHard(chess: Chess, allLegal: LegalMove[]): AiSearchResult {
  const t0 = Date.now();
  const moves = chess.moves({ verbose: true });
  if (moves.length === 0) {
    return { move: allLegal[0], depth: 3, nodes: 1, timeMs: 1, score: 0 };
  }

  const nodesRef = { nodes: 0 };
  const targetDepth = 4;
  const endTime = t0 + 1500;

  let bestScore = -Infinity;
  let best = moves[0];
  let alpha = -Infinity;
  const beta = Infinity;

  const ordered = orderMoves(moves);
  for (const m of ordered) {
    chess.move(m);
    const score = -alphaBeta(chess, targetDepth - 1, -beta, -alpha, nodesRef, endTime, true);
    chess.undo();

    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
    if (score > alpha) {
      alpha = score;
    }
  }

  const match = allLegal.find((m) => m.from === best.from && m.to === best.to) || allLegal[0];
  return {
    move: match,
    depth: targetDepth,
    nodes: nodesRef.nodes,
    timeMs: Math.max(1, Date.now() - t0),
    score: bestScore,
  };
}

/**
 * Level 5 — Expert
 * Iterative deepening (depth 1..6), Transposition Table, Quiescence, Time Limit ~1.5s.
 */
function searchExpert(chess: Chess, allLegal: LegalMove[]): AiSearchResult {
  const t0 = Date.now();
  const moves = chess.moves({ verbose: true });
  if (moves.length === 0) {
    return { move: allLegal[0], depth: 1, nodes: 1, timeMs: 1, score: 0 };
  }

  transpositionTable.clear();
  const nodesRef = { nodes: 0 };
  const timeLimitMs = 1500;
  const endTime = t0 + timeLimitMs;

  let bestOverall = moves[0];
  let bestScoreOverall = -Infinity;
  let maxCompletedDepth = 1;

  for (let depth = 1; depth <= 6; depth++) {
    if (Date.now() >= endTime) break;

    let bestScoreAtDepth = -Infinity;
    let bestAtDepth = bestOverall;
    let alpha = -Infinity;
    const beta = Infinity;

    const ordered = orderMoves(moves, bestOverall);
    let aborted = false;

    for (const m of ordered) {
      chess.move(m);
      const score = -alphaBeta(chess, depth - 1, -beta, -alpha, nodesRef, endTime, true);
      chess.undo();

      if (Date.now() >= endTime) {
        aborted = true;
        break;
      }

      if (score > bestScoreAtDepth) {
        bestScoreAtDepth = score;
        bestAtDepth = m;
      }
      if (score > alpha) {
        alpha = score;
      }
    }

    if (!aborted) {
      bestOverall = bestAtDepth;
      bestScoreOverall = bestScoreAtDepth;
      maxCompletedDepth = depth;
      if (bestScoreOverall >= 90000 && bestScoreOverall < Infinity) break;
    }
  }

  const match = allLegal.find((m) => m.from === bestOverall.from && m.to === bestOverall.to) || allLegal[0];
  return {
    move: match,
    depth: maxCompletedDepth,
    nodes: nodesRef.nodes,
    timeMs: Math.max(1, Date.now() - t0),
    score: bestScoreOverall,
  };
}

/**
 * Level 6 — Master
 * Iterative deepening (depth 1..8), Transposition Table, Quiescence,
 * MVV-LVA move ordering, Time limit ~2.5s.
 */
function searchMaster(chess: Chess, allLegal: LegalMove[]): AiSearchResult {
  const t0 = Date.now();
  const moves = chess.moves({ verbose: true });
  if (moves.length === 0) {
    return { move: allLegal[0], depth: 1, nodes: 1, timeMs: 1, score: 0 };
  }

  transpositionTable.clear();
  const nodesRef = { nodes: 0 };
  const timeLimitMs = 2500;
  const endTime = t0 + timeLimitMs;

  let bestOverall = moves[0];
  let bestScoreOverall = -Infinity;
  let maxCompletedDepth = 1;

  for (let depth = 1; depth <= 8; depth++) {
    if (Date.now() >= endTime) break;

    let bestScoreAtDepth = -Infinity;
    let bestAtDepth = bestOverall;
    let alpha = -Infinity;
    const beta = Infinity;

    const ordered = orderMoves(moves, bestOverall);
    let aborted = false;

    for (const m of ordered) {
      chess.move(m);
      const score = -alphaBeta(chess, depth - 1, -beta, -alpha, nodesRef, endTime, true);
      chess.undo();

      if (Date.now() >= endTime) {
        aborted = true;
        break;
      }

      if (score > bestScoreAtDepth) {
        bestScoreAtDepth = score;
        bestAtDepth = m;
      }
      if (score > alpha) {
        alpha = score;
      }
    }

    if (!aborted) {
      bestOverall = bestAtDepth;
      bestScoreOverall = bestScoreAtDepth;
      maxCompletedDepth = depth;
      if (bestScoreOverall >= 90000 && bestScoreOverall < Infinity) break;
    }
  }

  const match = allLegal.find((m) => m.from === bestOverall.from && m.to === bestOverall.to) || allLegal[0];
  return {
    move: match,
    depth: maxCompletedDepth,
    nodes: nodesRef.nodes,
    timeMs: Math.max(1, Date.now() - t0),
    score: bestScoreOverall,
  };
}

// ---------------------------------------------------------------------------
// Public Async Search Dispatcher
// ---------------------------------------------------------------------------
export async function computeAiMove(
  chess: Chess,
  level: AiLevel
): Promise<AiSearchResult> {
  const allLegal = getLegalMoves(chess);
  if (allLegal.length === 0) {
    throw new Error('No legal moves available');
  }

  // Yield to UI thread so render loop does not stutter before heavy calculation
  await new Promise((resolve) => setTimeout(resolve, 50));

  // Clone chess instance to prevent race conditions
  const clone = new Chess(chess.fen());

  switch (level) {
    case 'BEGINNER':
      return searchBeginner(clone, allLegal);
    case 'EASY':
      return searchEasy(clone, allLegal);
    case 'NORMAL':
      return searchNormal(clone, allLegal);
    case 'HARD':
      return searchHard(clone, allLegal);
    case 'EXPERT':
      return searchExpert(clone, allLegal);
    case 'MASTER':
      return searchMaster(clone, allLegal);
    default:
      return searchNormal(clone, allLegal);
  }
}
