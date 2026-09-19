/**
 * The Drosophila in the stands.
 *
 * They were static: placed once above the back rows and left there, bobbing
 * on a shader phase. A fly that never goes anywhere is a speck, and a few
 * hundred specks hanging in mid-air read as dust.
 *
 * So each one now has a home, a destination and an errand. It drifts to the
 * destination, loiters, picks another. The behaviour is deliberately cheap
 * -- ease toward a point, add an oscillation -- because there are hundreds
 * of them and none is ever the subject of the shot. No steering forces, no
 * neighbour queries, no physics.
 *
 * They are also placed in **zones** rather than scattered: over the arena
 * lip, along the tier rails, in the vomitory gaps and around the floodlights.
 * Insects gather where there is an edge or a light, and placing them that
 * way is most of what makes them read as animals rather than as particles.
 *
 * Pure arithmetic and a seeded generator, so it can be tested without a GPU
 * and the same match always draws the same swarm.
 */

import { TIERS, VOMITORIES, tierRowHeight, tierRowRadius } from './stadiumLayout';

export type FlyZone = 'ARENA_LIP' | 'TIER_RAIL' | 'VOMITORY' | 'FLOODLIGHT' | 'HIGH_DRIFT';

export type FlyBehaviour = 'HOVER' | 'SHORT_ORBIT' | 'PATROL' | 'WATCH_ARENA';

export interface SwarmFly {
  zone: FlyZone;
  behaviour: FlyBehaviour;
  /** Where it returns to. */
  home: [number, number, number];
  /** Radius of the errand it makes around home. */
  range: number;
  /** Seconds for one circuit. */
  period: number;
  phase: number;
  scale: number;
  /** How strongly it reacts to the crowd getting loud. */
  energy: number;
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Roughly how the population is split between zones. */
const ZONE_SHARE: [FlyZone, number][] = [
  ['ARENA_LIP', 0.3],
  ['TIER_RAIL', 0.28],
  ['VOMITORY', 0.16],
  ['FLOODLIGHT', 0.16],
  ['HIGH_DRIFT', 0.1],
];

const BEHAVIOUR_BY_ZONE: Record<FlyZone, [FlyBehaviour, number][]> = {
  // over the arena they mostly face in and watch
  ARENA_LIP: [
    ['WATCH_ARENA', 0.55],
    ['HOVER', 0.3],
    ['SHORT_ORBIT', 0.15],
  ],
  TIER_RAIL: [
    ['HOVER', 0.5],
    ['PATROL', 0.3],
    ['SHORT_ORBIT', 0.2],
  ],
  VOMITORY: [
    ['PATROL', 0.6],
    ['HOVER', 0.4],
  ],
  // insects circle lights; this is the one everyone recognises
  FLOODLIGHT: [
    ['SHORT_ORBIT', 0.75],
    ['HOVER', 0.25],
  ],
  HIGH_DRIFT: [
    ['PATROL', 0.7],
    ['HOVER', 0.3],
  ],
};

function pick<T>(options: [T, number][], r: number): T {
  let acc = 0;
  for (const [value, weight] of options) {
    acc += weight;
    if (r <= acc) return value;
  }
  return options[options.length - 1][0];
}

export interface SwarmOptions {
  count: number;
  /** Radius of the arena floor, for the lip zone. */
  arenaRadius: number;
  /** Where the floodlight masts stand. */
  floodlightRadius: number;
  floodlightHeight: number;
  seed?: number;
}

export function layoutSwarm({
  count,
  arenaRadius,
  floodlightRadius,
  floodlightHeight,
  seed = 0xf1ab,
}: SwarmOptions): SwarmFly[] {
  const random = rng(seed);
  const out: SwarmFly[] = [];

  for (const [zone, share] of ZONE_SHARE) {
    const n = Math.round(count * share);

    for (let i = 0; i < n; i++) {
      const angle = random() * Math.PI * 2;
      let home: [number, number, number];
      let range: number;

      switch (zone) {
        case 'ARENA_LIP': {
          const r = arenaRadius * (0.72 + random() * 0.22);
          home = [Math.cos(angle) * r, 3 + random() * 5, -Math.sin(angle) * r];
          range = 1.6 + random() * 2.2;
          break;
        }
        case 'TIER_RAIL': {
          // just above the lip of one of the tiers
          const tier = TIERS[Math.floor(random() * TIERS.length)];
          const r = tierRowRadius(tier, 0) - 0.4;
          home = [
            Math.cos(angle) * r,
            tierRowHeight(tier, 0) + 1 + random() * 2,
            -Math.sin(angle) * r,
          ];
          range = 1.2 + random() * 1.8;
          break;
        }
        case 'VOMITORY': {
          // in the stairway gaps, where there are no people
          const v = Math.floor(random() * VOMITORIES) / VOMITORIES;
          const a = v * Math.PI * 2;
          const tier = TIERS[Math.floor(random() * TIERS.length)];
          const r = tierRowRadius(tier, tier.rows * random());
          home = [
            Math.cos(a) * r,
            tierRowHeight(tier, tier.rows * 0.5) + 1.5 + random() * 2,
            -Math.sin(a) * r,
          ];
          range = 1 + random() * 1.4;
          break;
        }
        case 'FLOODLIGHT': {
          const mast = Math.floor(random() * 4) / 4;
          const a = mast * Math.PI * 2 + Math.PI / 4;
          home = [
            Math.cos(a) * floodlightRadius,
            floodlightHeight - 2 - random() * 5,
            -Math.sin(a) * floodlightRadius,
          ];
          // wide, lazy circles round the lamp
          range = 2.5 + random() * 3.5;
          break;
        }
        default: {
          const r = arenaRadius * (1.1 + random() * 0.9);
          home = [Math.cos(angle) * r, 16 + random() * 14, -Math.sin(angle) * r];
          range = 3 + random() * 5;
          break;
        }
      }

      out.push({
        zone,
        behaviour: pick(BEHAVIOUR_BY_ZONE[zone], random()),
        home,
        range,
        period: 5 + random() * 11,
        phase: random() * Math.PI * 2,
        scale: 0.55 + random() * 0.7,
        energy: 0.3 + random() * 0.7,
      });
    }
  }

  return out;
}

export interface FlyPose {
  position: [number, number, number];
  /** Yaw, in radians. */
  facing: number;
}

/**
 * Where a fly is now.
 *
 * Deliberately closed-form rather than integrated: no per-fly state to keep,
 * no drift, no divergence between clients, and the whole swarm can be
 * recomputed from scratch on any frame that needs it.
 *
 * `excitement` widens the errands and speeds them up, which is how the swarm
 * reacts to a capture or a checkmate without any extra system.
 */
export function sampleFly(fly: SwarmFly, time: number, excitement = 0): FlyPose {
  const agitation = 1 + excitement * 1.6;
  const t = (time / fly.period) * Math.PI * 2 * agitation + fly.phase;
  const range = fly.range * (1 + excitement * 0.5);

  let x = fly.home[0];
  let y = fly.home[1];
  let z = fly.home[2];
  let facing: number;

  switch (fly.behaviour) {
    case 'SHORT_ORBIT':
      x += Math.cos(t) * range;
      z += Math.sin(t) * range;
      y += Math.sin(t * 1.7) * range * 0.3;
      // facing along the tangent of the circle
      facing = -t + Math.PI / 2;
      break;

    case 'PATROL':
      // a slow figure of eight, which looks like purpose rather than drift
      x += Math.sin(t) * range;
      z += Math.sin(t * 2) * range * 0.5;
      y += Math.cos(t * 0.7) * range * 0.25;
      facing = Math.atan2(Math.cos(t) * range, Math.cos(t * 2) * range);
      break;

    case 'WATCH_ARENA':
      // barely moves, and keeps looking at the middle
      x += Math.sin(t * 0.6) * range * 0.35;
      y += Math.sin(t * 1.3) * range * 0.3;
      z += Math.cos(t * 0.5) * range * 0.35;
      facing = Math.atan2(-x, -z);
      break;

    default:
      x += Math.sin(t) * range * 0.5;
      y += Math.sin(t * 1.9) * range * 0.45;
      z += Math.cos(t * 0.8) * range * 0.5;
      facing = t * 0.2;
      break;
  }

  return { position: [x, y, z], facing };
}
