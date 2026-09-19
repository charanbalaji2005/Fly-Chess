/**
 * Where the board camera stands, for any screen shape.
 *
 * This has been wrong twice, in two different ways, and both times the
 * arithmetic was confident:
 *
 *   1. A fixed distance tuned on a 16:9 window cropped the outer files on a
 *      portrait phone -- the board fell off the sides and the first thing a
 *      mobile player saw was a stadium wall.
 *   2. The replacement measured how much of the frame the board *spanned*
 *      and never checked where that span sat. A board can occupy 76% of the
 *      frame with its near rank below the bottom edge, which is exactly what
 *      happened once the camera was raised to bring the stadium screen into
 *      shot.
 *
 * So it no longer derives the distance from a formula. It projects the
 * board's own corners and steps back until they are inside the frame. The
 * search is a few dozen multiplications once per resize, and unlike a
 * formula it cannot be subtly wrong about perspective.
 *
 * Free of Three.js, so the whole thing can be checked against the device
 * matrix in a test rather than by opening a browser at six sizes.
 */

export type ViewportKind = 'MOBILE' | 'TABLET' | 'DESKTOP';

export function viewportKind(width: number): ViewportKind {
  if (width < 600) return 'MOBILE';
  if (width <= 1024) return 'TABLET';
  return 'DESKTOP';
}

/**
 * How steeply to look down, as the sine of the angle above the horizon.
 *
 * A phone sees the board nearly from above: at a shallow angle the far ranks
 * compress into a few pixels and the eighth rank stops being readable. A
 * desktop goes flatter, which is both the more cinematic three-quarter view
 * and what brings the stadium screen behind Black's end into frame above the
 * board.
 */
export const ELEVATION: Record<ViewportKind, number> = {
  MOBILE: 0.92,
  TABLET: 0.74,
  DESKTOP: 0.62,
};

/**
 * How far above the board the camera looks.
 *
 * Aiming at the board's own centre puts it in the middle of the frame with
 * everything above it cropped away. Raising the aim on the larger screens
 * drops the board into the lower half and gives the stadium screen the upper
 * half -- which is the composition the arena is built for.
 */
export const AIM_HEIGHT: Record<ViewportKind, number> = {
  MOBILE: 1.4,
  TABLET: 7,
  DESKTOP: 7,
};

/** A little air beyond the exact fit, so nothing touches the screen edge. */
const MARGIN = 1.06;

export interface CameraFit {
  distance: number;
  elevation: number;
  position: [number, number, number];
  target: [number, number, number];
}

export interface Coverage {
  /** Fraction of frame width the board spans. */
  width: number;
  /** Fraction of frame height. */
  height: number;
  /** Whether every corner is inside the frame. This is the one that matters. */
  contained: boolean;
  /** Normalised device coordinates, -1..1. */
  bottom: number;
  top: number;
}

/** The pose at a given distance, for a given elevation and aim. */
function poseAt(distance: number, elevation: number, aim: number): CameraFit {
  const horizontal = Math.sqrt(Math.max(0.05, 1 - elevation * elevation));
  return {
    distance,
    elevation,
    position: [0, distance * elevation, distance * horizontal],
    target: [0, aim, 0],
  };
}

/**
 * Project the board and report where it lands.
 *
 * Samples the four corners at deck height and again at piece height, so a
 * tall piece on the back rank is accounted for rather than discovered later.
 */
export function coverageFor(
  pose: CameraFit,
  halfSize: number,
  fovDegrees: number,
  aspect: number,
): Coverage {
  const halfV = (fovDegrees * Math.PI) / 360;
  const f = 1 / Math.tan(halfV);

  const dir = norm(sub(pose.target, pose.position));
  const right = norm(cross(dir, [0, 1, 0]));
  const up = cross(right, dir);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let behind = false;

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      for (const y of [0.6, 3.6]) {
        const d = sub([sx * halfSize, y, sz * halfSize], pose.position);
        const z = dot(d, dir);
        if (z <= 0.01) {
          behind = true;
          continue;
        }
        const x = (dot(d, right) * f) / (z * aspect);
        const py = (dot(d, up) * f) / z;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, py);
        maxY = Math.max(maxY, py);
      }
    }
  }

  return {
    width: (maxX - minX) / 2,
    height: (maxY - minY) / 2,
    contained: !behind && minX >= -1 && maxX <= 1 && minY >= -1 && maxY <= 1,
    bottom: minY,
    top: maxY,
  };
}

/**
 * The pose: the closest distance at which the whole board is in frame.
 *
 * Starts near and steps back. The step is small enough not to overshoot
 * visibly, and the loop is bounded, so a pathological viewport gets the
 * furthest pose rather than hanging.
 */
export function cameraFit(
  halfSize: number,
  fovDegrees: number,
  width: number,
  height: number,
): CameraFit {
  const aspect = Math.max(0.2, width / Math.max(1, height));
  const kind = viewportKind(width);
  const elevation = ELEVATION[kind];
  const aim = AIM_HEIGHT[kind];

  let distance = halfSize * 1.5;

  for (let i = 0; i < 80; i++) {
    if (coverageFor(poseAt(distance, elevation, aim), halfSize, fovDegrees, aspect).contained) {
      break;
    }
    distance *= 1.04;
  }

  return poseAt(distance * MARGIN, elevation, aim);
}

/** Coverage at the fitted pose. Convenience for tests and tooling. */
export function projectedCoverage(
  halfSize: number,
  fovDegrees: number,
  width: number,
  height: number,
): Coverage {
  const aspect = Math.max(0.2, width / Math.max(1, height));
  return coverageFor(cameraFit(halfSize, fovDegrees, width, height), halfSize, fovDegrees, aspect);
}

type V3 = [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
