/**
 * Shared type contracts.
 *
 * `Provenance` is load-bearing rather than decorative: every number this
 * application shows carries one, and the UI renders it next to the value. The
 * repository ships neuron identity and connectivity but no soma coordinates
 * and no neuropil labels, so it must always be obvious which of the four
 * categories a given figure belongs to.
 */

/** Where a displayed value came from. */
export type Provenance =
  /** Read from the repository datasets. FlyWire IDs, synapse counts, degrees. */
  | 'measured'
  /** Produced by running the model. Spike times, firing rates, voltages. */
  | 'simulated'
  /** Computed from measured data by this application. Layout, modules. */
  | 'derived'
  /** Illustrative geometry with no data behind it. The anatomical scaffold. */
  | 'approximation';

// ---------------------------------------------------------------------------
// connectome
// ---------------------------------------------------------------------------

/** Column-oriented connectome, kept as typed arrays for the GPU. */
export interface ConnectomeData {
  neuronCount: number;
  /** FlyWire IDs exceed 2^53, so they cannot be stored as JS numbers. */
  flywireIds: BigInt64Array;
  /** xyz triples. Derived layout coordinates, NOT soma positions. */
  positions: Float32Array;
  /** Interleaved [inDegree, outDegree] per neuron. */
  degrees: Uint32Array;
  /** Interleaved [inSynapses, outSynapses] per neuron. */
  synapseWeights: Float32Array;
  /** Excitatory fraction of each neuron's outgoing synapses, in [-1, 1]. */
  polarity: Float32Array;
  /** Derived connectivity module id per neuron. */
  moduleIds: Uint8Array;
  /** bit0 = Completed, bit1 = member of a named SEZ cell type. */
  flags: Uint8Array;
  edges: EdgeData;
  meta: ConnectomeMeta;
  anatomy: AnatomyScaffold;
  modules: ModuleSet;
  cellTypes: CellTypeSet;
}

export interface EdgeData {
  count: number;
  /** Interleaved [source, target] neuron indices. */
  pairs: Uint32Array;
  /** Signed synapse count: positive excitatory, negative inhibitory. */
  weights: Float32Array;
}

export interface ConnectomeMeta {
  builtAt: string;
  neuronCount: number;
  connectionCount: number;
  synapseCount: number;
  completedCount: number;
  exportedEdgeCount: number;
  moduleCount: number;
  sezCellTypeCount: number;
  sezNeuronCount: number;
  sources: Record<string, string>;
  provenance: Record<string, string>;
  layout: {
    method: string;
    seed: number;
    warning: string;
    separationRatio?: number;
    meanConnectedPairDistance?: number;
    meanRandomPairDistance?: number;
    separationNote?: string;
    epochs?: number;
    topKPerNeuron?: number;
    layoutEdgeCount?: number;
  };
}

/** Procedural brain geometry. Illustrative only; no neuron belongs to one. */
export interface AnatomyCompartment {
  key: string;
  label: string;
  group: 'optic' | 'central' | 'mushroom' | 'sensory' | 'sez';
  side: 'L' | 'R' | 'M';
  center: [number, number, number];
  radii: [number, number, number];
}

export interface AnatomyScaffold {
  provenance: 'approximation';
  note: string;
  frame: { x: string; y: string; z: string; unitApproxMicrons: number };
  compartments: AnatomyCompartment[];
}

/** A connectivity community derived from the measured graph. */
export interface BrainModule {
  id: number;
  label: string;
  neuronCount: number;
  centroid: [number, number, number];
  internalEdges: number;
  outgoingEdges: number;
  incomingEdges: number;
  meanOutDegree: number;
  sezNeurons: number;
}

export interface ModuleSet {
  provenance: 'derived';
  method: string;
  modules: BrainModule[];
}

/** A named SEZ cell type, verbatim from data/sez_neurons.pickle. */
export interface CellType {
  name: string;
  neuronIndices: number[];
  missing: number;
}

export interface CellTypeSet {
  provenance: 'measured';
  source: string;
  note: string;
  cellTypes: CellType[];
}

// ---------------------------------------------------------------------------
// API records
// ---------------------------------------------------------------------------

export interface NeuronRecord {
  index: number;
  flywireId: string;
  cellType: string | null;
  completed: boolean;
  outDegree: number;
  inDegree: number;
  outSynapses: number;
  inSynapses: number;
  /** null when the neuron has no outgoing synapses to compute it from. */
  excitatoryFraction: number | null;
  provenance: Provenance;
}

export interface PartnerRecord {
  neuronIndex: number;
  flywireId: string;
  cellType: string | null;
  synapses: number;
  sign: 1 | -1;
}

export interface PartnerResponse {
  neuronIndex: number;
  direction: 'in' | 'out';
  returned: number;
  total: number;
  truncated: boolean;
  partners: PartnerRecord[];
  provenance: Provenance;
}

export interface LocalNetwork {
  root: number;
  nodes: { neuronIndex: number; hop: number }[];
  edges: { source: number; target: number; synapses: number; sign: 1 | -1 }[];
  truncatedFanout: number;
  provenance: Provenance;
}

export type PathResult =
  | {
      found: true;
      path: number[];
      edges: { source: number; target: number; synapses: number; sign: 1 | -1 }[];
      hops: number;
      totalSynapses: number;
      weakestLink: number;
      searchedNeurons: number;
      maxHops: number;
      minSynapses?: number;
      method?: string;
      note?: string;
      nodes?: NeuronRecord[];
      provenance: Provenance;
    }
  | {
      found: false;
      reason: string;
      searchedNeurons?: number;
      maxHops?: number;
      provenance: Provenance;
    };

/** Induced subgraph: every measured synapse between a set of neurons. */
export interface Subnetwork {
  neuronCount: number;
  edgeCount: number;
  truncated: boolean;
  source: number[];
  target: number[];
  synapses: number[];
  /** 1 excitatory, 0 inhibitory. */
  excitatory: number[];
  provenance: Provenance;
}

export interface SearchHit {
  kind: 'neuron' | 'cellType';
  label: string;
  neuronIndex: number;
  neuronCount?: number;
  flywireId: string;
  cellType?: string | null;
  match?: string;
  provenance: Provenance;
}

// ---------------------------------------------------------------------------
// simulation
// ---------------------------------------------------------------------------

export type SimulationBackendKey =
  | 'pytorch'
  | 'pytorch-cuda'
  | 'brian2'
  | 'brian2cuda'
  | 'brian2genn'
  | 'genn'
  | 'nestgpu';

export interface BackendInfo {
  key: SimulationBackendKey;
  label: string;
  device: string;
  available: boolean;
  status: string;
  detail: string;
  /** True for the backend the repository treats as ground truth (Brian2). */
  reference: boolean;
  runner: string;
}

export interface SimulationConfig {
  durationMs: number;
  trials: number;
  inputRateHz: number;
  inputNeurons: number[];
  silencedNeurons: number[];
  probeNeurons: number[];
  backend: SimulationBackendKey;
  seed: number;
}

export type SimulationState =
  | 'IDLE'
  | 'QUEUED'
  | 'RUNNING'
  | 'PROCESSING'
  | 'COMPLETE'
  | 'ERROR'
  | 'CANCELLED';

export interface SimulationStatistics {
  spikeCount: number;
  activeNeuronCount: number;
  meanFiringRateHz: number;
  medianFiringRateHz: number;
  peakFiringRateHz: number;
  populationRateHz: number;
  truncated: boolean;
  rateBasis: string;
}

export interface SimulationSummary {
  simulationId: string;
  backend: SimulationBackendKey;
  backendLabel: string;
  device: string;
  durationMs: number;
  timestepMs: number;
  trials: number;
  inputRateHz: number;
  inputNeurons: number[];
  silencedNeurons: number[];
  probeNeurons: number[];
  probeSupported: boolean;
  seed: number;
  statistics: SimulationStatistics;
  timings: { simulationSeconds: number; msPerStep?: number; realtimeRatio: number };
  spikeEncoding: { url: string; layout: string; count: number };
  provenance: Provenance;
}

export interface SimulationStatus {
  simulationId: string;
  state: SimulationState;
  stage: string;
  step: number;
  totalSteps: number;
  progress: number;
  spikesSoFar: number;
  elapsedSeconds: number;
  error: string | null;
  errorDetail: string | null;
  request: Record<string, unknown>;
  result?: SimulationSummary;
}

/** Decoded spike train. Parallel arrays, sorted by time. */
export interface SpikeTrain {
  count: number;
  neuronIndex: Uint32Array;
  timeMs: Float32Array;
  trial: Uint16Array;
}

export interface Spike {
  neuronIndex: number;
  timeMs: number;
  trial: number;
  flywireId?: string;
}

export interface MembraneTrace {
  neuronIndex: number;
  voltageMv: number[];
}

export interface TraceResponse {
  timesMs: number[];
  strideSteps: number;
  unit: string;
  thresholdMv: number;
  restMv: number;
  probes: MembraneTrace[];
  note: string;
  provenance: Provenance;
}

export interface ExperimentPreset {
  key: string;
  name: string;
  stimRateHz: number;
  inputNeurons: number[];
  inputFlywireIds: string[];
  unresolved: string[];
  source: string;
  provenance: Provenance;
}

export interface ModelInfo {
  name: string;
  source: string;
  timestepMs: number;
  parameters: Record<string, number>;
  units: Record<string, string>;
  citations: string[];
  limits: { maxDurationMs: number; maxTrials: number; maxProbeNeurons: number };
  provenance: string;
}

// ---------------------------------------------------------------------------
// view state
// ---------------------------------------------------------------------------

/**
 * Visual modes.
 *
 * Each is a preset over the same persistent scene, never a different scene:
 * the fly is one object and the modes only change what is drawn inside and
 * how transparent its cuticle is.
 */
export type ViewMode =
  /** The fly, opaque. No neural data drawn. */
  | 'anatomy'
  /** Cuticle turns to glass; the connectome appears inside the head. */
  | 'xray'
  /** Measured synaptic connections between neurons. */
  | 'connections'
  /** Only neurons that spiked in the loaded simulation. */
  | 'active'
  /** Spikes animated along measured synapses as they propagate. */
  | 'propagation'
  /** The selected neuron's measured in/out neighbourhood. */
  | 'local'
  /** A measured route between two chosen neurons. */
  | 'pathway';

export interface LayerVisibility {
  anatomy: boolean;
  neurons: boolean;
  connections: boolean;
  activity: boolean;
  labels: boolean;
  axes: boolean;
}

export interface ConnectionFilters {
  minSynapses: number;
  maxSynapses: number;
  showExcitatory: boolean;
  showInhibitory: boolean;
  density: number;
  activeOnly: boolean;
}

export type CameraPreset =
  | 'reset'
  | 'front'
  | 'top'
  | 'left'
  | 'right'
  | 'central'
  | 'selection';

export interface RegionActivity {
  moduleId: number;
  label: string;
  neuronCount: number;
  activeNeurons: number;
  spikeCount: number;
  meanRateHz: number;
}
