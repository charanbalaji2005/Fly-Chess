/**
 * Who sits where.
 *
 * Pulled out of the renderer because placement is the part that decides
 * whether a crowd reads as a crowd. The old version put an equal number of
 * identical figures in every row of one uniform bowl, and no amount of
 * better geometry rescues that: it is the regularity the eye objects to,
 * not the polygon count.
 *
 * What this produces instead:
 *
 *   - density and occupancy that differ per tier, so the lower bowl is
 *     packed, the VIP band is half empty and the top tier thins out;
 *   - seats left deliberately empty, in clusters rather than uniformly,
 *     because real gaps come in runs;
 *   - a pose per spectator, so the stands are not one figure repeated;
 *   - small jitter in lean, yaw and scale, kept small enough that everyone
 *     stays in their seat;
 *   - a level of detail per spectator, from its distance to the board.
 *
 * Pure and deterministic from a seed, so the same match always draws the
 * same crowd and the layout can be checked in a test.
 */

import { TIERS, isAisle, tierSeatAt, type Tier } from './stadiumLayout';

/** What a spectator is doing. Drives which mesh draws them. */
export type Pose = 'SIT' | 'LEAN' | 'ARMS_UP';

export type Detail = 'NEAR' | 'FAR';

export interface Spectator {
  position: [number, number, number];
  /** Facing, in radians. Always inward, plus a little wander. */
  facing: number;
  scale: number;
  pose: Pose;
  detail: Detail;
  /** Animation phase, so nobody moves in step with their neighbour. */
  phase: number;
  /** How readily this one reacts, 0..1. */
  energy: number;
  /** Index into the palette. */
  shirt: number;
  tier: Tier['name'];
}

/** Beyond this distance from the board a spectator is drawn simplified. */
const NEAR_RADIUS = 46;

/** A small deterministic generator, so a crowd is reproducible. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export interface CrowdBudget {
  /** Total spectators to place, across all tiers. */
  total: number;
  seed?: number;
}

/**
 * Place the crowd.
 *
 * The budget is shared out by each tier's seat count weighted by its
 * occupancy, so reducing the total on a phone thins every tier evenly
 * rather than emptying the top one first.
 */
export function layoutCrowd({ total, seed = 20260919 }: CrowdBudget): Spectator[] {
  const random = rng(seed);
  const out: Spectator[] = [];

  const weights = TIERS.map((t) => t.rows * t.density * t.occupancy);
  const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;

  TIERS.forEach((tier, tierIndex) => {
    const share = Math.round((weights[tierIndex] / totalWeight) * total);
    const perRow = Math.max(1, Math.round(share / tier.rows));

    for (let row = 0; row < tier.rows; row++) {
      // Empty runs, not empty individuals. A block of three or four unsold
      // seats reads as a real gap; one missing person every dozen reads as
      // noise.
      let gapLeft = 0;

      for (let i = 0; i < perRow; i++) {
        const t = (i + 0.5) / perRow;
        if (isAisle(t)) continue;

        if (gapLeft > 0) {
          gapLeft -= 1;
          continue;
        }
        if (random() > tier.occupancy) {
          gapLeft = 1 + Math.floor(random() * 3);
          continue;
        }

        const seat = tierSeatAt(tier, row, t);
        const distance = Math.hypot(seat.position[0], seat.position[2]);

        // Most people sit. A few lean in, fewer still have their arms up --
        // enough to break the line without the stands looking like a riot.
        const r = random();
        const pose: Pose = r < 0.76 ? 'SIT' : r < 0.94 ? 'LEAN' : 'ARMS_UP';

        out.push({
          position: [
            // a few centimetres of shuffle, so nobody is perfectly aligned
            seat.position[0] + (random() - 0.5) * 0.22,
            seat.position[1],
            seat.position[2] + (random() - 0.5) * 0.22,
          ],
          // mostly facing the board, with a little looking about
          facing: seat.facing + (random() - 0.5) * 0.5,
          scale: 0.88 + random() * 0.26,
          pose,
          detail: distance < NEAR_RADIUS ? 'NEAR' : 'FAR',
          phase: random() * Math.PI * 2,
          energy: 0.2 + random() * 0.8,
          shirt: Math.floor(random() * 1024),
          tier: tier.name,
        });
      }
    }
  });

  return out;
}

/** Group a laid-out crowd by the mesh that will draw it. */
export function groupForDrawing(
  crowd: Spectator[],
): Record<string, Spectator[]> {
  const groups: Record<string, Spectator[]> = {};
  for (const s of crowd) {
    // far spectators all share one simplified mesh whatever their pose:
    // at that distance the pose is not legible and the draw call is not
    // worth spending
    const key = s.detail === 'FAR' ? 'FAR' : `NEAR_${s.pose}`;
    (groups[key] ??= []).push(s);
  }
  return groups;
}
