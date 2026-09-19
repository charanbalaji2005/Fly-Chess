/**
 * The shape of the stands.
 *
 * The old bowl was twelve identical rows on one cone: same rake, same depth,
 * same density all the way up. That reads as a striped wall rather than a
 * building, and no amount of better spectator geometry fixes it, because the
 * problem is the architecture behind them.
 *
 * So the seating is now four distinct tiers separated by concourses, each
 * with its own rake, depth, height and crowd density. The rake is steep on
 * purpose -- a shallow bowl of this radius sprawls outward and reads flat
 * from the gameplay camera, which is what the first attempt did. The breaks
 * between the tiers are what give the stands depth: a gap with a walkway and a railing in
 * it reads as a real structure in a way that row thirteen of twenty never
 * does.
 *
 * All of it is plain arithmetic -- no Three.js -- so the audience system,
 * the architecture and the offline renderer all derive their positions from
 * one source.
 */

import { BOARD } from '../board';

export interface Tier {
  name: 'LOWER' | 'VIP' | 'MIDDLE' | 'UPPER';
  rows: number;
  /** Radius of this tier's first row. */
  innerRadius: number;
  /** Height of this tier's first row. */
  baseHeight: number;
  /** Horizontal depth of one row. */
  rowDepth: number;
  /** Vertical rise of one row. Steeper the higher you go, as in a real bowl. */
  rowRise: number;
  /** How full this tier is, 0..1. */
  occupancy: number;
  /** Seats per row at this radius, before aisles and gaps. */
  density: number;
}

/**
 * Four tiers, deliberately unalike.
 *
 * The VIP band is the giveaway detail: shallow, sparse, set back behind its
 * own parapet. A stadium where every level is equally packed with equally
 * spaced people is a stadium nobody built.
 */
export const TIERS: Tier[] = [
  {
    name: 'LOWER',
    rows: 6,
    innerRadius: BOARD.stationRadius + 5,
    baseHeight: 1.4,
    rowDepth: 1.25,
    rowRise: 1.05,
    occupancy: 0.9,
    density: 150,
  },
  {
    name: 'VIP',
    rows: 2,
    innerRadius: BOARD.stationRadius + 5 + 6 * 1.25 + 2.4,
    baseHeight: 1.4 + 6 * 1.05 + 2.8,
    rowDepth: 2.0,
    rowRise: 1.2,
    // half empty, and the seats are wider apart
    occupancy: 0.45,
    density: 84,
  },
  {
    name: 'MIDDLE',
    rows: 7,
    innerRadius: BOARD.stationRadius + 5 + 6 * 1.25 + 2.4 + 2 * 2.0 + 2.6,
    baseHeight: 1.4 + 6 * 1.05 + 2.8 + 2 * 1.2 + 3.4,
    rowDepth: 1.3,
    rowRise: 1.5,
    occupancy: 0.82,
    density: 210,
  },
  {
    name: 'UPPER',
    rows: 9,
    innerRadius:
      BOARD.stationRadius + 5 + 6 * 1.25 + 2.4 + 2 * 2.0 + 2.6 + 7 * 1.3 + 3.0,
    baseHeight: 1.4 + 6 * 1.05 + 2.8 + 2 * 1.2 + 3.4 + 7 * 1.5 + 3.8,
    rowDepth: 1.35,
    // steepest, as the cheap seats always are
    rowRise: 1.9,
    occupancy: 0.7,
    density: 280,
  },
];

/** Radius of a row within a tier. */
export const tierRowRadius = (tier: Tier, row: number): number =>
  tier.innerRadius + row * tier.rowDepth;

/** Height of a row within a tier, relative to the arena floor. */
export const tierRowHeight = (tier: Tier, row: number): number =>
  -BOARD.slab + tier.baseHeight + row * tier.rowRise;

/** The outermost radius of the seating, where the roof springs from. */
export const BOWL_OUTER = (() => {
  const top = TIERS[TIERS.length - 1];
  return tierRowRadius(top, top.rows);
})();

/** The height of the back of the top tier. */
export const BOWL_TOP = (() => {
  const top = TIERS[TIERS.length - 1];
  return tierRowHeight(top, top.rows);
})();

/** Total rows across every tier; used for budgeting spectators. */
export const TOTAL_ROWS = TIERS.reduce((n, t) => n + t.rows, 0);

/**
 * Kept for the parts of the scene that only need the overall envelope.
 *
 * The seating itself reads `TIERS`; this is the bounding description.
 */
export const BOWL = {
  innerRadius: TIERS[0].innerRadius,
  rows: TOTAL_ROWS,
  rowDepth: 1.8,
  rowRise: 1.35,
  baseHeight: TIERS[0].baseHeight,
} as const;

/** Radius of a given row counted across all tiers, for coarse callers. */
export function rowRadius(row: number): number {
  let n = row;
  for (const tier of TIERS) {
    if (n < tier.rows) return tierRowRadius(tier, n);
    n -= tier.rows;
  }
  return BOWL_OUTER;
}

/** Height of a given row counted across all tiers. */
export function rowHeight(row: number): number {
  let n = row;
  for (const tier of TIERS) {
    if (n < tier.rows) return tierRowHeight(tier, n);
    n -= tier.rows;
  }
  return BOWL_TOP;
}

/**
 * A seat position on the bowl.
 *
 * `t` runs 0..1 around the ring. Returns the world position of the seat and
 * the angle it faces, which is always inward -- a stadium where the crowd
 * faces outward looks instantly wrong.
 */
export function seatAt(
  row: number,
  t: number,
): { position: [number, number, number]; facing: number } {
  const angle = t * Math.PI * 2;
  const r = rowRadius(row) + BOWL.rowDepth * 0.52;
  return {
    position: [Math.cos(angle) * r, rowHeight(row), -Math.sin(angle) * r],
    facing: angle - Math.PI / 2,
  };
}

/** A seat within a named tier. */
export function tierSeatAt(
  tier: Tier,
  row: number,
  t: number,
): { position: [number, number, number]; facing: number } {
  const angle = t * Math.PI * 2;
  const r = tierRowRadius(tier, row) + tier.rowDepth * 0.52;
  return {
    position: [Math.cos(angle) * r, tierRowHeight(tier, row), -Math.sin(angle) * r],
    facing: angle - Math.PI / 2,
  };
}

/** How many vomitories cut through the stands. */
export const VOMITORIES = 6;

/**
 * Gaps in the seating, for the vomitories.
 *
 * Returns true when this position on the ring is a stairway rather than a
 * seat. Real bowls have them, and they break up what is otherwise an
 * unbroken band of identical people.
 */
export function isAisle(t: number): boolean {
  const a = (t * VOMITORIES) % 1;
  return a < 0.045 || a > 0.955;
}
