import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createCarryPlan, sampleCarry } from '../carry';

describe('Carry - Fly Piece Transport & Arc Trajectory', () => {
  it('creates a deterministic carry plan between two squares', () => {
    const plan = createCarryPlan(0, 'white-pawn-e2', 'e2', 'e4', {
      capturedPieceId: undefined,
      timing: { carryMs: 600 },
    });

    assert.strictEqual(plan.seat, 0);
    assert.strictEqual(plan.pieceId, 'white-pawn-e2');
    assert.strictEqual(plan.from, 'e2');
    assert.strictEqual(plan.to, 'e4');
    assert.ok(plan.totalDurationMs > 0);
  });

  it('samples smooth fly progression from pickup to release and return', () => {
    const plan = createCarryPlan(0, 'white-knight-b1', 'b1', 'c3');
    const start = plan.startTime;

    // At t = start, fly is approaching piece
    const sampleStart = sampleCarry(plan, start);
    assert.strictEqual(sampleStart.done, false);
    assert.strictEqual(sampleStart.stage, 'APPROACH');
    assert.strictEqual(sampleStart.carrying, false);

    // At middle of carry, fly is carrying piece
    const midTime = (plan.tGrabEnd + plan.tCarryEnd) / 2;
    const sampleMid = sampleCarry(plan, midTime);
    assert.strictEqual(sampleMid.stage, 'CARRY');
    assert.strictEqual(sampleMid.carrying, true);
    // Piece should be elevated above deck during carry arc
    assert.ok(sampleMid.piecePosition[1] > 1.0, 'Piece should be lifted above board height during flight');

    // After full duration, done is true
    const sampleEnd = sampleCarry(plan, start + plan.totalDurationMs + 50);
    assert.strictEqual(sampleEnd.done, true);
  });
});
