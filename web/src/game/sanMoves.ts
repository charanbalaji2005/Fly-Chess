/**
 * Cheap move generation for the search.
 *
 * chess.js has two move generators and a 25x price difference between them,
 * measured on a mid-game position:
 *
 *     chess.moves({ verbose: true })    4213 µs
 *     chess.moves()                      170 µs
 *
 * The gap is SAN. Building algebraic notation needs disambiguation, and
 * disambiguating one move means generating all the others -- so the verbose
 * list is quadratic in the number of legal moves. The search was calling it
 * once per node and paying for notation it never read.
 *
 * So the search generates plain SAN strings and reads what it needs back out
 * of them. A SAN string already carries everything move ordering wants:
 *
 *     Nxe5+    knight, captures, gives check
 *     exd6     pawn on the e-file, captures
 *     O-O      castling
 *     e8=Q#    promotion to queen, mate
 *
 * The victim is not in the notation, so for captures the destination square
 * is parsed out and the board asked once -- a hash lookup, not a search.
 *
 * `chess.move(san)` accepts these strings directly, so nothing else about
 * the search has to change.
 */

import type { Chess } from 'chess.js';

/** Values for most-valuable-victim ordering. */
const VALUE: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

export interface SanMove {
  san: string;
  /** Destination square, for capture valuation. Empty for castling. */
  to: string;
  /** The moving piece's type letter. */
  piece: string;
  isCapture: boolean;
  isPromotion: boolean;
  isCheck: boolean;
  /** Ordering key: higher is searched first. */
  score: number;
}

/**
 * Pull the destination square out of a SAN string.
 *
 * The last file+rank pair before any promotion or check suffix. Castling has
 * no destination square in its notation, and returns empty.
 */
function destinationOf(san: string): string {
  // strip the decorations first
  let s = san;
  const eq = s.indexOf('=');
  if (eq >= 0) s = s.slice(0, eq);
  while (s.length && (s.endsWith('+') || s.endsWith('#') || s.endsWith('!') || s.endsWith('?'))) {
    s = s.slice(0, -1);
  }
  const n = s.length;
  if (n < 2) return '';
  const file = s[n - 2];
  const rank = s[n - 1];
  if (file >= 'a' && file <= 'h' && rank >= '1' && rank <= '8') return file + rank;
  return '';
}

/** The moving piece's letter, lower case, pawn implied by a lower-case start. */
function pieceOf(san: string): string {
  const head = san[0];
  if (head === 'O') return 'k';
  if (head >= 'A' && head <= 'Z') return head.toLowerCase();
  return 'p';
}

/**
 * Generate, classify and order the legal moves.
 *
 * Ordering is the same policy the verbose version used -- transposition-table
 * move first, then captures by most-valuable-victim least-valuable-attacker,
 * then promotions and checks -- just computed from notation instead of from
 * objects that cost twenty-five times as much to build.
 */
export function generateOrdered(chess: Chess, ttBestSan?: string): SanMove[] {
  const sans = chess.moves();
  const out: SanMove[] = new Array(sans.length);

  for (let i = 0; i < sans.length; i++) {
    const san = sans[i];
    const isCapture = san.includes('x');
    const isPromotion = san.includes('=');
    const isCheck = san.endsWith('+') || san.endsWith('#');
    const to = isCapture ? destinationOf(san) : '';
    const piece = pieceOf(san);

    let score = 0;
    if (ttBestSan && san === ttBestSan) {
      // the move that was best last time we saw this position
      score = 1_000_000;
    } else if (isCapture) {
      // one board lookup, only for captures
      const victim = to ? chess.get(to as Parameters<Chess['get']>[0]) : undefined;
      const victimValue = victim ? (VALUE[victim.type] ?? 100) : 100;
      score = 100_000 + victimValue - (VALUE[piece] ?? 100);
    }
    if (isPromotion) score += 90_000;
    if (isCheck) score += 5_000;

    out[i] = { san, to, piece, isCapture, isPromotion, isCheck, score };
  }

  out.sort((a, b) => b.score - a.score);
  return out;
}

/** Captures only, ordered. For quiescence, which looks at nothing else. */
export function generateCaptures(chess: Chess): SanMove[] {
  const all = generateOrdered(chess);
  const captures: SanMove[] = [];
  for (const m of all) {
    if (m.isCapture) captures.push(m);
  }
  return captures;
}
