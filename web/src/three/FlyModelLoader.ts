/**
 * Swap-in point for a real Drosophila mesh.
 *
 * The repository ships no 3D model -- searched for glb, gltf, obj, fbx, stl,
 * ply, blend and dae, and there are none -- so the fly you see is the
 * procedural geometry in geometry/flyGeometry.ts. That is a visualisation
 * approximation and the About panel says so.
 *
 * If a scanned or sculpted mesh is added later, drop it in web/public/models/
 * and point VITE_FLY_MODEL_URL at it. Nothing else changes: the loader
 * normalises whatever it gets into the coordinate frame in flyAnatomy.ts, so
 * the camera presets, the head-capsule fade and -- most importantly -- the
 * placement of the connectome inside the head all keep working.
 *
 * Contract the mesh must satisfy after normalisation:
 *   +x fly's right, +y dorsal, +z anterior, origin at the thorax centre,
 *   body length ~32 units. Name the head mesh "head" (or tag it in userData)
 *   so it can be faded independently for X-ray mode.
 */

import { Box3, Group, Mesh, Object3D, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

import { FLY_FRAME } from './flyAnatomy';

export type ModelFormat = 'glb' | 'gltf' | 'obj' | 'ply' | 'stl';

export interface LoadedFlyModel {
  root: Group;
  format: ModelFormat;
  url: string;
  /** Meshes matched to anatomical roles, where the file named them. */
  parts: Map<string, Object3D>;
  /** True when the loader had to guess the orientation. */
  normalised: boolean;
}

export class ModelLoadError extends Error {
  constructor(url: string, cause: unknown) {
    super(`Could not load fly model from ${url}: ${String(cause)}`);
    this.name = 'ModelLoadError';
  }
}

function formatOf(url: string): ModelFormat {
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'glb':
      return 'glb';
    case 'gltf':
      return 'gltf';
    case 'obj':
      return 'obj';
    case 'ply':
      return 'ply';
    case 'stl':
      return 'stl';
    default:
      throw new Error(
        `Unsupported model format ".${ext}". Use glb, gltf, obj, ply or stl; ` +
          `glb is preferred for the web because it is a single binary file.`,
      );
  }
}

/** Anatomical roles the loader will recognise from node names. */
const PART_PATTERNS: [string, RegExp][] = [
  ['head', /head|capsule/i],
  ['eye-l', /(left|_l\b).*eye|eye.*(left|_l\b)/i],
  ['eye-r', /(right|_r\b).*eye|eye.*(right|_r\b)/i],
  ['thorax', /thorax|scutum/i],
  ['abdomen', /abdomen|tergite/i],
  ['wing-l', /(left|_l\b).*wing|wing.*(left|_l\b)/i],
  ['wing-r', /(right|_r\b).*wing|wing.*(right|_r\b)/i],
  ['antennae', /antenn|arista/i],
  ['proboscis', /proboscis|labellum|mouth/i],
  ['legs', /leg|tarsus|femur|tibia|coxa/i],
];

function indexParts(root: Object3D): Map<string, Object3D> {
  const parts = new Map<string, Object3D>();
  root.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    const name = node.name || '';
    for (const [role, pattern] of PART_PATTERNS) {
      if (!parts.has(role) && pattern.test(name)) parts.set(role, node);
    }
  });
  return parts;
}

/**
 * Scale and centre an arbitrary mesh into the fly frame.
 *
 * Only uniform scale and translation are applied. Rotation is deliberately not
 * guessed: an author who exports Z-up should set the rotation on the file or
 * pass it here, because silently rotating a mesh that was already correct is
 * worse than showing it the wrong way up once.
 */
function normalise(root: Object3D): boolean {
  const box = new Box3().setFromObject(root);
  const size = box.getSize(new Vector3());
  const longest = Math.max(size.x, size.y, size.z);
  if (longest <= 0 || !Number.isFinite(longest)) return false;

  const scale = FLY_FRAME.bodyLengthUnits / longest;
  root.scale.setScalar(scale);
  root.updateMatrixWorld(true);

  const scaledBox = new Box3().setFromObject(root);
  const center = scaledBox.getCenter(new Vector3());
  root.position.sub(center);
  root.updateMatrixWorld(true);
  return true;
}

export async function loadFlyModel(url: string): Promise<LoadedFlyModel> {
  const format = formatOf(url);

  try {
    const root = new Group();
    root.name = 'fly-model';

    if (format === 'glb' || format === 'gltf') {
      const gltf = await new GLTFLoader().loadAsync(url);
      root.add(gltf.scene);
    } else if (format === 'obj') {
      root.add(await new OBJLoader().loadAsync(url));
    } else if (format === 'ply') {
      const geometry = await new PLYLoader().loadAsync(url);
      geometry.computeVertexNormals();
      root.add(new Mesh(geometry));
    } else {
      const geometry = await new STLLoader().loadAsync(url);
      geometry.computeVertexNormals();
      root.add(new Mesh(geometry));
    }

    const normalised = normalise(root);
    return { root, format, url, parts: indexParts(root), normalised };
  } catch (cause) {
    throw new ModelLoadError(url, cause);
  }
}

/** Configured external model, or null when the procedural fly should be used. */
export function configuredModelUrl(): string | null {
  const url = import.meta.env.VITE_FLY_MODEL_URL;
  return typeof url === 'string' && url.length > 0 ? url : null;
}
