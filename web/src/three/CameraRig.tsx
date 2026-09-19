/**
 * Camera transitions between anatomical viewpoints.
 *
 * Moves are always interpolated, never teleported: the fly is one object and
 * cutting between viewpoints breaks the sense that you are moving around and
 * then into it. The rig drives OrbitControls' target as well as the camera
 * position, so the user keeps orbiting whatever they just flew to.
 */

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { Vector3 } from 'three';

import {
  BRAIN_CENTER,
  BRAIN_SCALE,
  CAMERA_POSE_BY_KEY,
  poseForPoint,
  type CameraPose,
} from './flyAnatomy';
import { useStore } from '../store/useStore';

interface Props {
  controls: React.RefObject<OrbitControlsImpl | null>;
}

/** Seconds a transition takes; short enough not to feel like a cutscene. */
const TRANSITION_SECONDS = 0.9;

const easeInOut = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export function CameraRig({ controls }: Props) {
  const { camera } = useThree();
  const request = useStore((s) => s.cameraRequest);
  const consume = useStore((s) => s.consumeCamera);
  const connectome = useStore((s) => s.connectome);
  const selectedNeuron = useStore((s) => s.selectedNeuron);
  const selectedModule = useStore((s) => s.selectedModule);
  const reducedMotion = useStore((s) => s.reducedMotion);

  const transition = useRef<{
    fromPos: Vector3;
    toPos: Vector3;
    fromTarget: Vector3;
    toTarget: Vector3;
    elapsed: number;
  } | null>(null);

  useEffect(() => {
    if (!request) return;

    let pose: CameraPose | undefined = CAMERA_POSE_BY_KEY.get(request);

    // 'selection' resolves against whatever is currently selected, so the
    // button means the same thing whether a neuron or a module is active.
    if (request === 'selection') {
      const point = resolveSelection(connectome, selectedNeuron, selectedModule);
      if (point) {
        const direction = camera.position.clone().sub(point).normalize();
        pose = poseForPoint(point, direction, selectedNeuron !== null ? 3.2 : 8);
      } else {
        pose = CAMERA_POSE_BY_KEY.get('brain');
      }
    }

    if (!pose) {
      consume();
      return;
    }

    if (reducedMotion) {
      camera.position.copy(pose.position);
      controls.current?.target.copy(pose.target);
      controls.current?.update();
      consume();
      return;
    }

    transition.current = {
      fromPos: camera.position.clone(),
      toPos: pose.position.clone(),
      fromTarget: controls.current?.target.clone() ?? new Vector3(),
      toTarget: pose.target.clone(),
      elapsed: 0,
    };
    consume();
  }, [request, camera, controls, consume, connectome, selectedNeuron, selectedModule, reducedMotion]);

  useFrame((_, delta) => {
    const t = transition.current;
    if (!t) return;

    t.elapsed += delta;
    const progress = Math.min(1, t.elapsed / TRANSITION_SECONDS);
    const eased = easeInOut(progress);

    camera.position.lerpVectors(t.fromPos, t.toPos, eased);
    if (controls.current) {
      controls.current.target.lerpVectors(t.fromTarget, t.toTarget, eased);
      controls.current.update();
    }

    if (progress >= 1) transition.current = null;
  });

  return null;
}

function resolveSelection(
  connectome: ReturnType<typeof useStore.getState>['connectome'],
  neuron: number | null,
  moduleId: number | null,
): Vector3 | null {
  if (!connectome) return null;

  // Both live in brain space, so they need the same transform the brain group
  // applies before the camera can be pointed at them.
  const toFly = (x: number, y: number, z: number) =>
    new Vector3(x, y, z).multiplyScalar(BRAIN_SCALE).add(BRAIN_CENTER);

  if (neuron !== null && neuron < connectome.neuronCount) {
    return toFly(
      connectome.positions[neuron * 3],
      connectome.positions[neuron * 3 + 1],
      connectome.positions[neuron * 3 + 2],
    );
  }
  if (moduleId !== null) {
    const mod = connectome.modules.modules.find((m) => m.id === moduleId);
    if (mod) return toFly(mod.centroid[0], mod.centroid[1], mod.centroid[2]);
  }
  return null;
}
