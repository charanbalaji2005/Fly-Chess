import { describe, it } from 'node:test';
import assert from 'node:assert';
import { useGame } from '../store';

describe('GameStore - State Machine & Move Pipeline', () => {
  it('initializes game in MENU state and starts match with 32 pieces', () => {
    const s = useGame.getState();
    assert.ok(s.screen === 'MENU' || s.screen === 'GAME');

    // Start a new match
    s.startMatch({
      mode: 'HUMAN_VS_AI',
      playerColor: 'WHITE',
      aiLevel: 'HARD',
      environment: 'NIGHT',
      timePreset: '10+0',
    });

    const state = useGame.getState();
    assert.strictEqual(state.screen, 'GAME');
    assert.strictEqual(state.phase, 'READY');
    assert.strictEqual(state.currentSeat, 0); // White
    assert.strictEqual(state.turn, 'w');
    assert.strictEqual(state.pieces.length, 32);
    assert.strictEqual(state.players[0].controller, 'HUMAN');
    assert.strictEqual(state.players[1].controller, 'AI');
    assert.strictEqual(state.players[1].aiLevel, 'HARD');
  });

  it('selects square and reveals legal moves', () => {
    const s = useGame.getState();
    s.selectSquare('e2');

    const state = useGame.getState();
    assert.strictEqual(state.selectedSquare, 'e2');
    const legalTargets = state.legalMovesForSelected.map((m) => m.to);
    assert.ok(legalTargets.includes('e3'));
    assert.ok(legalTargets.includes('e4'));
  });

  it('initiates FLY_CARRY on move selection and completes carry', () => {
    const s = useGame.getState();
    s.selectSquare('e2');
    s.requestMove('e2', 'e4');

    const carryState = useGame.getState();
    assert.strictEqual(carryState.phase, 'FLY_CARRY');
    assert.ok(carryState.carry !== null);
    assert.strictEqual(carryState.carry?.from, 'e2');
    assert.strictEqual(carryState.carry?.to, 'e4');

    // Complete the carry
    carryState.completeCarry();

    const afterState = useGame.getState();
    assert.strictEqual(afterState.phase, 'READY');
    assert.strictEqual(afterState.currentSeat, 1); // Black turn
    assert.strictEqual(afterState.turn, 'b');
    assert.strictEqual(afterState.moveHistory.length, 1);
    assert.strictEqual(afterState.moveHistory[0].san, 'e4');

    // Piece at e4 should now be updated
    const e4Piece = afterState.pieces.find((p) => p.square === 'e4');
    assert.ok(e4Piece, 'Piece should now occupy square e4');
    assert.strictEqual(e4Piece?.type, 'p');
    assert.strictEqual(e4Piece?.color, 'w');
  });
});
