/**
 * What the board is allowed to say.
 *
 * The rule the spec is strictest about: never show a move, a check or a
 * checkmate the engine did not produce. These tests drive the real store
 * through real positions and check that the state the annotations read
 * from agrees with the engine every time -- there is no path by which the
 * board can invent a result.
 *
 * They also pin the ordering that matters: the move is only committed, and
 * so only announced, once the fly has put the piece down.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { createChess, getStatus, makeMove } from '../chessEngine';
import { useGame } from '../store';

/**
 * A match with both sides human.
 *
 * Not for realism -- it is so the test can play a specific line. In
 * Human-vs-AI the store rightly refuses to let a click move Black's pieces,
 * which is the behaviour the last test in this file checks.
 */
function freshMatch(mode: 'HUMAN_VS_HUMAN' | 'HUMAN_VS_AI' = 'HUMAN_VS_HUMAN') {
  useGame.getState().startMatch({
    mode,
    playerColor: 'WHITE',
    aiLevel: 'NORMAL',
    environment: 'SUN',
    timePreset: '5+0',
  });
}

/** Play a human move all the way through the carry, as the driver would. */
function play(from: string, to: string) {
  useGame.getState().selectSquare(from as never);
  useGame.getState().selectSquare(to as never);
  // the fly is carrying; the move is not committed yet
  const midCarry = useGame.getState();
  useGame.getState().completeCarry();
  return midCarry;
}

describe('the move is announced only once the piece lands', () => {
  it('does not record the move while the fly is still carrying it', () => {
    freshMatch();
    const before = useGame.getState().moveHistory.length;

    useGame.getState().selectSquare('e2');
    useGame.getState().selectSquare('e4');

    // a carry is in flight, and nothing has been added to the record
    const s = useGame.getState();
    assert.ok(s.carry, 'no carry was started');
    assert.strictEqual(s.moveHistory.length, before, 'the move was recorded too early');
    assert.strictEqual(s.lastMoveAt, 0, 'the result was timestamped before the piece landed');
  });

  it('records and timestamps it when the piece is put down', () => {
    freshMatch();
    play('e2', 'e4');

    const s = useGame.getState();
    assert.strictEqual(s.moveHistory.length, 1);
    assert.ok(s.lastMoveAt > 0, 'no timestamp for the annotations to work from');
    assert.strictEqual(s.carry, null, 'the carry outlived the move');
  });
});

describe('what the annotations read', () => {
  it('gives the board the squares the engine actually used', () => {
    freshMatch();
    play('e2', 'e4');

    const last = useGame.getState().moveHistory[0];
    assert.strictEqual(last.from, 'e2');
    assert.strictEqual(last.to, 'e4');
    // and the notation is the engine's own, not assembled anywhere else
    assert.strictEqual(last.san, 'e4');
  });

  it('never reports a capture that did not happen', () => {
    freshMatch();
    play('e2', 'e4');
    const last = useGame.getState().moveHistory[0];
    assert.strictEqual(last.isCapture, false);
    assert.strictEqual(last.captured, undefined);
  });

  it('marks a real capture, and removes the taken piece from the board', () => {
    // 1. e4 d5 2. exd5 -- a capture the engine agrees with
    freshMatch();
    play('e2', 'e4');
    play('d7', 'd5');
    play('e4', 'd5');

    const last = useGame.getState().moveHistory[2];
    assert.strictEqual(last.isCapture, true);
    assert.strictEqual(last.san, 'exd5');

    const onD5 = useGame
      .getState()
      .pieces.filter((p) => p.square === 'd5' && !p.captured);
    assert.strictEqual(onD5.length, 1, 'two pieces are standing on the same square');
    assert.strictEqual(onD5[0].color, 'w', 'the wrong piece survived the capture');
  });

  it('only reports check when the engine reports it', () => {
    freshMatch();
    play('e2', 'e4');
    assert.strictEqual(useGame.getState().status.inCheck, false);

    // scholar's-mate shape: 1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7#
    play('e7', 'e5');
    play('f1', 'c4');
    play('b8', 'c6');
    play('d1', 'h5');
    play('g8', 'f6');
    assert.strictEqual(useGame.getState().status.inCheck, false, 'check before any was given');

    play('h5', 'f7');
    const s = useGame.getState();
    assert.ok(s.status.inCheck, 'the engine reports mate but not check');
    assert.ok(s.status.isCheckmate, 'expected checkmate');
    assert.strictEqual(s.moveHistory[s.moveHistory.length - 1].san, 'Qxf7#');
  });

  it('names a winner the board can halo, and it is the mating side', () => {
    freshMatch();
    for (const [from, to] of [
      ['e2', 'e4'],
      ['e7', 'e5'],
      ['f1', 'c4'],
      ['b8', 'c6'],
      ['d1', 'h5'],
      ['g8', 'f6'],
      ['h5', 'f7'],
    ]) {
      play(from, to);
    }
    const s = useGame.getState();
    assert.strictEqual(s.winner, 0, 'White delivered mate and should be the winner');
    // the loser's king is the one still in check, so the two marks differ
    assert.strictEqual(s.turn, 'b');
  });
});

describe('draw reasons come from the engine', () => {
  it('reports stalemate as stalemate, not as a generic draw', () => {
    // a known stalemate: black king a8, white queen c7, white king a6
    const chess = createChess('k7/2Q5/K7/8/8/8/8/8 b - - 0 1');
    const status = getStatus(chess);
    assert.ok(status.isStalemate);
    assert.ok(status.isOver);
    assert.match(status.statusText, /STALEMATE/);
  });

  it('reports insufficient material distinctly', () => {
    const chess = createChess('8/8/8/4k3/8/8/4K3/8 w - - 0 1');
    const status = getStatus(chess);
    assert.ok(status.isDraw);
    assert.match(status.statusText, /INSUFFICIENT/);
  });

  it('keeps the reason parseable for the result overlay', () => {
    // the overlay splits on the dash and shows the second half
    const chess = createChess('k7/2Q5/K7/8/8/8/8/8 b - - 0 1');
    const text = getStatus(chess).statusText;
    const reason = text.includes('-') ? text.split('-').slice(1).join('-').trim() : text;
    assert.strictEqual(reason, 'STALEMATE');
  });
});

describe('an illegal tap changes nothing', () => {
  it('leaves the position alone and clears the selection', () => {
    freshMatch();
    const fen = useGame.getState().fen;

    useGame.getState().selectSquare('e2');
    // e5 is not a legal destination for a pawn on e2
    useGame.getState().selectSquare('e5');

    const s = useGame.getState();
    assert.strictEqual(s.fen, fen, 'an illegal tap moved a piece');
    assert.strictEqual(s.carry, null, 'an illegal tap sent the fly out');
    assert.strictEqual(s.selectedSquare, null);
    // and the player is told, rather than the tap silently vanishing
    assert.match(s.notification?.text ?? '', /legal/i);
  });

  it('refuses to move a piece that is not yours', () => {
    // against a computer, Black's pieces are not the player's to touch
    freshMatch('HUMAN_VS_AI');
    const fen = useGame.getState().fen;
    useGame.getState().selectSquare('e7');
    assert.strictEqual(useGame.getState().selectedSquare, null, 'selected a black piece');
    assert.strictEqual(useGame.getState().fen, fen);
  });
});

describe('the engine stays the authority', () => {
  it('agrees with a direct engine move, position for position', () => {
    freshMatch();
    play('e2', 'e4');

    const reference = createChess();
    makeMove(reference, 'e2', 'e4');

    assert.strictEqual(
      useGame.getState().fen.split(' ')[0],
      reference.fen().split(' ')[0],
      'the store and the engine disagree about the position',
    );
  });
});
