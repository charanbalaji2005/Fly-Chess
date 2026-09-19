/**
 * Drosophila Chess Piece Carrying System.
 *
 * One unified CarryPlan drives BOTH the fly and the chess piece so they never drift.
 *
 * Sequence:
 *   APPROACH -> GRAB -> CARRY (along 3D arc) -> PLACE -> RETURN -> DONE
 */

import { squareToWorld, seatStation } from './board';
import type { Square, PieceColor } from './chessEngine';
import type { SeatId } from './types';

export type Vec3 = [number, number, number];

export type CarryStage =
  | 'APPROACH'
  | 'GRAB'
  | 'CARRY'
  | 'PLACE'
  | 'RETURN'
  | 'DONE';

export interface CarryTiming {
  approachMs: number;
  grabMs: number;
  carryMs: number;
  placeMs: number;
  returnMs: number;
}

export const CHESS_CARRY_TIMING: CarryTiming = {
  approachMs: 450,
  grabMs: 220,
  carryMs: 650,
  placeMs: 250,
  returnMs: 480,
};

/** Flight cruising altitude */
export const CARRY_ALTITUDE = 5.2;
/** Height above piece when grabbing/placing */
export const WORK_ALTITUDE = 2.4;
/** How far below fly body piece hangs during carry */
export const CARRY_DROP = 1.9;
/** How far behind fly body piece trails */
export const CARRY_TRAIL = 1.2;

export interface CarryPlan {
  id: string;
  pieceId: string;
  seat: SeatId;
  color: PieceColor;
  from: Square;
  to: Square;
  capturedPieceId?: string;
  isCastling?: boolean;
  castlingRook?: {
    id: string;
    from: Square;
    to: Square;
  };

  /** World coordinate points */
  stationPos: Vec3;
  startPos: Vec3;
  targetPos: Vec3;

  /** Timestamps */
  startTime: number;
  tApproachEnd: number;
  tGrabEnd: number;
  tCarryEnd: number;
  tPlaceEnd: number;
  tReturnEnd: number;
  totalDurationMs: number;
}

export interface CarrySample {
  stage: CarryStage;
  progress: number;
  flyPosition: Vec3;
  flyFacing: number; // yaw angle in radians
  flyPitch: number;
  flyRoll: number;
  piecePosition: Vec3;
  carrying: boolean;
  done: boolean;
  /** True when captured piece should be removed from board */
  removeCaptured: boolean;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/**
 * Creates a deterministic CarryPlan for moving a chess piece.
 */
export function createCarryPlan(
  seat: SeatId,
  pieceId: string,
  from: Square,
  to: Square,
  options: {
    capturedPieceId?: string;
    isCastling?: boolean;
    castlingRook?: { id: string; from: Square; to: Square };
    timing?: Partial<CarryTiming>;
    startTime?: number;
  } = {}
): CarryPlan {
  const t = { ...CHESS_CARRY_TIMING, ...options.timing };
  const startTime = options.startTime ?? Date.now();

  const stationPos = seatStation(seat);
  const startPos = squareToWorld(from);
  const targetPos = squareToWorld(to);

  const tApproachEnd = startTime + t.approachMs;
  const tGrabEnd = tApproachEnd + t.grabMs;
  const tCarryEnd = tGrabEnd + t.carryMs;
  const tPlaceEnd = tCarryEnd + t.placeMs;
  const tReturnEnd = tPlaceEnd + t.returnMs;

  return {
    id: `carry_${seat}_${pieceId}_${startTime}`,
    pieceId,
    seat,
    color: seat === 0 ? 'w' : 'b',
    from,
    to,
    capturedPieceId: options.capturedPieceId,
    isCastling: options.isCastling,
    castlingRook: options.castlingRook,
    stationPos,
    startPos,
    targetPos,
    startTime,
    tApproachEnd,
    tGrabEnd,
    tCarryEnd,
    tPlaceEnd,
    tReturnEnd,
    totalDurationMs: tReturnEnd - startTime,
  };
}

/**
 * Samples the synchronized 3D positions of the Fly and the Chess Piece at timestamp `now`.
 */
export function sampleCarry(plan: CarryPlan, now: number): CarrySample {
  const {
    stationPos,
    startPos,
    targetPos,
    startTime,
    tApproachEnd,
    tGrabEnd,
    tCarryEnd,
    tPlaceEnd,
    tReturnEnd,
  } = plan;

  // 1. Before move starts or in APPROACH
  if (now <= startTime) {
    return {
      stage: 'APPROACH',
      progress: 0,
      flyPosition: stationPos,
      flyFacing: Math.atan2(startPos[0] - stationPos[0], startPos[2] - stationPos[2]),
      flyPitch: 0,
      flyRoll: 0,
      piecePosition: startPos,
      carrying: false,
      done: false,
      removeCaptured: false,
    };
  }

  // APPROACH: Station -> Hover above start position
  if (now < tApproachEnd) {
    const raw = (now - startTime) / (tApproachEnd - startTime);
    const progress = easeInOutQuad(raw);

    const hoverStart: Vec3 = [startPos[0], WORK_ALTITUDE, startPos[2]];
    const arcHeight = CARRY_ALTITUDE;
    const current: Vec3 = [
      lerp(stationPos[0], hoverStart[0], progress),
      lerp(stationPos[1], hoverStart[1], progress) + Math.sin(progress * Math.PI) * arcHeight,
      lerp(stationPos[2], hoverStart[2], progress),
    ];

    const dx = hoverStart[0] - stationPos[0];
    const dz = hoverStart[2] - stationPos[2];
    const facing = Math.atan2(dx, dz);

    return {
      stage: 'APPROACH',
      progress,
      flyPosition: current,
      flyFacing: facing,
      flyPitch: 0.1,
      flyRoll: 0,
      piecePosition: startPos,
      carrying: false,
      done: false,
      removeCaptured: false,
    };
  }

  // GRAB: Descend slightly and lock onto piece
  if (now < tGrabEnd) {
    const raw = (now - tApproachEnd) / (tGrabEnd - tApproachEnd);
    const progress = easeInOutQuad(raw);

    const grabY = lerp(WORK_ALTITUDE, WORK_ALTITUDE - 0.4, Math.sin(progress * Math.PI));
    const flyPos: Vec3 = [startPos[0], grabY, startPos[2]];

    const dx = targetPos[0] - startPos[0];
    const dz = targetPos[2] - startPos[2];
    const facing = Math.atan2(dx, dz);

    return {
      stage: 'GRAB',
      progress,
      flyPosition: flyPos,
      flyFacing: facing,
      flyPitch: -0.05,
      flyRoll: 0,
      piecePosition: startPos,
      carrying: true,
      done: false,
      removeCaptured: false,
    };
  }

  // CARRY: Fly carries piece along 3D flight arc from start to target
  if (now < tCarryEnd) {
    const raw = (now - tGrabEnd) / (tCarryEnd - tGrabEnd);
    const progress = easeInOutQuad(raw);

    const arcApex = CARRY_ALTITUDE + 1.2;
    const flyY = lerp(WORK_ALTITUDE, WORK_ALTITUDE, progress) + Math.sin(progress * Math.PI) * arcApex;
    const flyX = lerp(startPos[0], targetPos[0], progress);
    const flyZ = lerp(startPos[2], targetPos[2], progress);
    const flyPos: Vec3 = [flyX, flyY, flyZ];

    const dx = targetPos[0] - startPos[0];
    const dz = targetPos[2] - startPos[2];
    const facing = Math.atan2(dx, dz);

    // Compute piece position attached to fly carry point
    const trailOffset: Vec3 = [
      -Math.sin(facing) * CARRY_TRAIL,
      -CARRY_DROP,
      -Math.cos(facing) * CARRY_TRAIL,
    ];
    const piecePos: Vec3 = [
      flyX + trailOffset[0],
      Math.max(startPos[1], flyY + trailOffset[1]),
      flyZ + trailOffset[2],
    ];

    return {
      stage: 'CARRY',
      progress,
      flyPosition: flyPos,
      flyFacing: facing,
      flyPitch: 0.15,
      flyRoll: Math.sin(progress * Math.PI * 2) * 0.08,
      piecePosition: piecePos,
      carrying: true,
      done: false,
      removeCaptured: progress > 0.6,
    };
  }

  // PLACE: Descend to target square, place piece, release
  if (now < tPlaceEnd) {
    const raw = (now - tCarryEnd) / (tPlaceEnd - tCarryEnd);
    const progress = easeInOutQuad(raw);

    const flyY = lerp(WORK_ALTITUDE, stationPos[1] + 1.0, progress);
    const flyPos: Vec3 = [targetPos[0], flyY, targetPos[2]];

    const dx = stationPos[0] - targetPos[0];
    const dz = stationPos[2] - targetPos[2];
    const facing = Math.atan2(dx, dz);

    return {
      stage: 'PLACE',
      progress,
      flyPosition: flyPos,
      flyFacing: facing,
      flyPitch: 0,
      flyRoll: 0,
      piecePosition: targetPos,
      carrying: false,
      done: false,
      removeCaptured: true,
    };
  }

  // RETURN: Fly ascends and returns to station perch
  if (now < tReturnEnd) {
    const raw = (now - tPlaceEnd) / (tReturnEnd - tPlaceEnd);
    const progress = easeInOutQuad(raw);

    const arcApex = CARRY_ALTITUDE;
    const current: Vec3 = [
      lerp(targetPos[0], stationPos[0], progress),
      lerp(targetPos[1], stationPos[1], progress) + Math.sin(progress * Math.PI) * arcApex,
      lerp(targetPos[2], stationPos[2], progress),
    ];

    const dx = stationPos[0] - targetPos[0];
    const dz = stationPos[2] - targetPos[2];
    const facing = Math.atan2(dx, dz);

    return {
      stage: 'RETURN',
      progress,
      flyPosition: current,
      flyFacing: facing,
      flyPitch: 0.1,
      flyRoll: 0,
      piecePosition: targetPos,
      carrying: false,
      done: false,
      removeCaptured: true,
    };
  }

  // DONE: Settled back at station perch
  return {
    stage: 'DONE',
    progress: 1,
    flyPosition: stationPos,
    flyFacing: Math.atan2(-stationPos[0], -stationPos[2]), // Look towards center of board
    flyPitch: 0,
    flyRoll: 0,
    piecePosition: targetPos,
    carrying: false,
    done: true,
    removeCaptured: true,
  };
}
