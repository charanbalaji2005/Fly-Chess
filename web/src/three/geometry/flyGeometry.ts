/**
 * Procedural geometry for the Drosophila body.
 *
 * Everything is built once at module scope and reused, because none of it
 * animates: the fly is a static anatomical frame that the connectome lives
 * inside. Parts that share a material are merged into single buffers so the
 * whole external anatomy costs a handful of draw calls rather than sixty.
 *
 * Proportions come from flyAnatomy.ts. See the warning there: this is authored
 * geometry, not a scan.
 */

import {
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  Matrix4,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import {
  ABDOMEN,
  ANTENNAE,
  EYES,
  HALTERES,
  HEAD,
  LEGS,
  NECK,
  PROBOSCIS,
  SCUTELLUM,
  THORAX,
  WINGS,
} from '../flyAnatomy';

// ---------------------------------------------------------------------------
// primitives
// ---------------------------------------------------------------------------

function ellipsoid(
  radii: Vector3,
  center: Vector3,
  segments = 48,
  rings = 32,
): BufferGeometry {
  const g = new SphereGeometry(1, segments, rings);
  g.scale(radii.x, radii.y, radii.z);
  g.translate(center.x, center.y, center.z);
  return g;
}

/**
 * A tapered tube between two points.
 *
 * Used for every limb segment, antenna and haltere stalk. CylinderGeometry is
 * built along +y, so it is rotated onto the segment direction by the shortest
 * arc from +y to that direction.
 */
function taperedTube(
  from: Vector3,
  to: Vector3,
  radiusStart: number,
  radiusEnd: number,
  radialSegments = 10,
): BufferGeometry {
  const dir = new Vector3().subVectors(to, from);
  const length = dir.length();
  if (length < 1e-6) return new BufferGeometry();

  const g = new CylinderGeometry(radiusEnd, radiusStart, length, radialSegments, 1, false);
  const quaternion = new Quaternion().setFromUnitVectors(
    new Vector3(0, 1, 0),
    dir.clone().normalize(),
  );
  const midpoint = new Vector3().addVectors(from, to).multiplyScalar(0.5);
  g.applyMatrix4(new Matrix4().compose(midpoint, quaternion, new Vector3(1, 1, 1)));
  return g;
}

function joint(at: Vector3, radius: number): BufferGeometry {
  const g = new SphereGeometry(radius, 10, 8);
  g.translate(at.x, at.y, at.z);
  return g;
}

function mergeAll(parts: BufferGeometry[]): BufferGeometry {
  const usable = parts.filter((g) => g.getAttribute('position'));
  const merged = mergeGeometries(usable, false);
  usable.forEach((g) => g.dispose());
  if (!merged) throw new Error('Failed to merge fly geometry');
  merged.computeVertexNormals();
  return merged;
}

// ---------------------------------------------------------------------------
// head
// ---------------------------------------------------------------------------

/**
 * Head capsule, flattened front-to-back and notched where the eyes sit.
 *
 * The notch matters: without it the eyes look glued on, and the eyes are what
 * make the silhouette read as a fly.
 */
export function buildHeadGeometry(): BufferGeometry {
  const g = ellipsoid(HEAD.radii, new Vector3(0, 0, 0), 64, 48);
  const pos = g.getAttribute('position') as BufferAttribute;
  const v = new Vector3();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const lateral = Math.abs(v.x) / HEAD.radii.x;
    // draw the lateral walls inward so the compound eyes seat into a socket
    const socket = 1 - 0.3 * Math.pow(Math.max(0, lateral - 0.25) / 0.75, 1.5);
    v.x *= socket;
    v.z *= socket;
    // flatten the face slightly and round the back of the head
    if (v.z > 0) v.z *= 0.92;
    // the vertex is above the mouthparts: pinch toward the proboscis base
    if (v.y < -HEAD.radii.y * 0.5) {
      const t = (-v.y - HEAD.radii.y * 0.5) / (HEAD.radii.y * 0.5);
      v.x *= 1 - 0.35 * t;
      v.z *= 1 - 0.2 * t;
    }
    pos.setXYZ(i, v.x, v.y, v.z);
  }

  pos.needsUpdate = true;
  g.translate(HEAD.center.x, HEAD.center.y, HEAD.center.z);
  g.computeVertexNormals();
  return g;
}

/**
 * One compound eye.
 *
 * A high-resolution ellipsoid; the ommatidial facets themselves are shaded
 * rather than modelled, so the ~750 facets cost nothing in geometry. The
 * surface is bulged outward and tilted forward the way the real eye wraps
 * around the head.
 */
export function buildEyeGeometry(side: 'L' | 'R'): BufferGeometry {
  const sign = side === 'R' ? 1 : -1;
  const g = new SphereGeometry(1, 72, 56);
  const pos = g.getAttribute('position') as BufferAttribute;
  const v = new Vector3();

  /**
   * Direction on the unit sphere, before the eye is squashed, tilted and moved
   * onto the head.
   *
   * The ommatidial shader needs a parameterisation centred on the eye. It
   * cannot use `position`, because by the time the shader sees it the geometry
   * has been baked into fly space and every vertex points at the head rather
   * than away from the eye's own centre -- which collapses the hex lattice to
   * a handful of giant cells. Capturing the direction here keeps the facets
   * evenly spread over the surface however the eye is later placed.
   */
  const local = new Float32Array(pos.count * 3);

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    local[i * 3] = v.x;
    local[i * 3 + 1] = v.y;
    local[i * 3 + 2] = v.z;
    // flatten the medial face so the eye meets the head socket flush
    if (v.x * sign < 0) v.x *= 0.45;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  g.setAttribute('aLocal', new BufferAttribute(local, 3));

  g.scale(EYES.radii.x, EYES.radii.y, EYES.radii.z);
  g.rotateY(-sign * EYES.tilt);
  g.rotateZ(sign * 0.1);
  g.translate(sign * EYES.offset.x, EYES.offset.y, EYES.offset.z);
  g.computeVertexNormals();
  return g;
}

/** Antennae: scape, pedicel, funiculus, plus a branched arista. */
export function buildAntennaeGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];

  for (const sign of [1, -1]) {
    const base = new Vector3(sign * ANTENNAE.base.x, ANTENNAE.base.y, ANTENNAE.base.z);
    const scapeEnd = base.clone().add(new Vector3(sign * 0.25, -0.55, 0.75));
    const funiculusEnd = scapeEnd.clone().add(new Vector3(sign * 0.15, -0.95, 0.6));

    parts.push(taperedTube(base, scapeEnd, 0.42, ANTENNAE.segmentRadius, 10));
    parts.push(joint(scapeEnd, 0.5));
    // the funiculus is the bulbous third segment
    const funiculus = ellipsoid(new Vector3(0.62, 0.78, 0.62), funiculusEnd, 16, 12);
    parts.push(funiculus);

    // arista: a shaft with alternating branches, the feathery part
    const aristaBase = funiculusEnd.clone().add(new Vector3(sign * 0.2, 0.25, 0.3));
    const aristaTip = aristaBase
      .clone()
      .add(new Vector3(sign * 1.3, 0.9, ANTENNAE.aristaLength * 0.6));
    parts.push(taperedTube(aristaBase, aristaTip, 0.1, 0.03, 6));

    for (let b = 0; b < ANTENNAE.aristaBranches; b++) {
      const t = (b + 1) / (ANTENNAE.aristaBranches + 1);
      const along = aristaBase.clone().lerp(aristaTip, t);
      const up = b % 2 === 0 ? 1 : -1;
      const tip = along
        .clone()
        .add(new Vector3(sign * 0.15, up * 0.72 * (1 - t * 0.4), 0.28));
      parts.push(taperedTube(along, tip, 0.05, 0.012, 4));
    }
  }

  return mergeAll(parts);
}

/** Proboscis in the retracted posture, with the labellum lobes. */
export function buildProboscisGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const base = PROBOSCIS.base.clone();
  const tip = base.clone().add(new Vector3(0, -PROBOSCIS.length, 0.35));

  parts.push(taperedTube(base, tip, 1.05, 0.62, 14));
  for (const sign of [1, -1]) {
    parts.push(
      ellipsoid(
        new Vector3(PROBOSCIS.labellumRadius * 0.7, 0.55, PROBOSCIS.labellumRadius),
        tip.clone().add(new Vector3(sign * 0.42, -0.3, 0.1)),
        18,
        14,
      ),
    );
  }
  return mergeAll(parts);
}

// ---------------------------------------------------------------------------
// thorax and abdomen
// ---------------------------------------------------------------------------

/** Thorax with a raised scutum, plus the neck joining it to the head. */
export function buildThoraxGeometry(): BufferGeometry {
  const g = ellipsoid(THORAX.radii, new Vector3(0, 0, 0), 64, 48);
  const pos = g.getAttribute('position') as BufferAttribute;
  const v = new Vector3();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const along = v.z / THORAX.radii.z;
    // lift the dorsal surface into the scutum hump, strongest mid-thorax
    if (v.y > 0) v.y += THORAX.scutumLift * Math.cos(along * 1.2) * (v.y / THORAX.radii.y);
    // narrow the posterior where the abdomen joins
    if (along < -0.2) {
      const t = (-along - 0.2) / 0.8;
      v.x *= 1 - 0.28 * t;
      v.y *= 1 - 0.22 * t;
    }
    // flatten the ventral surface the legs attach to
    if (v.y < 0) v.y *= 0.88;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  g.translate(THORAX.center.x, THORAX.center.y, THORAX.center.z);
  g.computeVertexNormals();

  const neck = taperedTube(NECK.from, NECK.to, NECK.radius * 0.8, NECK.radius, 20);
  const scutellum = ellipsoid(SCUTELLUM.radii, SCUTELLUM.center, 34, 22);
  return mergeAll([g, neck, scutellum]);
}

/**
 * Abdomen as a lofted surface carrying real tergite edges.
 *
 * An earlier version stacked one ellipsoid per segment. That reads as a pile
 * of pancakes: neighbouring ellipsoids of different widths only ever meet at
 * their rims, so the silhouette scallops in and out once per segment however
 * far they are pushed into each other.
 *
 * This lofts a single smooth body along the length instead, then steps the
 * radius at each segment boundary. The result keeps a continuous fly-shaped
 * outline while every tergite still overlaps the one behind it with a crisp
 * free edge -- which is how the plates actually sit on the animal.
 */
export function buildAbdomenGeometry(): BufferGeometry {
  const RINGS = 168;
  const RADIAL = 52;
  const span = ABDOMEN.start - ABDOMEN.end;

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= RINGS; i++) {
    const t = i / RINGS;

    // Swells to its widest around the second tergite, then closes to a blunt
    // tip. A Drosophila abdomen is broad -- narrow it and the fly reads as a
    // wasp, which is the quickest way to lose the silhouette.
    const base =
      0.88 + 0.30 * Math.sin(Math.PI * Math.min(1, t * 1.25)) -
      ABDOMEN.taper * Math.pow(t, 2.1);

    // Round the very tip, and close the front so the loft is a sealed volume.
    // The front cap sits inside the thorax, so it is never actually seen.
    // A high exponent here snaps the tip shut into a flat drum end; this one
    // draws it in over the last third, the way the abdomen actually tapers.
    const tip = Math.sqrt(Math.max(0, 1 - Math.pow(t, 8)));
    const frontT = Math.min(1, t / 0.14);
    const front = Math.sqrt(Math.max(0, 1 - Math.pow(1 - frontT, 2)));

    // Tergite step: each plate starts slightly proud of the one in front of
    // it and tapers back, so the boundary is a hard edge rather than a groove.
    const seg = t * ABDOMEN.segments;
    const frac = seg - Math.floor(Math.min(seg, ABDOMEN.segments - 1e-6));
    // Subtle: enough to catch the light along each free edge, not enough to
    // turn the abdomen into a barrel with raised hoops around it.
    const plate = 1 + 0.028 * (1 - frac);

    const r = base * tip * front * plate;
    const z = ABDOMEN.start - t * span;
    const yShift = ABDOMEN.droop * t * 4;

    for (let j = 0; j <= RADIAL; j++) {
      const a = (j / RADIAL) * Math.PI * 2;
      positions.push(
        Math.cos(a) * ABDOMEN.maxRadius.x * r,
        Math.sin(a) * ABDOMEN.maxRadius.y * r + yShift,
        z,
      );
      uvs.push(j / RADIAL, t);
    }
  }

  const stride = RADIAL + 1;
  for (let i = 0; i < RINGS; i++) {
    for (let j = 0; j < RADIAL; j++) {
      const a = i * stride + j;
      const b = a + stride;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }

  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/** Abdominal segment count and centres, for labelling and picking. */
export function abdomenSegmentCenters(): Vector3[] {
  const span = ABDOMEN.start - ABDOMEN.end;
  return Array.from({ length: ABDOMEN.segments }, (_, i) => {
    const t = i / (ABDOMEN.segments - 1);
    return new Vector3(0, ABDOMEN.droop * t * 4, ABDOMEN.start - t * span);
  });
}

// ---------------------------------------------------------------------------
// appendages
// ---------------------------------------------------------------------------

/**
 * All six legs as one merged buffer.
 *
 * Each leg walks its joint chain, applying that segment's pitch and the leg's
 * yaw, so the pose is articulated rather than six copies of one shape. They
 * originate from the thorax, never the abdomen.
 */
export function buildLegsGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];

  for (const leg of LEGS) {
    let cursor = leg.root.clone();
    let pitch = 0;

    for (let s = 0; s < leg.segments.length; s++) {
      const seg = leg.segments[s];
      pitch += seg.pitch;
      // yaw carries the leg outward from the body, pitch swings it down then
      // back up at the tibia, which is what gives an insect its bent stance
      // The fore legs reach forward and the hind legs back; damping z too
      // hard flattens every leg into the coronal plane and the fly ends up
      // standing on six identical spokes.
      const dir = new Vector3(
        Math.sin(leg.yaw) * Math.cos(pitch),
        Math.sin(pitch),
        Math.cos(leg.yaw) * Math.cos(pitch) * 0.72,
      ).normalize();
      const end = cursor.clone().addScaledVector(dir, seg.length);

      parts.push(
        taperedTube(
          cursor,
          end,
          seg.radius,
          seg.radius * (s === leg.segments.length - 1 ? 0.35 : 0.8),
          8,
        ),
      );
      if (s < leg.segments.length - 1) parts.push(joint(end, seg.radius * 0.85));
      cursor = end;
    }
  }

  return mergeAll(parts);
}

/** Halteres, the club-shaped organs Diptera balance with. */
export function buildHalteresGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (const sign of [1, -1]) {
    const root = new Vector3(sign * HALTERES.root.x, HALTERES.root.y, HALTERES.root.z);
    const knob = root.clone().add(new Vector3(sign * 0.9, -0.7, -HALTERES.length));
    parts.push(taperedTube(root, knob, 0.2, 0.12, 8));
    parts.push(ellipsoid(new Vector3(HALTERES.knobRadius, HALTERES.knobRadius * 0.85, HALTERES.knobRadius), knob, 14, 12));
  }
  return mergeAll(parts);
}

/**
 * One wing membrane.
 *
 * Sampled as a quad strip between a leading and trailing edge rather than an
 * extruded shape, which keeps it a thin two-sided surface (a wing has no
 * volume) and gives the veins exact positions to follow. Slight camber and
 * twist stop it reading as a flat cutout.
 */
export function buildWingGeometry(side: 'L' | 'R'): BufferGeometry {
  const sign = side === 'R' ? 1 : -1;
  const spanSteps = 56;
  const chordSteps = 10;

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const halfWidth = (u: number) =>
    // widest around 60% of the span, rounded at root and tip
    WINGS.width * 0.5 * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.86)), 0.82);

  for (let i = 0; i <= spanSteps; i++) {
    const u = i / spanSteps;
    const w = halfWidth(u);
    // the chord line drifts posteriorly along the span
    const chordCenter = -u * WINGS.length * 0.16;

    for (let j = 0; j <= chordSteps; j++) {
      const v = j / chordSteps;
      const chord = chordCenter + (v - 0.5) * 2 * w;
      const camber = Math.sin(Math.PI * v) * 0.34 * (1 - u * 0.45);
      const twist = u * WINGS.roll;

      positions.push(
        u * WINGS.length,
        camber + twist * chord * 0.2 + u * WINGS.pitch * 2,
        chord,
      );
      uvs.push(u, v);
    }
  }

  const stride = chordSteps + 1;
  for (let i = 0; i < spanSteps; i++) {
    for (let j = 0; j < chordSteps; j++) {
      const a = i * stride + j;
      const b = a + stride;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }

  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  g.setIndex(indices);

  placeWing(g, sign);
  g.computeVertexNormals();
  return g;
}

/**
 * Put a wing built along +x into its resting pose.
 *
 * At rest a Drosophila folds its wings back over the abdomen at a shallow
 * angle from the midline, so the span is rotated from +x to mostly -z. The
 * left wing is the right one mirrored through the sagittal plane, which is
 * cheaper than parameterising the pose twice and guarantees symmetry.
 */
function placeWing(g: BufferGeometry, sign: number): void {
  g.rotateY(WING_SWEEP);
  g.translate(WINGS.root.x, WINGS.root.y, WINGS.root.z);
  if (sign < 0) g.scale(-1, 1, 1);
}

/**
 * Rotation from +x that lays the span back over the abdomen.
 *
 * A resting Drosophila holds its wings close in over the body, not out at
 * forty-five degrees; the larger this is, the nearer the midline they fold.
 */
const WING_SWEEP = 1.29;

/**
 * Longitudinal and cross veins for one wing, as line segments.
 *
 * Positions are sampled from the same parametric surface as the membrane, so
 * the veins sit exactly on it instead of floating above.
 */
export function buildWingVeins(side: 'L' | 'R'): BufferGeometry {
  const sign = side === 'R' ? 1 : -1;
  // fractions across the chord that the six longitudinal veins run along
  const longitudinal = [0.06, 0.24, 0.42, 0.58, 0.74, 0.9];
  const points: number[] = [];

  const halfWidth = (u: number) =>
    WINGS.width * 0.5 * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.86)), 0.82);

  const sample = (u: number, v: number): [number, number, number] => {
    const w = halfWidth(u);
    const chordCenter = -u * WINGS.length * 0.16;
    const chord = chordCenter + (v - 0.5) * 2 * w;
    const camber = Math.sin(Math.PI * v) * 0.34 * (1 - u * 0.45);
    const twist = u * WINGS.roll;
    return [
      u * WINGS.length,
      camber + twist * chord * 0.2 + u * WINGS.pitch * 2 + 0.015,
      chord,
    ];
  };

  for (const v of longitudinal) {
    // veins stop short of the tip, as they do in a real wing
    const end = 0.94 - v * 0.12;
    for (let i = 0; i < 40; i++) {
      const u0 = 0.04 + (i / 40) * (end - 0.04);
      const u1 = 0.04 + ((i + 1) / 40) * (end - 0.04);
      points.push(...sample(u0, v), ...sample(u1, v));
    }
  }
  // two cross veins, the anterior and posterior crossvein
  for (const [u, v0, v1] of [
    [0.52, 0.24, 0.42],
    [0.66, 0.42, 0.58],
  ] as const) {
    points.push(...sample(u, v0), ...sample(u, v1));
  }

  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(points), 3));
  placeWing(g, sign);
  return g;
}

// ---------------------------------------------------------------------------
// cached singletons
// ---------------------------------------------------------------------------

let cache: {
  head: BufferGeometry;
  eyeL: BufferGeometry;
  eyeR: BufferGeometry;
  antennae: BufferGeometry;
  proboscis: BufferGeometry;
  thorax: BufferGeometry;
  abdomen: BufferGeometry;
  legs: BufferGeometry;
  halteres: BufferGeometry;
  wingL: BufferGeometry;
  wingR: BufferGeometry;
  veinsL: BufferGeometry;
  veinsR: BufferGeometry;
} | null = null;

export function flyGeometry() {
  if (!cache) {
    cache = {
      head: buildHeadGeometry(),
      eyeL: buildEyeGeometry('L'),
      eyeR: buildEyeGeometry('R'),
      antennae: buildAntennaeGeometry(),
      proboscis: buildProboscisGeometry(),
      thorax: buildThoraxGeometry(),
      abdomen: buildAbdomenGeometry(),
      legs: buildLegsGeometry(),
      halteres: buildHalteresGeometry(),
      wingL: buildWingGeometry('L'),
      wingR: buildWingGeometry('R'),
      veinsL: buildWingVeins('L'),
      veinsR: buildWingVeins('R'),
    };
  }
  return cache;
}
