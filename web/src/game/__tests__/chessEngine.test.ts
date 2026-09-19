import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  createChess,
  extractPieces,
  getStatus,
  getLegalMoves,
  makeMove,
  squareToWorld,
  worldToSquare,
  coordsToSquare,
  squareToCoords,
} from '../chessEngine';

describe('ChessEngine - Rules, Movements & States', () => {
  it('initializes standard 32 piece board', () => {
    const chess = createChess();
    const pieces = extractPieces(chess);
    assert.strictEqual(pieces.length, 32);

    const whitePawns = pieces.filter((p) => p.type === 'p' && p.color === 'w');
    assert.strictEqual(whitePawns.length, 8);
    const blackPawns = pieces.filter((p) => p.type === 'p' && p.color === 'b');
    assert.strictEqual(blackPawns.length, 8);

    const whiteKing = pieces.find((p) => p.type === 'k' && p.color === 'w');
    assert.strictEqual(whiteKing?.square, 'e1');
    const blackKing = pieces.find((p) => p.type === 'k' && p.color === 'b');
    assert.strictEqual(blackKing?.square, 'e8');

    const status = getStatus(chess);
    assert.strictEqual(chess.turn(), 'w');
    assert.strictEqual(status.inCheck, false);
    assert.strictEqual(status.isOver, false);
  });

  it('allows standard pawn initial moves (single and double push)', () => {
    const chess = createChess();
    const moves = getLegalMoves(chess);

    // e2 should have e3 and e4
    const e2Moves = moves.filter((m) => m.from === 'e2').map((m) => m.to);
    assert.ok(e2Moves.includes('e3'));
    assert.ok(e2Moves.includes('e4'));

    // Move e2 to e4
    const res = makeMove(chess, 'e2', 'e4');
    assert.ok(res.move);
    assert.strictEqual(res.move?.san, 'e4');
    assert.strictEqual(chess.turn(), 'b');
  });

  it('supports knight movement over pawns', () => {
    const chess = createChess();
    const moves = getLegalMoves(chess);

    const b1Moves = moves.filter((m) => m.from === 'b1').map((m) => m.to);
    assert.ok(b1Moves.includes('a3'));
    assert.ok(b1Moves.includes('c3'));

    const res = makeMove(chess, 'g1', 'f3');
    assert.ok(res.move);
    assert.strictEqual(res.move?.san, 'Nf3');
  });

  it('handles piece captures correctly', () => {
    const chess = createChess();
    makeMove(chess, 'e2', 'e4');
    makeMove(chess, 'd7', 'd5');

    // exd5 capture
    const res = makeMove(chess, 'e4', 'd5');
    assert.ok(res.move);
    assert.strictEqual(res.move?.captured, 'p');

    const pieces = extractPieces(chess);
    assert.strictEqual(pieces.length, 31, 'One captured piece should be removed from board');
    assert.strictEqual(res.move?.captured, 'p');
  });

  it('supports kingside castling', () => {
    const chess = createChess();
    makeMove(chess, 'e2', 'e4');
    makeMove(chess, 'e7', 'e5');
    makeMove(chess, 'g1', 'f3');
    makeMove(chess, 'b8', 'c6');
    makeMove(chess, 'f1', 'c4');
    makeMove(chess, 'g8', 'f6');

    // White can castle kingside e1 -> g1
    const moves = getLegalMoves(chess);
    const castleMove = moves.find((m) => m.from === 'e1' && m.to === 'g1');
    assert.ok(castleMove, 'Kingside castle move should be legal');
    assert.ok(castleMove?.isCastling, 'Should be flagged as castling');

    const res = makeMove(chess, 'e1', 'g1');
    assert.ok(res.move);
    assert.strictEqual(res.move?.san, 'O-O');
  });

  it('supports en passant captures', () => {
    const chess = createChess();
    makeMove(chess, 'e2', 'e4');
    makeMove(chess, 'g8', 'f6');
    makeMove(chess, 'e4', 'e5');
    // Black plays d7-d5 double push adjacent to e5 pawn
    makeMove(chess, 'd7', 'd5');

    // White pawn on e5 can capture en passant on d6
    const moves = getLegalMoves(chess);
    const epMove = moves.find((m) => m.from === 'e5' && m.to === 'd6');
    assert.ok(epMove, 'En passant move should be legal');
    assert.ok(epMove?.isEnPassant, 'Should be flagged as en passant');

    const res = makeMove(chess, 'e5', 'd6');
    assert.ok(res.move);
    assert.strictEqual(res.move?.isEnPassant, true);
  });

  it('detects check correctly', () => {
    const chess = createChess();
    // Scholar's mate attack path
    makeMove(chess, 'e2', 'e4');
    makeMove(chess, 'e7', 'e5');
    makeMove(chess, 'f1', 'c4');
    makeMove(chess, 'b8', 'c6');
    makeMove(chess, 'd1', 'h5');
    makeMove(chess, 'g8', 'f6');

    const statusBefore = getStatus(chess);
    assert.strictEqual(statusBefore.inCheck, false);

    makeMove(chess, 'h5', 'f7');
    const statusAfter = getStatus(chess);
    assert.strictEqual(statusAfter.inCheck, true);
    assert.strictEqual(statusAfter.isCheckmate, true);
    assert.strictEqual(statusAfter.isOver, true);
    assert.strictEqual(statusAfter.winner, 'w');
  });

  it("detects Fool's Mate checkmate correctly", () => {
    const chess = createChess();
    makeMove(chess, 'f2', 'f3');
    makeMove(chess, 'e7', 'e5');
    makeMove(chess, 'g2', 'g4');
    makeMove(chess, 'd8', 'h4'); // Fool's Mate

    const status = getStatus(chess);
    assert.strictEqual(status.isCheckmate, true);
    assert.strictEqual(status.winner, 'b');
    assert.strictEqual(status.isOver, true);
  });

  it('detects stalemate correctly', () => {
    // Known stalemate FEN: 7k/5K2/6Q1/8/8/8/8/8 b - - 0 1
    const chess = createChess('7k/5K2/6Q1/8/8/8/8/8 b - - 0 1');
    const status = getStatus(chess);
    assert.strictEqual(status.isStalemate, true);
    assert.strictEqual(status.isDraw, true);
    assert.strictEqual(status.isOver, true);
    assert.strictEqual(status.winner, null);
  });

  it('converts between board algebraic squares and 3D world coordinates', () => {
    const coords = squareToCoords('e4');
    assert.deepStrictEqual(coords, { file: 4, rank: 3 });

    const sq = coordsToSquare(4, 3);
    assert.strictEqual(sq, 'e4');

    const worldE4 = squareToWorld('e4');
    const recoveredE4 = worldToSquare(worldE4);
    assert.strictEqual(recoveredE4, 'e4');

    const worldA1 = squareToWorld('a1');
    const recoveredA1 = worldToSquare(worldA1);
    assert.strictEqual(recoveredA1, 'a1');

    const worldH8 = squareToWorld('h8');
    const recoveredH8 = worldToSquare(worldH8);
    assert.strictEqual(recoveredH8, 'h8');
  });
});
