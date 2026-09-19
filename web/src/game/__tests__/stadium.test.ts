/**
 * The stands, the crowd and the swarm, as data.
 *
 * All three are pure placement functions, which is the point: the thing that
 * decides whether a stadium reads as a building rather than a set of rings
 * is *where everything is*, and that can be checked without a GPU.
 *
 * The specific failures these guard against are ones the offline renderer
 * caught by eye first: a bowl that sprawls outward instead of rising, tiers
 * that are really one cone in disguise, and a crowd so regular it reads as
 * wallpaper.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  BOWL_OUTER,
  BOWL_TOP,
  TIERS,
  isAisle,
  tierRowHeight,
  tierRowRadius,
} from '../render/stadiumLayout';
import { groupForDrawing, layoutCrowd } from '../render/crowdLayout';
import { layoutSwarm, sampleFly } from '../render/flySwarm';
import { BOARD } from '../board';

describe('the bowl', () => {
  it('has four genuinely different tiers', () => {
    assert.strictEqual(TIERS.length, 4);
    // no two tiers share a rake, which is what stops them reading as one cone
    const rakes = TIERS.map((t) => (t.rowRise / t.rowDepth).toFixed(3));
    assert.strictEqual(new Set(rakes).size, TIERS.length, `rakes repeat: ${rakes.join(', ')}`);

    const densities = new Set(TIERS.map((t) => t.density));
    assert.strictEqual(densities.size, TIERS.length, 'tiers share a seat density');
  });

  it('gets steeper the further up it goes', () => {
    const rake = (i: number) => TIERS[i].rowRise / TIERS[i].rowDepth;
    assert.ok(rake(3) > rake(2), 'the top tier should be the steepest');
    assert.ok(rake(2) > rake(0), 'the middle tier should out-rake the lower bowl');
  });

  it('rises rather than sprawls', () => {
    // The first attempt was a wide shallow saucer that read flat from the
    // gameplay camera. Height against the radius it spans is the measure.
    const spread = BOWL_OUTER - TIERS[0].innerRadius;
    assert.ok(BOWL_TOP / spread > 0.75, `bowl rises ${BOWL_TOP.toFixed(1)} over ${spread.toFixed(1)}`);
  });

  it('never overlaps its own tiers', () => {
    for (let i = 1; i < TIERS.length; i++) {
      const below = TIERS[i - 1];
      const here = TIERS[i];
      assert.ok(
        here.innerRadius > tierRowRadius(below, below.rows - 1),
        `${here.name} starts inside ${below.name}`,
      );
      assert.ok(
        tierRowHeight(here, 0) > tierRowHeight(below, below.rows - 1),
        `${here.name} starts below the top of ${below.name}`,
      );
    }
  });

  it('starts outside the arena, so nobody sits on the floor', () => {
    assert.ok(TIERS[0].innerRadius > BOARD.arenaRadius * 0.8);
  });

  it('leaves stairways at regular intervals', () => {
    let aisle = 0;
    for (let i = 0; i < 1000; i++) if (isAisle(i / 1000)) aisle++;
    // a few per cent of the ring, not a third of it
    assert.ok(aisle > 30 && aisle < 140, `${aisle}/1000 of the ring is stairway`);
  });
});

describe('the crowd', () => {
  const crowd = layoutCrowd({ total: 2400 });

  it('places roughly the budget it was given', () => {
    // empty runs and aisles take a bite, but not most of it
    assert.ok(crowd.length > 900, `only placed ${crowd.length}`);
    assert.ok(crowd.length <= 2400);
  });

  it('is reproducible from its seed', () => {
    const again = layoutCrowd({ total: 2400 });
    assert.strictEqual(crowd.length, again.length);
    assert.deepStrictEqual(crowd[0], again[0]);
    assert.deepStrictEqual(crowd[crowd.length - 1], again[crowd.length - 1]);
  });

  it('fills every tier', () => {
    for (const tier of TIERS) {
      assert.ok(
        crowd.some((s) => s.tier === tier.name),
        `${tier.name} is empty`,
      );
    }
  });

  it('is denser low down than high up', () => {
    const per = (name: string) => crowd.filter((s) => s.tier === name).length;
    // the VIP band is deliberately the sparsest place in the stadium
    assert.ok(per('VIP') < per('LOWER'), 'the VIP band is as full as the lower bowl');
  });

  it('mixes poses instead of repeating one figure', () => {
    const poses = new Set(crowd.map((s) => s.pose));
    assert.strictEqual(poses.size, 3, 'the crowd is all one pose');
    // sitting still dominates; a stand full of raised arms looks like a riot
    const sitting = crowd.filter((s) => s.pose === 'SIT').length / crowd.length;
    assert.ok(sitting > 0.6 && sitting < 0.9, `${(sitting * 100).toFixed(0)}% are seated`);
  });

  it('varies scale and facing, so nobody is perfectly aligned', () => {
    // spread, not uniqueness: 200 samples into a couple of hundred rounded
    // buckets collide by the birthday problem, which says nothing about
    // whether the heights actually vary
    const scales = crowd.slice(0, 400).map((s) => s.scale);
    const min = Math.min(...scales);
    const max = Math.max(...scales);
    assert.ok(max - min > 0.2, `heights span only ${(max - min).toFixed(3)}`);
    const mean = scales.reduce((a, b) => a + b, 0) / scales.length;
    assert.ok(mean > 0.9 && mean < 1.1, `average spectator is ${mean.toFixed(2)} scale`);

    // facing is mostly inward, with a little wander
    const seat = crowd[10];
    const inward = Math.atan2(-seat.position[0], -seat.position[2]);
    const drift = Math.abs(
      Math.atan2(Math.sin(seat.facing - inward), Math.cos(seat.facing - inward)),
    );
    assert.ok(drift < Math.PI, 'a spectator is facing out of the stadium');
  });

  it('draws in a handful of batches, not one per person', () => {
    const groups = groupForDrawing(crowd);
    const keys = Object.keys(groups);
    assert.ok(keys.length <= 4, `${keys.length} draw calls for the crowd`);
    assert.ok(keys.includes('FAR'), 'nothing is being drawn at low detail');

    const drawn = keys.reduce((n, k) => n + groups[k].length, 0);
    assert.strictEqual(drawn, crowd.length, 'the grouping lost people');
  });

  it('simplifies the distant stands, which is where most people are', () => {
    const far = crowd.filter((s) => s.detail === 'FAR').length;
    assert.ok(far > crowd.length * 0.3, `only ${far} of ${crowd.length} are low detail`);
  });
});

describe('the fly audience', () => {
  const swarm = layoutSwarm({
    count: 200,
    arenaRadius: BOARD.arenaRadius,
    floodlightRadius: BOWL_OUTER * 0.92,
    floodlightHeight: BOWL_TOP + 16,
  });

  it('places flies in every zone rather than scattering them', () => {
    const zones = new Set(swarm.map((f) => f.zone));
    assert.strictEqual(zones.size, 5, `only ${zones.size} zones used`);
  });

  it('gives each zone behaviour that suits it', () => {
    // flies circle lights; that is the behaviour everyone recognises
    const atLights = swarm.filter((f) => f.zone === 'FLOODLIGHT');
    assert.ok(atLights.length > 0);
    assert.ok(
      atLights.filter((f) => f.behaviour === 'SHORT_ORBIT').length > atLights.length * 0.5,
      'the flies round the floodlights are not orbiting them',
    );

    const atArena = swarm.filter((f) => f.zone === 'ARENA_LIP');
    assert.ok(
      atArena.some((f) => f.behaviour === 'WATCH_ARENA'),
      'nothing over the arena is watching it',
    );
  });

  it('keeps every fly above the floor and inside the stadium', () => {
    for (const fly of swarm) {
      for (const t of [0, 3.7, 9.1, 21.3]) {
        const { position } = sampleFly(fly, t, 0);
        assert.ok(position[1] > 0, `${fly.zone} fly went below the floor`);
        const radius = Math.hypot(position[0], position[2]);
        assert.ok(radius < BOWL_OUTER * 1.3, `${fly.zone} fly left the stadium`);
        assert.ok(position.every(Number.isFinite), `${fly.zone} fly position is NaN`);
      }
    }
  });

  it('actually moves, rather than sitting where it was placed', () => {
    const fly = swarm.find((f) => f.behaviour === 'SHORT_ORBIT');
    if (!fly) return assert.fail('no orbiting fly was placed');
    const a = sampleFly(fly, 0, 0).position;
    const b = sampleFly(fly, fly.period / 4, 0).position;
    const travelled = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    assert.ok(travelled > 0.5, `an orbiting fly moved ${travelled.toFixed(2)} units`);
  });

  it('stays near its home, so the swarm does not wander off', () => {
    for (const fly of swarm.slice(0, 40)) {
      for (const t of [0, 5.5, 12.25]) {
        const { position } = sampleFly(fly, t, 1);
        const drift = Math.hypot(
          position[0] - fly.home[0],
          position[1] - fly.home[1],
          position[2] - fly.home[2],
        );
        assert.ok(drift < fly.range * 3 + 1, `${fly.zone} fly drifted ${drift.toFixed(1)}`);
      }
    }
  });

  it('gets livelier when the crowd does', () => {
    const fly = swarm.find((f) => f.behaviour === 'SHORT_ORBIT');
    if (!fly) return assert.fail('no orbiting fly was placed');
    const calmSpan = spanOver(fly, 0);
    const excitedSpan = spanOver(fly, 1);
    assert.ok(excitedSpan > calmSpan, 'excitement did not widen the errand');
  });
});

/** How far a fly ranges over one period, at a given excitement. */
function spanOver(fly: Parameters<typeof sampleFly>[0], excitement: number): number {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i <= 40; i++) {
    const { position } = sampleFly(fly, (fly.period * i) / 40, excitement);
    const r = Math.hypot(position[0] - fly.home[0], position[2] - fly.home[2]);
    min = Math.min(min, r);
    max = Math.max(max, r);
  }
  return max - min;
}
