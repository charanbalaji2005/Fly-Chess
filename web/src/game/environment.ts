/**
 * Day and night.
 *
 * Both environments are the same scene with a different preset -- one set of
 * numbers describing sky, sun, lighting, fog, floodlights and how hard the
 * board and the core are pushed. Duplicating the stadium for a night variant
 * would double the geometry and guarantee the two drift apart.
 *
 * The constraint both presets are tuned against: **the board stays readable**.
 * Night is darker in the sky and the stands, not on the playing surface --
 * the floodlights come up to compensate, which is what a real stadium does
 * and what stops a night match from being a game played in a cave.
 */

export type EnvironmentMode = 'SUN' | 'NIGHT';

export interface EnvironmentPreset {
  mode: EnvironmentMode;
  label: string;

  /** Sky dome gradient, horizon to zenith. */
  sky: { horizon: string; mid: string; zenith: string };
  /** Colour of the glow around the light source. */
  glow: string;
  /** Direction of the sun or moon. Everything else lights from here. */
  lightDirection: [number, number, number];
  /** Radius of the visible disc, as a fraction of the dome. */
  discSize: number;
  discColor: string;

  /** Key light. */
  keyIntensity: number;
  keyColor: string;
  /** Sky fill and ground bounce. */
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  ambientIntensity: number;
  ambientColor: string;
  /** Cool counter-fill from the opposite side. */
  fillIntensity: number;
  fillColor: string;

  /** The four floodlights over the bowl. */
  floodIntensity: number;
  /** How bright the lamp panels themselves look. */
  floodEmissive: number;

  clouds: { light: string; shade: string; opacity: number };
  /** Stars drawn on the dome; 0 in daylight. */
  stars: number;
  moon: boolean;

  /** Extra emissive push on the board tiles, so night stays legible. */
  boardLift: number;
  /** Multiplier on the Neural Core's glow. */
  coreIntensity: number;

  fog: { color: string; nearScale: number; farScale: number };
  /** Tone mapping exposure for the whole frame. */
  exposure: number;
}

export const ENVIRONMENTS: Record<EnvironmentMode, EnvironmentPreset> = {
  /**
   * A clear high-altitude afternoon.
   *
   * Warm key, cool sky fill, strong enough that the floodlights are only
   * there for the look of the thing.
   */
  SUN: {
    mode: 'SUN',
    label: 'Sun',
    sky: { horizon: '#cfe4f5', mid: '#5ea8e0', zenith: '#1d4f8c' },
    glow: '#fff3d4',
    lightDirection: [0.42, 0.72, -0.55],
    discSize: 0.035,
    discColor: '#fffaf0',

    keyIntensity: 2.5,
    keyColor: '#fff4e2',
    hemiSky: '#bcd8f5',
    hemiGround: '#3d5570',
    hemiIntensity: 1.15,
    ambientIntensity: 0.34,
    ambientColor: '#dce9f7',
    fillIntensity: 0.5,
    fillColor: '#a8c8ec',

    floodIntensity: 40,
    floodEmissive: 1.2,

    clouds: { light: '#ffffff', shade: '#b9cfe4', opacity: 0.78 },
    stars: 0,
    moon: false,

    boardLift: 0,
    coreIntensity: 1,

    fog: { color: '#9fc4e4', nearScale: 1.4, farScale: 3.6 },
    exposure: 1.05,
  },

  /**
   * A floodlit night match.
   *
   * The sky goes deep and the stands go cool and dim, but the key light is
   * replaced by the floodlights rather than simply removed -- the board ends
   * up about as bright as it is in daylight, which is the whole point.
   */
  NIGHT: {
    mode: 'NIGHT',
    label: 'Night',
    sky: { horizon: '#1b2a45', mid: '#101c33', zenith: '#060a16' },
    glow: '#cfe0ff',
    lightDirection: [-0.35, 0.62, -0.7],
    discSize: 0.028,
    discColor: '#eef3ff',

    // moonlight: present, directional, and nowhere near enough on its own
    keyIntensity: 0.55,
    keyColor: '#b9caf0',
    hemiSky: '#2a3c5e',
    hemiGround: '#0b1220',
    hemiIntensity: 0.45,
    ambientIntensity: 0.22,
    ambientColor: '#8fa6cc',
    fillIntensity: 0.18,
    fillColor: '#6d84b4',

    // the floodlights do the work
    floodIntensity: 190,
    floodEmissive: 3.4,

    clouds: { light: '#4b5d7e', shade: '#212f4a', opacity: 0.6 },
    stars: 1400,
    moon: true,

    boardLift: 0.32,
    coreIntensity: 1.8,

    fog: { color: '#101a2e', nearScale: 1.2, farScale: 3.0 },
    exposure: 1.18,
  },
};

export const ENVIRONMENT_MODES: EnvironmentMode[] = ['SUN', 'NIGHT'];

export const environmentFor = (mode: EnvironmentMode): EnvironmentPreset =>
  ENVIRONMENTS[mode] ?? ENVIRONMENTS.SUN;
