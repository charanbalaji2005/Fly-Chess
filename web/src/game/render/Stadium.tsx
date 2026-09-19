/**
 * The stadium.
 *
 * An open-air bowl under the sky: concourse, twelve rows of raked seating
 * broken by four vomitories, a cantilevered roof ring, floodlight masts and
 * the four corner banners. The crowd that fills it is in `Crowd.tsx`; the sky
 * above it is in `Sky.tsx`.
 *
 * Everything here is structure and lighting. It is built once and never
 * re-rendered, and it is deliberately lower in contrast than the board --
 * a stadium that competes with the pitch is a stadium nobody can play in.
 */

import { useMemo } from 'react';
import { Color, DoubleSide } from 'three';

import { BOARD, seatAngle } from '../board';
import { COLOR_HEX, SEAT_COLORS } from '../rules';
import type { SeatId } from '../types';
import {
  BOWL,
  BOWL_OUTER,
  BOWL_TOP,
  TIERS,
  tierRowHeight,
  tierRowRadius,
  type Tier,
} from './stadiumLayout';
import type { EnvironmentPreset } from '../environment';

export function Stadium({
  quality,
  seats,
  env,
}: {
  quality: 'LOW' | 'MEDIUM' | 'HIGH';
  /** Only seats actually in the match get a banner and a pylon. */
  seats: SeatId[];
  env: EnvironmentPreset;
}) {
  return (
    <group name="stadium">
      <Pitch env={env} />
      <SeatingBowl quality={quality} />
      <Roof quality={quality} />
      <Floodlights quality={quality} env={env} />
      {seats.map((seat) => (
        <CornerBanner key={seat} seat={seat} />
      ))}
      <Lighting quality={quality} env={env} />
    </group>
  );
}

// ---------------------------------------------------------------------------
// the pitch
// ---------------------------------------------------------------------------

/** The floor the board stands on: the stadium's equivalent of the turf. */
function Pitch({ env }: { env: EnvironmentPreset }) {
  // the pitch goes cooler and darker at night, but never to black
  const deck = env.mode === 'SUN' ? '#2e4e6d' : '#1b3049';
  const rim = env.mode === 'SUN' ? '#26415c' : '#152740';
  const groove = env.mode === 'SUN' ? '#3b6288' : '#2a4869';
  const grooves = useMemo(
    () => [BOARD.arenaRadius - 2, BOARD.arenaRadius - 7, BOARD.arenaRadius - 12],
    [],
  );

  return (
    <group>
      <mesh position={[0, -BOARD.slab - 0.4, 0]} receiveShadow>
        <cylinderGeometry
          args={[BOWL.innerRadius, BOWL.innerRadius + 1, 0.8, 96]}
        />
        <meshStandardMaterial color={rim} roughness={0.9} metalness={0.05} />
      </mesh>

      {/* a lighter inner disc, so the board sits on something */}
      <mesh position={[0, -BOARD.slab + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[BOARD.arenaRadius, 96]} />
        <meshStandardMaterial color={deck} roughness={0.88} metalness={0.05} />
      </mesh>

      {grooves.map((r, i) => (
        <mesh key={i} position={[0, -BOARD.slab + 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[r - 0.18, r, 128]} />
          <meshStandardMaterial color={groove} roughness={0.85} side={DoubleSide} />
        </mesh>
      ))}

      {/* four inlaid spokes tying the board to the stands */}
      {([0, 1, 2, 3] as SeatId[]).map((seat) => {
        const angle = seatAngle(seat);
        const r0 = BOARD.size * 0.76;
        const r1 = BOWL.innerRadius - 1;
        const mid = (r0 + r1) / 2;
        return (
          <mesh
            key={seat}
            position={[Math.cos(angle) * mid, -BOARD.slab + 0.03, -Math.sin(angle) * mid]}
            rotation={[-Math.PI / 2, 0, angle]}
          >
            <planeGeometry args={[r1 - r0, 2.6]} />
            <meshStandardMaterial
              color={COLOR_HEX[SEAT_COLORS[seat]]}
              transparent
              opacity={0.28}
              side={DoubleSide}
            />
          </mesh>
        );
      })}
    </group>
  );
}

// ---------------------------------------------------------------------------
// seating
// ---------------------------------------------------------------------------

/**
 * The raked bowl.
 *
 * Each row is a riser and a tread. Drawing them as separate rings rather than
 * one cone is what gives the bowl its stepped silhouette against the sky,
 * which is most of what makes it read as a stadium rather than a funnel.
 */
function SeatingBowl({ quality }: { quality: 'LOW' | 'MEDIUM' | 'HIGH' }) {
  const segments = quality === 'LOW' ? 48 : 96;

  return (
    <group name="seating">
      {/* the wall the lowest tier sits on, between arena floor and stands */}
      <mesh position={[0, -BOARD.slab + TIERS[0].baseHeight / 2, 0]}>
        <cylinderGeometry
          args={[
            TIERS[0].innerRadius,
            TIERS[0].innerRadius,
            TIERS[0].baseHeight,
            segments,
            1,
            true,
          ]}
        />
        <meshStandardMaterial color="#16212e" roughness={0.9} side={DoubleSide} />
      </mesh>

      {TIERS.map((tier, i) => (
        <TierStand
          key={tier.name}
          tier={tier}
          segments={segments}
          // the top of the tier below, so this tier's parapet reaches it
          // exactly instead of leaving a band of sky between the two
          floor={
            i === 0
              ? -BOARD.slab
              : tierRowHeight(TIERS[i - 1], TIERS[i - 1].rows - 1)
          }
        />
      ))}
    </group>
  );
}

/**
 * One tier: its rows, the concourse behind it, and the rail at its lip.
 *
 * Each tier is drawn as its own structure rather than as a slice of one
 * cone. The concourse gap and the parapet between tiers are what give the
 * stands read-at-a-glance depth -- a stepped building instead of a striped
 * wall.
 */
function TierStand({
  tier,
  segments,
  floor,
}: {
  tier: Tier;
  segments: number;
  /** Height of whatever this tier's parapet drops to. */
  floor: number;
}) {
  const rows = useMemo(() => Array.from({ length: tier.rows }, (_, i) => i), [tier.rows]);
  const lipRadius = tierRowRadius(tier, 0);
  const lipHeight = tierRowHeight(tier, 0);

  // the VIP band is darker and warmer than the public stands
  const vip = tier.name === 'VIP';

  return (
    <group name={`tier-${tier.name}`}>
      {/* the parapet this tier stands on, dropping exactly to the level
          below so no sky shows through the concourse */}
      <mesh position={[0, (lipHeight + floor) / 2, 0]}>
        <cylinderGeometry
          args={[lipRadius, lipRadius, Math.max(0.5, lipHeight - floor), segments, 1, true]}
        />
        <meshStandardMaterial
          color={vip ? '#241f1a' : '#131c27'}
          roughness={0.88}
          metalness={0.12}
          side={DoubleSide}
        />
      </mesh>

      {/* a hairline of light along the lip, which reads as a handrail from
          any distance and costs one mesh */}
      <mesh position={[0, lipHeight + 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[lipRadius - 0.12, lipRadius + 0.02, segments]} />
        <meshBasicMaterial
          color={vip ? '#c8a24a' : '#3f6d86'}
          transparent
          opacity={0.6}
          side={DoubleSide}
          toneMapped={false}
        />
      </mesh>

      {rows.map((row) => {
        const r = tierRowRadius(tier, row);
        const y = tierRowHeight(tier, row);
        // each tier keeps its own value range, so the break between them is
        // visible even where the geometry is hidden behind people
        const base = vip ? 0.13 : 0.17 + (row / tier.rows) * 0.09;
        return (
          <group key={row}>
            <mesh position={[0, y - tier.rowRise / 2, 0]}>
              <cylinderGeometry args={[r, r, tier.rowRise, segments, 1, true]} />
              <meshStandardMaterial
                color={new Color(base * 0.72, base * 0.82, base)}
                roughness={0.95}
                side={DoubleSide}
              />
            </mesh>
            <mesh position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
              <ringGeometry args={[r, r + tier.rowDepth, segments]} />
              <meshStandardMaterial
                color={new Color(base * 0.56, base * 0.64, base * 0.8)}
                roughness={0.95}
                side={DoubleSide}
              />
            </mesh>
          </group>
        );
      })}

      <Vomitories tier={tier} />
    </group>
  );
}

/**
 * The stairways cutting up through a tier.
 *
 * `isAisle` already leaves these gaps empty of people; this puts something
 * in them, so the gap reads as a stairway rather than as missing crowd.
 */
function Vomitories(_props: { tier: Tier }) {
  // Aisle gaps are already carved naturally into the stands by isAisle.
  // We do not render diagonal intersecting slabs that pierce through the seats.
  return null;
}

// ---------------------------------------------------------------------------
// roof
// ---------------------------------------------------------------------------

/** A cantilevered ring over the back rows, with an exposed truss edge. */
function Roof({ quality }: { quality: 'LOW' | 'MEDIUM' | 'HIGH' }) {
  const segments = quality === 'LOW' ? 48 : 96;
  const inner = BOWL_OUTER - 7;
  const outer = BOWL_OUTER + 7;
  const y = BOWL_TOP + 10;

  return (
    <group>
      {/* the canopy, seen from below by the camera */}
      <mesh position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[inner, outer, segments]} />
        <meshStandardMaterial
          color="#43596f"
          roughness={0.75}
          metalness={0.35}
          side={DoubleSide}
        />
      </mesh>

      {/* fascia, which gives the roof a visible thickness */}
      <mesh position={[0, y - 0.7, 0]}>
        <cylinderGeometry args={[inner, inner, 1.4, segments, 1, true]} />
        <meshStandardMaterial color="#1f2d3d" roughness={0.8} side={DoubleSide} />
      </mesh>

      {/* support columns */}
      {Array.from({ length: quality === 'LOW' ? 12 : 24 }, (_, i) => {
        const a = (i / (quality === 'LOW' ? 12 : 24)) * Math.PI * 2;
        const r = BOWL_OUTER + 4;
        return (
          <mesh
            key={i}
            position={[Math.cos(a) * r, (y + BOWL_TOP) / 2 - 2, -Math.sin(a) * r]}
          >
            <cylinderGeometry args={[0.45, 0.6, y - BOWL_TOP + 8, 8]} />
            <meshStandardMaterial color="#334963" roughness={0.6} metalness={0.5} />
          </mesh>
        );
      })}
    </group>
  );
}

// ---------------------------------------------------------------------------
// floodlights
// ---------------------------------------------------------------------------

/** Masts on the roofline. Structure only -- the lighting itself is below. */
function Floodlights({
  quality,
  env,
}: {
  quality: 'LOW' | 'MEDIUM' | 'HIGH';
  env: EnvironmentPreset;
}) {
  const masts = quality === 'LOW' ? 4 : 8;
  const y = BOWL_TOP + 15;
  const r = BOWL_OUTER + 2;

  return (
    <group>
      {Array.from({ length: masts }, (_, i) => {
        const a = (i / masts) * Math.PI * 2 + Math.PI / masts;
        const x = Math.cos(a) * r;
        const z = -Math.sin(a) * r;
        return (
          <group key={i} position={[x, y, z]} rotation={[0, a, 0]}>
            <mesh>
              <boxGeometry args={[5.5, 2.6, 0.5]} />
              <meshStandardMaterial color="#22303f" roughness={0.7} metalness={0.4} />
            </mesh>
            {/* the lamp panel, aimed inward */}
            <mesh position={[0, 0, 0.32]} rotation={[0.45, 0, 0]}>
              <planeGeometry args={[5.1, 2.2]} />
              <meshStandardMaterial
                color="#ffffff"
                emissive="#fff6e0"
                emissiveIntensity={env.floodEmissive}
                side={DoubleSide}
                toneMapped={false}
              />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

// ---------------------------------------------------------------------------
// banners
// ---------------------------------------------------------------------------

/**
 * A hanging banner in each active player's colour.
 *
 * Only players actually in the match get one, so a two-player table does not
 * look like it is missing two competitors.
 */
function CornerBanner({ seat }: { seat: SeatId }) {
  const angle = seatAngle(seat);
  const r = BOWL.innerRadius - 0.6;
  const colour = COLOR_HEX[SEAT_COLORS[seat]];
  const y = -BOARD.slab + BOWL.baseHeight / 2;

  return (
    <group
      position={[Math.cos(angle) * r, y, -Math.sin(angle) * r]}
      rotation={[0, angle - Math.PI / 2, 0]}
    >
      <mesh>
        <planeGeometry args={[11, BOWL.baseHeight * 0.8]} />
        <meshStandardMaterial
          color={colour}
          emissive={colour}
          emissiveIntensity={0.45}
          side={DoubleSide}
          toneMapped={false}
        />
      </mesh>
      {/* a darker inset stripe, so it reads as printed rather than glowing */}
      <mesh position={[0, 0, 0.02]}>
        <planeGeometry args={[10.2, BOWL.baseHeight * 0.3]} />
        <meshStandardMaterial color="#0f1720" side={DoubleSide} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------
// lighting
// ---------------------------------------------------------------------------

/**
 * Daylight.
 *
 * One sun casting the shadows, a sky fill from above, a bounce from the
 * pitch, and four warm floods from the roofline. Bright enough that the board
 * is legible before it is atmospheric -- which for a board game is the
 * requirement, not a preference.
 */
function Lighting({
  quality,
  env,
}: {
  quality: 'LOW' | 'MEDIUM' | 'HIGH';
  env: EnvironmentPreset;
}) {
  const shadows = quality === 'HIGH';
  const key: [number, number, number] = [
    env.lightDirection[0] * 120,
    env.lightDirection[1] * 120,
    env.lightDirection[2] * 120,
  ];

  return (
    <group>
      {/* sky fill above, ground bounce below */}
      <hemisphereLight args={[env.hemiSky, env.hemiGround, env.hemiIntensity]} />
      <ambientLight intensity={env.ambientIntensity} color={env.ambientColor} />

      <directionalLight
        position={key}
        intensity={env.keyIntensity}
        color={env.keyColor}
        castShadow={shadows}
        shadow-mapSize-width={shadows ? 2048 : 1024}
        shadow-mapSize-height={shadows ? 2048 : 1024}
        shadow-camera-left={-40}
        shadow-camera-right={40}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
        shadow-camera-near={1}
        shadow-camera-far={260}
        shadow-bias={-0.0005}
      />

      {/* cool counter-fill, so shadowed faces keep their colour */}
      <directionalLight
        position={[-70, 40, 60]}
        intensity={env.fillIntensity}
        color={env.fillColor}
      />

      {/*
        The board's own light.
        
        A stadium lit evenly is a stadium with no subject. This is a tight
        spot over the squares alone -- its cone barely reaches the arena
        floor -- so the board sits a clear stop brighter than everything
        around it and the eye goes there first. It is also what makes the
        pieces throw readable shadows onto the squares rather than being
        flatly lit from every side.
      */}
      <spotLight
        position={[6, 46, 18]}
        target-position={[0, 0, 0]}
        angle={0.46}
        penumbra={0.75}
        intensity={env.mode === 'NIGHT' ? 900 : 620}
        distance={130}
        decay={1.35}
        color={env.mode === 'NIGHT' ? '#eaf2ff' : '#fff6e6'}
        castShadow={shadows}
        shadow-mapSize-width={shadows ? 2048 : 1024}
        shadow-mapSize-height={shadows ? 2048 : 1024}
        shadow-camera-near={8}
        shadow-camera-far={120}
        shadow-bias={-0.0004}
      />

      {/* a soft counter from the opposite corner, to keep the dark squares
          from going to mud under that spot */}
      <pointLight
        position={[-16, 22, -14]}
        intensity={env.mode === 'NIGHT' ? 120 : 90}
        distance={70}
        decay={1.8}
        color="#bcd2f0"
      />

      {/* the floodlights, as actual lights over the board */}
      {Array.from({ length: 4 }, (_, i) => {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        return (
          <pointLight
            key={i}
            position={[
              Math.cos(a) * (BOWL.innerRadius - 4),
              BOWL_TOP + 10,
              -Math.sin(a) * (BOWL.innerRadius - 4),
            ]}
            intensity={env.floodIntensity}
            distance={160}
            decay={1.5}
            color="#fff3dc"
          />
        );
      })}
    </group>
  );
}
