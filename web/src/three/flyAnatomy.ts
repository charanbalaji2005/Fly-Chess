/**
 * The persistent Drosophila melanogaster coordinate system.
 *
 * This module is the single source of truth for where every part of the fly
 * sits. The external anatomy, the camera presets, the head-capsule transparency
 * and -- critically -- the placement of the connectome inside the head all read
 * their numbers from here, so the whole experience is one continuous 3D object
 * rather than a fly next to a brain.
 *
 * FRAME
 *   +x  fly's right        +y  dorsal (up)        +z  anterior (forward)
 *   origin sits at the thorax centre, the way a fly is usually mounted
 *   1 unit ~= 85 um, so the ~2.7 mm body spans ~32 units
 *
 * SCIENTIFIC STATUS
 *   The external body is a PROCEDURAL APPROXIMATION. The repository contains no
 *   mesh of any kind (searched for glb/gltf/obj/fbx/stl/ply/blend/dae) and no
 *   soma coordinates, so this is hand-authored geometry proportioned from
 *   published descriptions of the adult fly. It is here to give the connectome
 *   an anatomical home a reader recognises, not to be measured against.
 *
 *   The brain compartments it contains are likewise illustrative (see
 *   preprocess/anatomy.py). What is real is the connectome placed inside them:
 *   138,639 FlyWire neurons and 15,091,983 measured connections.
 *
 *   If a real Drosophila mesh is dropped into web/public/models later,
 *   src/three/FlyModelLoader.ts substitutes it without touching this file's
 *   consumers -- the camera presets and brain transform below stay valid as
 *   long as the mesh is normalised to this frame.
 */

import { Vector3 } from 'three';

export const FLY_FRAME = {
  axes: { x: "fly's right", y: 'dorsal', z: 'anterior' },
  unitMicrons: 85,
  bodyLengthUnits: 32,
  provenance: 'approximation' as const,
  note:
    'Procedural Drosophila melanogaster. No anatomical mesh ships with this ' +
    'repository; proportions are hand-authored, not measured.',
};

// ---------------------------------------------------------------------------
// head
// ---------------------------------------------------------------------------

/** Head capsule. The brain occupies most of its interior, as in a real fly. */
export const HEAD = {
  center: new Vector3(0, 0.3, 12.0),
  /** Ellipsoid radii: wider than tall, much wider than deep. */
  radii: new Vector3(6.0, 4.2, 3.8),
};

/**
 * Compound eyes.
 *
 * They dominate the head -- roughly two thirds of its surface in Drosophila --
 * and are the single strongest cue that the model is a fly, so they are sized
 * generously and given real curvature rather than being spheres stuck on.
 */
export const EYES = {
  radii: new Vector3(3.1, 4.0, 3.7),
  /**
   * Seated well inside the head capsule.
   *
   * The eye's medial face is flattened, and if the centre sits at or beyond
   * the head's own surface that flat face is exposed and the eye reads as a
   * disc stuck on the side. Burying the centre puts the flat half inside the
   * cuticle and leaves only the convex dome showing, which is what wrapping
   * looks like.
   */
  offset: new Vector3(3.55, 0.35, 11.85),
  /** Ommatidial facets per eye in the real animal; drives the shader pattern. */
  ommatidiaCount: 750,
  tilt: 0.24,
};

/** Antennae: pedicel plus the feathery arista, angled down and forward. */
export const ANTENNAE = {
  base: new Vector3(1.5, -1.5, 14.6),
  segmentRadius: 0.52,
  aristaLength: 2.6,
  aristaBranches: 7,
};

/** Proboscis, in the retracted posture. */
export const PROBOSCIS = {
  base: new Vector3(0, -3.2, 13.4),
  length: 2.4,
  labellumRadius: 1.0,
};

/** Neck connecting head to thorax. */
export const NECK = {
  from: new Vector3(0, -0.4, 8.6),
  to: new Vector3(0, 0.2, 6.4),
  radius: 1.5,
};

// ---------------------------------------------------------------------------
// thorax
// ---------------------------------------------------------------------------

/** Thorax, humped dorsally the way the scutum is. */
export const THORAX = {
  center: new Vector3(0, 0.1, 2.0),
  radii: new Vector3(5.0, 4.6, 6.6),
  scutumLift: 0.9,
};

/**
 * Scutellum: the small shield at the back of the thorax.
 *
 * Tiny, but it is one of the shapes that makes a dipteran silhouette read
 * correctly from above -- without it the thorax is just an egg.
 */
export const SCUTELLUM = {
  center: new Vector3(0, 2.15, -2.1),
  radii: new Vector3(2.5, 1.15, 1.9),
};

/**
 * Wings.
 *
 * A Drosophila wing overhangs the abdomen, so these run well past the body's
 * posterior end. The outline is a cubic-spline silhouette rather than a
 * triangle, and the longitudinal veins follow it.
 */
export const WINGS = {
  // Seated on the thorax and high enough to rest over the abdomen rather
  // than intersect it.
  root: new Vector3(1.6, 3.9, 2.2),
  length: 17.0,
  width: 6.2,
  /** Sweep back and slightly outward from the wing root. */
  yaw: 0.30,
  pitch: -0.12,
  roll: 0.16,
  thickness: 0.06,
};

/** Halteres: the club-shaped hindwing remnants Diptera balance with. */
export const HALTERES = {
  root: new Vector3(2.2, 0.9, -2.6),
  length: 2.2,
  knobRadius: 0.62,
};

/**
 * Legs.
 *
 * All six originate from the thorax -- never the abdomen -- and each is a
 * coxa/trochanter/femur/tibia/tarsus chain. Lengths increase front to back,
 * as they do in the animal.
 */
export interface LegDefinition {
  key: string;
  label: string;
  side: 'L' | 'R';
  pair: 'fore' | 'mid' | 'hind';
  root: Vector3;
  /** Yaw away from the midline, then pitch down, per joint. */
  yaw: number;
  segments: { name: string; length: number; radius: number; pitch: number }[];
}

function legSegments(scale: number) {
  // Pitch accumulates down the chain, so each number is the bend AT that
  // joint, not its final angle. They build to roughly -40, -54, -49, -66 and
  // -7 degrees below horizontal: out and down through the femur, steeply down
  // at the tibia, then the tarsus flattens onto the ground the way a standing
  // fly's does. Getting the tarsus near-horizontal matters -- angled up, it
  // reads as a wire antenna rather than a foot.
  return [
    { name: 'Coxa', length: 1.3 * scale, radius: 0.44, pitch: -0.70 },
    { name: 'Trochanter', length: 0.6 * scale, radius: 0.34, pitch: -0.24 },
    { name: 'Femur', length: 2.9 * scale, radius: 0.32, pitch: 0.08 },
    { name: 'Tibia', length: 2.6 * scale, radius: 0.24, pitch: -0.30 },
    { name: 'Tarsus', length: 1.8 * scale, radius: 0.15, pitch: 1.03 },
  ];
}

const LEG_PAIRS: { pair: 'fore' | 'mid' | 'hind'; z: number; yaw: number; scale: number }[] = [
  { pair: 'fore', z: 5.0, yaw: 0.80, scale: 0.90 },
  { pair: 'mid', z: 0.8, yaw: 1.25, scale: 1.0 },
  { pair: 'hind', z: -3.2, yaw: 1.70, scale: 1.12 },
];

export const LEGS: LegDefinition[] = LEG_PAIRS.flatMap(({ pair, z, yaw, scale }) =>
  (['R', 'L'] as const).map((side) => {
    const sign = side === 'R' ? 1 : -1;
    return {
      key: `leg-${pair}-${side.toLowerCase()}`,
      label: `${pair[0].toUpperCase()}${pair.slice(1)} leg (${side})`,
      side,
      pair,
      root: new Vector3(sign * 3.1, -2.9, z),
      yaw: sign * yaw,
      segments: legSegments(scale),
    };
  }),
);

// ---------------------------------------------------------------------------
// abdomen
// ---------------------------------------------------------------------------

/**
 * Abdomen: one lofted body carrying overlapping tergites.
 *
 * Built as a single surface swept along the length rather than a stack of
 * ellipsoid slices -- slices only ever meet at their rims, so the silhouette
 * scallops once per segment and the abdomen reads as a pile of pancakes. The
 * tergite edges are stepped into the loft instead, and the dark pigmentation
 * bands that really sell a fly abdomen are shaded on by the cuticle material
 * (see `bands` in materials/flyMaterials.ts).
 */
export const ABDOMEN = {
  // The loft starts well inside the thorax and is closed off there, so the
  // cap is buried and the abdomen emerges from behind the thorax instead of
  // floating behind it with a seam in between.
  start: -2.6,
  end: -15.4,
  segments: 6,
  /**
   * Widest tergite, which should very nearly match the thorax.
   *
   * A Drosophila abdomen is broad and oval seen from above -- it fills the
   * space between the folded wings. Narrow it and the fly turns into a wasp,
   * which is the single easiest way to lose the silhouette.
   */
  maxRadius: new Vector3(4.5, 4.0, 1.0),
  taper: 0.42,
  droop: -0.08,
};

// ---------------------------------------------------------------------------
// brain placement
// ---------------------------------------------------------------------------

/**
 * Transform from brain space into fly space.
 *
 * The connectome layout in web/public/data/positions.bin is fitted to the
 * scaffold in preprocess/anatomy.py, which spans roughly x +/-5.1, y -2.7..2.2,
 * z +/-1.7. Scaling by BRAIN_SCALE and translating to the head centre drops it
 * inside the head capsule with a visible margin of cuticle around it, so the
 * brain genuinely sits where a brain sits.
 *
 * Nothing about the neuron coordinates is recomputed for this -- it is a rigid
 * scale and translation applied to the whole group, so a neuron's position
 * relative to its synaptic partners is exactly what the layout produced.
 */
export const BRAIN_SCALE = 0.86;
export const BRAIN_CENTER = new Vector3(0, 0.45, 12.0);

/** Local brain-space extents, from the preprocessing output. */
export const BRAIN_EXTENT = new Vector3(5.1, 2.5, 1.75);

/** Convert a brain-space point to fly space. */
export function brainToFly(p: Vector3, out = new Vector3()): Vector3 {
  return out.copy(p).multiplyScalar(BRAIN_SCALE).add(BRAIN_CENTER);
}

// ---------------------------------------------------------------------------
// selectable parts
// ---------------------------------------------------------------------------

export type FlyPartKey =
  | 'head'
  | 'eye-l'
  | 'eye-r'
  | 'antenna-l'
  | 'antenna-r'
  | 'proboscis'
  | 'thorax'
  | 'wing-l'
  | 'wing-r'
  | 'haltere-l'
  | 'haltere-r'
  | 'abdomen'
  | `leg-${string}`;

export interface FlyPart {
  key: FlyPartKey;
  label: string;
  group: 'head' | 'thorax' | 'abdomen';
  /** Centre in fly space, used for camera focus and label anchoring. */
  focus: Vector3;
  /** Roughly how far back the camera must sit to frame the part. */
  framing: number;
  /**
   * What the connectome can say about this part. The datasets carry no
   * region labels, so for almost every part this is honestly "none".
   */
  dataNote: string;
}

export const FLY_PARTS: FlyPart[] = [
  {
    key: 'head',
    label: 'Head capsule',
    group: 'head',
    focus: HEAD.center.clone(),
    framing: 16,
    dataNote:
      'Contains the connectome. The head geometry itself is procedural; the ' +
      '138,639 neurons inside it are measured FlyWire data.',
  },
  {
    key: 'eye-r',
    label: 'Compound eye (right)',
    group: 'head',
    focus: new Vector3(EYES.offset.x, EYES.offset.y, EYES.offset.z),
    framing: 11,
    dataNote:
      'The datasets contain no photoreceptor or optic-lobe annotation, so no ' +
      'neuron can be attributed to this eye.',
  },
  {
    key: 'eye-l',
    label: 'Compound eye (left)',
    group: 'head',
    focus: new Vector3(-EYES.offset.x, EYES.offset.y, EYES.offset.z),
    framing: 11,
    dataNote:
      'The datasets contain no photoreceptor or optic-lobe annotation, so no ' +
      'neuron can be attributed to this eye.',
  },
  {
    key: 'antenna-r',
    label: 'Antenna (right)',
    group: 'head',
    focus: new Vector3(ANTENNAE.base.x, ANTENNAE.base.y, ANTENNAE.base.z),
    framing: 8,
    dataNote: 'No olfactory receptor neuron annotation is present in the datasets.',
  },
  {
    key: 'antenna-l',
    label: 'Antenna (left)',
    group: 'head',
    focus: new Vector3(-ANTENNAE.base.x, ANTENNAE.base.y, ANTENNAE.base.z),
    framing: 8,
    dataNote: 'No olfactory receptor neuron annotation is present in the datasets.',
  },
  {
    key: 'proboscis',
    label: 'Proboscis',
    group: 'head',
    focus: PROBOSCIS.base.clone(),
    framing: 9,
    dataNote:
      'The sugar experiment in code/benchmark.py stimulates 21 gustatory ' +
      'receptor neurons by FlyWire ID, but the datasets do not place them here.',
  },
  {
    key: 'thorax',
    label: 'Thorax',
    group: 'thorax',
    focus: THORAX.center.clone(),
    framing: 18,
    dataNote:
      'The ventral nerve cord is outside the brain connectome; this dataset ' +
      'covers the brain only.',
  },
  {
    key: 'wing-r',
    label: 'Wing (right)',
    group: 'thorax',
    focus: new Vector3(6.5, 2.6, -5.0),
    framing: 20,
    dataNote: 'Not represented in the connectome dataset.',
  },
  {
    key: 'wing-l',
    label: 'Wing (left)',
    group: 'thorax',
    focus: new Vector3(-6.5, 2.6, -5.0),
    framing: 20,
    dataNote: 'Not represented in the connectome dataset.',
  },
  {
    key: 'abdomen',
    label: 'Abdomen',
    group: 'abdomen',
    focus: new Vector3(0, -0.6, -11.5),
    framing: 20,
    dataNote: 'Not represented in the connectome dataset.',
  },
  ...LEGS.map(
    (leg): FlyPart => ({
      key: leg.key as FlyPartKey,
      label: leg.label,
      group: 'thorax',
      focus: leg.root.clone().add(new Vector3(leg.yaw > 0 ? 3 : -3, -4, 0)),
      framing: 13,
      dataNote: 'Not represented in the connectome dataset.',
    }),
  ),
];

export const FLY_PART_BY_KEY = new Map(FLY_PARTS.map((p) => [p.key, p]));

// ---------------------------------------------------------------------------
// camera
// ---------------------------------------------------------------------------

export interface CameraPose {
  key: string;
  label: string;
  /** Camera position in fly space. */
  position: Vector3;
  /** Point the camera looks at. */
  target: Vector3;
  /** Hint for whether the head should be transparent at this pose. */
  revealsBrain?: boolean;
}

export const CAMERA_POSES: CameraPose[] = [
  {
    key: 'whole',
    label: 'Whole fly',
    position: new Vector3(26, 14, 30),
    target: new Vector3(0, -0.5, 0),
  },
  {
    key: 'head',
    label: 'Head',
    position: new Vector3(11, 5.5, 25),
    target: HEAD.center.clone(),
  },
  {
    key: 'brain',
    label: 'Brain',
    position: new Vector3(0.5, 3.4, 22.5),
    target: BRAIN_CENTER.clone(),
    revealsBrain: true,
  },
  {
    key: 'brain-top',
    label: 'Brain (dorsal)',
    position: new Vector3(0, 16, 12.4),
    target: BRAIN_CENTER.clone(),
    revealsBrain: true,
  },
  {
    key: 'brain-left',
    label: 'Brain (left)',
    position: new Vector3(-17, 2, 12.6),
    target: BRAIN_CENTER.clone(),
    revealsBrain: true,
  },
  {
    key: 'brain-right',
    label: 'Brain (right)',
    position: new Vector3(17, 2, 12.6),
    target: BRAIN_CENTER.clone(),
    revealsBrain: true,
  },
  {
    key: 'eye-l',
    label: 'Left eye',
    position: new Vector3(-13, 2.5, 17),
    target: new Vector3(-EYES.offset.x, EYES.offset.y, EYES.offset.z),
  },
  {
    key: 'eye-r',
    label: 'Right eye',
    position: new Vector3(13, 2.5, 17),
    target: new Vector3(EYES.offset.x, EYES.offset.y, EYES.offset.z),
  },
  {
    key: 'thorax',
    label: 'Thorax',
    position: new Vector3(16, 8, 14),
    target: THORAX.center.clone(),
  },
  {
    key: 'abdomen',
    label: 'Abdomen',
    position: new Vector3(15, 7, -8),
    target: new Vector3(0, -0.6, -11.5),
  },
  {
    key: 'dorsal',
    label: 'Dorsal',
    position: new Vector3(0, 38, -1),
    target: new Vector3(0, 0, -1),
  },
  {
    key: 'lateral',
    label: 'Lateral',
    position: new Vector3(42, 2, 0),
    target: new Vector3(0, 0, 0),
  },
];

export const CAMERA_POSE_BY_KEY = new Map(CAMERA_POSES.map((p) => [p.key, p]));

/** Frame an arbitrary fly-space point, keeping the current viewing direction. */
export function poseForPoint(
  point: Vector3,
  fromDirection: Vector3,
  distance: number,
): CameraPose {
  const dir = fromDirection.clone().normalize();
  if (dir.lengthSq() < 1e-6) dir.set(0.2, 0.3, 1).normalize();
  return {
    key: 'focus',
    label: 'Focus',
    position: point.clone().addScaledVector(dir, distance),
    target: point.clone(),
    revealsBrain: true,
  };
}
