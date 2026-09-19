/**
 * The connectome, rendered inside the fly's head.
 *
 * Every layer here sits under one group carrying the brain-space -> fly-space
 * transform from flyAnatomy.ts, so the neurons are anatomically inside the head
 * rather than floating beside the model.
 *
 * WHAT IS REAL
 *   neuron identity, degree, polarity  measured (FlyWire 783)
 *   every connection drawn             measured
 *   spike times driving the animation  simulated by the repository's model
 *   neuron coordinates                 derived (force-directed layout)
 *   compartment shells                 approximation (illustrative only)
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Points,
  SphereGeometry,
  Vector3,
} from 'three';

import {
  createCompartmentMaterial,
  createConnectionMaterial,
  createNeuronMaterial,
  createPulseMaterial,
} from './materials/brainMaterials';
import { BRAIN_CENTER, BRAIN_SCALE } from './flyAnatomy';
import { clock } from '../store/clock';
import { useStore } from '../store/useStore';
import type { ConnectomeData } from '../types';

/** Model axonal delay, from code/run_pytorch.py MODEL_PARAMS.tDelay. */
export const MODEL_DELAY_MS = 1.8;
/**
 * Pulses are stretched relative to the real 1.8 ms delay purely so they are
 * visible: at any usable playback speed 1.8 ms of model time passes in a few
 * milliseconds of wall clock. The legend states this factor.
 */
export const PULSE_STRETCH = 14;
const PULSE_TRAVEL_MS = MODEL_DELAY_MS * PULSE_STRETCH;
const MAX_PULSES = 24000;

/** Colour per compartment group; muted, because the scaffold is illustrative. */
const COMPARTMENT_COLORS: Record<string, string> = {
  optic: '#3f7fa8',
  central: '#6f7fb8',
  mushroom: '#9a7fc0',
  sensory: '#57a89a',
  sez: '#a8845a',
};

// ---------------------------------------------------------------------------

export function BrainGroup({ children }: { children: React.ReactNode }) {
  return (
    <group
      name="brain"
      position={[BRAIN_CENTER.x, BRAIN_CENTER.y, BRAIN_CENTER.z]}
      scale={BRAIN_SCALE}
    >
      {children}
    </group>
  );
}

// ---------------------------------------------------------------------------
// compartment scaffold
// ---------------------------------------------------------------------------

/**
 * Illustrative neuropil shells.
 *
 * Rendered faint and rim-lit so they read as a reference frame, never as data.
 * No neuron is assigned to one and no statistic is computed over them.
 */
export function CompartmentLayer() {
  const connectome = useStore((s) => s.connectome);
  const visible = useStore((s) => s.layers.anatomy);
  const xray = useStore((s) => s.xray);

  const unitSphere = useMemo(() => new SphereGeometry(1, 32, 24), []);
  const materials = useMemo(() => {
    const map = new Map<string, ReturnType<typeof createCompartmentMaterial>>();
    for (const [group, color] of Object.entries(COMPARTMENT_COLORS)) {
      map.set(group, createCompartmentMaterial(color));
    }
    return map;
  }, []);

  useEffect(() => {
    for (const m of materials.values()) m.uniforms.uOpacity.value = 0.05 + xray * 0.16;
  }, [xray, materials]);

  useEffect(() => () => {
    unitSphere.dispose();
    materials.forEach((m) => m.dispose());
  }, [unitSphere, materials]);

  if (!connectome || !visible || xray < 0.2) return null;

  return (
    <group name="compartments">
      {connectome.anatomy.compartments.map((c) => (
        <mesh
          key={c.key}
          geometry={unitSphere}
          material={materials.get(c.group)}
          position={c.center}
          scale={c.radii}
          renderOrder={1}
        />
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------
// neurons
// ---------------------------------------------------------------------------

/**
 * All 138,639 neurons as a single Points draw call.
 *
 * The activation attribute is the only thing that changes per frame, and it is
 * uploaded only while a simulation is loaded. Anything per-neuron that React
 * would otherwise own -- size, colour, visibility -- is decided in the shader.
 */
export function NeuronLayer() {
  const connectome = useStore((s) => s.connectome);
  const visible = useStore((s) => s.layers.neurons);
  const showActivity = useStore((s) => s.layers.activity);
  const viewMode = useStore((s) => s.viewMode);
  const activation = useStore((s) => s.activation);
  const selected = useStore((s) => s.selectedNeuron);
  const hovered = useStore((s) => s.hoveredNeuron);
  const selectedModule = useStore((s) => s.selectedModule);
  const selectNeuron = useStore((s) => s.selectNeuron);

  const pointsRef = useRef<Points>(null);
  const { gl } = useThree();

  const material = useMemo(() => createNeuronMaterial(), []);

  const geometry = useMemo(() => {
    if (!connectome) return null;
    const n = connectome.neuronCount;
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(connectome.positions, 3));

    const activationAttr = new Float32Array(n);
    g.setAttribute('aActivation', new BufferAttribute(activationAttr, 1));

    const degree = new Float32Array(n);
    const moduleId = new Float32Array(n);
    const index = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      degree[i] = connectome.degrees[i * 2 + 1]; // measured out-degree
      moduleId[i] = connectome.moduleIds[i];
      index[i] = i;
    }
    g.setAttribute('aDegree', new BufferAttribute(degree, 1));
    g.setAttribute('aModule', new BufferAttribute(moduleId, 1));
    g.setAttribute('aIndex', new BufferAttribute(index, 1));
    g.computeBoundingSphere();
    return g;
  }, [connectome]);

  useEffect(() => () => {
    geometry?.dispose();
    material.dispose();
  }, [geometry, material]);

  useEffect(() => {
    material.uniforms.uPixelRatio.value = Math.min(gl.getPixelRatio(), 2);
  }, [gl, material]);

  useEffect(() => {
    material.uniforms.uSelected.value = selected ?? -1;
    material.uniforms.uHovered.value = hovered ?? -1;
    material.uniforms.uHighlightModule.value = selectedModule ?? -1;
  }, [selected, hovered, selectedModule, material]);

  useEffect(() => {
    const activeOnly = viewMode === 'active' || viewMode === 'propagation';
    material.uniforms.uActiveOnly.value = activeOnly && activation ? 1 : 0;
    material.uniforms.uHasActivity.value = activation && showActivity ? 1 : 0;
  }, [viewMode, activation, showActivity, material]);

  useFrame((_, delta) => {
    if (!geometry) return;
    clock.tick(delta);

    if (!activation) return;
    activation.seek(clock.timeMs);

    const attr = geometry.getAttribute('aActivation') as BufferAttribute;
    (attr.array as Float32Array).set(activation.level);
    attr.needsUpdate = true;
  });

  if (!connectome || !geometry || !visible) return null;

  return (
    <points
      ref={pointsRef}
      name="neurons"
      geometry={geometry}
      material={material}
      frustumCulled
      onClick={(event) => {
        // three reports every point under the ray; the nearest is the intent
        const hit = event.intersections[0];
        if (hit?.index !== undefined) {
          event.stopPropagation();
          void selectNeuron(hit.index, false);
        }
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// connections
// ---------------------------------------------------------------------------

function buildEdgeGeometry(
  connectome: ConnectomeData,
  pairs: ArrayLike<number>,
  weights: ArrayLike<number>,
  count: number,
  highlight = 0,
): BufferGeometry {
  const positions = new Float32Array(count * 6);
  const weightAttr = new Float32Array(count * 2);
  const signAttr = new Float32Array(count * 2);
  const highlightAttr = new Float32Array(count * 2);

  let maxWeight = 1;
  for (let e = 0; e < count; e++) {
    const w = Math.abs(weights[e]);
    if (w > maxWeight) maxWeight = w;
  }
  const logMax = Math.log1p(maxWeight);

  for (let e = 0; e < count; e++) {
    const a = pairs[e * 2];
    const b = pairs[e * 2 + 1];
    positions[e * 6 + 0] = connectome.positions[a * 3];
    positions[e * 6 + 1] = connectome.positions[a * 3 + 1];
    positions[e * 6 + 2] = connectome.positions[a * 3 + 2];
    positions[e * 6 + 3] = connectome.positions[b * 3];
    positions[e * 6 + 4] = connectome.positions[b * 3 + 1];
    positions[e * 6 + 5] = connectome.positions[b * 3 + 2];

    const norm = Math.log1p(Math.abs(weights[e])) / logMax;
    weightAttr[e * 2] = norm;
    weightAttr[e * 2 + 1] = norm;
    const sign = weights[e] >= 0 ? 1 : -1;
    signAttr[e * 2] = sign;
    signAttr[e * 2 + 1] = sign;
    highlightAttr[e * 2] = highlight;
    highlightAttr[e * 2 + 1] = highlight;
  }

  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(positions, 3));
  g.setAttribute('aWeight', new BufferAttribute(weightAttr, 1));
  g.setAttribute('aSign', new BufferAttribute(signAttr, 1));
  g.setAttribute('aHighlight', new BufferAttribute(highlightAttr, 1));
  g.computeBoundingSphere();
  return g;
}

/**
 * Global connectivity: the strongest measured connections.
 *
 * public/data/edges.bin holds the 200,000 strongest of 15,091,983 connections
 * by synapse count. Drawing all 15 M would be neither renderable nor readable,
 * so the filter controls say exactly what fraction is on screen.
 */
export function ConnectionLayer() {
  const connectome = useStore((s) => s.connectome);
  const visible = useStore((s) => s.layers.connections);
  const filters = useStore((s) => s.filters);
  const viewMode = useStore((s) => s.viewMode);

  const material = useMemo(() => createConnectionMaterial(), []);

  const geometry = useMemo(() => {
    if (!connectome || !visible) return null;
    // The global layer is only meaningful in the structural modes; the
    // activity modes draw the active subnetwork instead.
    if (viewMode === 'local' || viewMode === 'pathway') return null;

    const { pairs, weights, count } = connectome.edges;
    const keepPairs: number[] = [];
    const keepWeights: number[] = [];
    const budget = Math.max(200, Math.floor(count * filters.density));

    for (let e = 0; e < count && keepPairs.length < budget * 2; e++) {
      const w = weights[e];
      const magnitude = Math.abs(w);
      if (magnitude < filters.minSynapses) continue;
      if (magnitude > filters.maxSynapses) continue;
      if (w >= 0 && !filters.showExcitatory) continue;
      if (w < 0 && !filters.showInhibitory) continue;
      keepPairs.push(pairs[e * 2], pairs[e * 2 + 1]);
      keepWeights.push(w);
    }
    if (!keepWeights.length) return null;
    return buildEdgeGeometry(connectome, keepPairs, keepWeights, keepWeights.length);
  }, [connectome, visible, filters, viewMode]);

  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => () => geometry?.dispose(), [geometry]);

  if (!geometry) return null;
  return <lineSegments name="connections" geometry={geometry} material={material} />;
}

/**
 * Connections among the neurons that actually fired.
 *
 * Fetched from /api/subnetwork after a run: the exact induced subgraph of the
 * active set over the full 15 M-edge connectome, not a sample of the exported
 * subset.
 */
export function ActiveConnectionLayer() {
  const connectome = useStore((s) => s.connectome);
  const subnetwork = useStore((s) => s.activeSubnetwork);
  const visible = useStore((s) => s.layers.connections);
  const viewMode = useStore((s) => s.viewMode);

  const material = useMemo(() => {
    const m = createConnectionMaterial();
    m.uniforms.uOpacity.value = 0.3;
    return m;
  }, []);

  const geometry = useMemo(() => {
    if (!connectome || !subnetwork || !visible) return null;
    if (viewMode !== 'propagation' && viewMode !== 'active') return null;
    const count = subnetwork.edgeCount;
    if (!count) return null;
    const pairs = new Uint32Array(count * 2);
    const weights = new Float32Array(count);
    for (let e = 0; e < count; e++) {
      pairs[e * 2] = subnetwork.source[e];
      pairs[e * 2 + 1] = subnetwork.target[e];
      weights[e] = subnetwork.excitatory[e] ? subnetwork.synapses[e] : -subnetwork.synapses[e];
    }
    return buildEdgeGeometry(connectome, pairs, weights, count);
  }, [connectome, subnetwork, visible, viewMode]);

  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => () => geometry?.dispose(), [geometry]);

  if (!geometry) return null;
  return <lineSegments name="active-connections" geometry={geometry} material={material} />;
}

// ---------------------------------------------------------------------------
// propagation
// ---------------------------------------------------------------------------

/**
 * Spikes travelling along their synapses.
 *
 * A pulse departs a neuron at the exact time that neuron fired in the
 * simulation and arrives at its postsynaptic partner after the model's axonal
 * delay, stretched by PULSE_STRETCH for visibility. Positions are interpolated
 * on the CPU because the departure time comes from the activation field, which
 * already lives there; the per-frame cost is one lerp per visible pulse.
 */
export function PulseLayer() {
  const connectome = useStore((s) => s.connectome);
  const subnetwork = useStore((s) => s.activeSubnetwork);
  const activation = useStore((s) => s.activation);
  const viewMode = useStore((s) => s.viewMode);
  const showActivity = useStore((s) => s.layers.activity);
  const reducedMotion = useStore((s) => s.reducedMotion);

  const material = useMemo(() => createPulseMaterial(), []);
  const { gl } = useThree();

  const edges = useMemo(() => {
    if (!connectome || !subnetwork || subnetwork.edgeCount === 0) return null;
    // Keep the strongest connections when there are more than we will draw,
    // so the thinning is by synapse count rather than arbitrary.
    const order = Array.from({ length: subnetwork.edgeCount }, (_, i) => i);
    if (order.length > MAX_PULSES) {
      order.sort((a, b) => subnetwork.synapses[b] - subnetwork.synapses[a]);
      order.length = MAX_PULSES;
    }
    const count = order.length;
    const source = new Uint32Array(count);
    const from = new Float32Array(count * 3);
    const to = new Float32Array(count * 3);
    const sign = new Float32Array(count);

    order.forEach((e, k) => {
      const a = subnetwork.source[e];
      const b = subnetwork.target[e];
      source[k] = a;
      from[k * 3] = connectome.positions[a * 3];
      from[k * 3 + 1] = connectome.positions[a * 3 + 1];
      from[k * 3 + 2] = connectome.positions[a * 3 + 2];
      to[k * 3] = connectome.positions[b * 3];
      to[k * 3 + 1] = connectome.positions[b * 3 + 1];
      to[k * 3 + 2] = connectome.positions[b * 3 + 2];
      sign[k] = subnetwork.excitatory[e] ? 1 : -1;
    });
    return { count, source, from, to, sign };
  }, [connectome, subnetwork]);

  const geometry = useMemo(() => {
    if (!edges) return null;
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(edges.count * 3), 3));
    g.setAttribute('aProgress', new BufferAttribute(new Float32Array(edges.count).fill(-1), 1));
    g.setAttribute('aSign', new BufferAttribute(edges.sign, 1));
    // pulses move every frame; the <points> below opts out of frustum
    // culling so three never tries to fit a bound around them
    g.boundingSphere = null;
    return g;
  }, [edges]);

  useEffect(() => {
    material.uniforms.uPixelRatio.value = Math.min(gl.getPixelRatio(), 2);
  }, [gl, material]);

  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => () => geometry?.dispose(), [geometry]);

  useFrame(() => {
    if (!geometry || !edges || !activation) return;
    const now = clock.timeMs;
    const posAttr = geometry.getAttribute('position') as BufferAttribute;
    const progAttr = geometry.getAttribute('aProgress') as BufferAttribute;
    const pos = posAttr.array as Float32Array;
    const prog = progAttr.array as Float32Array;

    for (let k = 0; k < edges.count; k++) {
      const last = activation.lastSpikeMs[edges.source[k]];
      if (last < 0) {
        prog[k] = -1;
        continue;
      }
      const t = (now - last) / PULSE_TRAVEL_MS;
      if (t < 0 || t > 1) {
        prog[k] = -1;
        continue;
      }
      prog[k] = t;
      const i3 = k * 3;
      pos[i3] = edges.from[i3] + (edges.to[i3] - edges.from[i3]) * t;
      pos[i3 + 1] = edges.from[i3 + 1] + (edges.to[i3 + 1] - edges.from[i3 + 1]) * t;
      pos[i3 + 2] = edges.from[i3 + 2] + (edges.to[i3 + 2] - edges.from[i3 + 2]) * t;
    }
    posAttr.needsUpdate = true;
    progAttr.needsUpdate = true;
  });

  if (!geometry || viewMode !== 'propagation' || !showActivity || reducedMotion) return null;
  return <points name="pulses" geometry={geometry} material={material} frustumCulled={false} />;
}

// ---------------------------------------------------------------------------
// local network and pathway
// ---------------------------------------------------------------------------

/** The selected neuron's measured inputs and outputs. */
export function LocalNetworkLayer() {
  const connectome = useStore((s) => s.connectome);
  const local = useStore((s) => s.localNetwork);
  const viewMode = useStore((s) => s.viewMode);

  const material = useMemo(() => {
    const m = createConnectionMaterial();
    m.uniforms.uOpacity.value = 0.85;
    return m;
  }, []);

  const geometry = useMemo(() => {
    if (!connectome || !local || local.edges.length === 0) return null;
    const count = local.edges.length;
    const pairs = new Uint32Array(count * 2);
    const weights = new Float32Array(count);
    local.edges.forEach((e, i) => {
      pairs[i * 2] = e.source;
      pairs[i * 2 + 1] = e.target;
      weights[i] = e.sign * e.synapses;
    });
    return buildEdgeGeometry(connectome, pairs, weights, count, 0.25);
  }, [connectome, local]);

  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => () => geometry?.dispose(), [geometry]);

  if (!geometry || viewMode !== 'local') return null;
  return <lineSegments name="local-network" geometry={geometry} material={material} />;
}

/** A measured route between two neurons, drawn as a highlighted chain. */
export function PathwayLayer() {
  const connectome = useStore((s) => s.connectome);
  const path = useStore((s) => s.pathResult);

  const material = useMemo(() => {
    const m = createConnectionMaterial();
    m.uniforms.uOpacity.value = 1;
    return m;
  }, []);

  const nodeGeometry = useMemo(() => new SphereGeometry(0.06, 14, 10), []);

  const { geometry, nodes } = useMemo(() => {
    if (!connectome || !path || !path.found || path.edges.length === 0) {
      return { geometry: null, nodes: [] as Vector3[] };
    }
    const count = path.edges.length;
    const pairs = new Uint32Array(count * 2);
    const weights = new Float32Array(count);
    path.edges.forEach((e, i) => {
      pairs[i * 2] = e.source;
      pairs[i * 2 + 1] = e.target;
      weights[i] = e.sign * e.synapses;
    });
    const nodePositions = path.path.map(
      (i) =>
        new Vector3(
          connectome.positions[i * 3],
          connectome.positions[i * 3 + 1],
          connectome.positions[i * 3 + 2],
        ),
    );
    return {
      geometry: buildEdgeGeometry(connectome, pairs, weights, count, 1),
      nodes: nodePositions,
    };
  }, [connectome, path]);

  useEffect(() => () => {
    material.dispose();
    nodeGeometry.dispose();
  }, [material, nodeGeometry]);
  useEffect(() => () => geometry?.dispose(), [geometry]);

  if (!geometry) return null;
  return (
    <group name="pathway">
      <lineSegments geometry={geometry} material={material} renderOrder={5} />
      {nodes.map((p, i) => (
        <mesh key={i} geometry={nodeGeometry} position={p} renderOrder={6}>
          <meshBasicMaterial
            color={new Color(i === 0 ? '#7dd3fc' : i === nodes.length - 1 ? '#ffd166' : '#ffffff')}
            transparent
            opacity={0.95}
            blending={AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}
