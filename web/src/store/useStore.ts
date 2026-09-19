/**
 * Application state.
 *
 * One store, because almost every panel needs to react to the same few things:
 * what is selected, what the simulation produced, and where we are in time.
 * The 60 fps playback position deliberately lives in clock.ts instead.
 */

import { create } from 'zustand';

import * as api from '../api/client';
import { ApiError } from '../api/client';
import {
  ActivationField,
  buildSpikeIndex,
  type SpikeIndex,
} from '../data/activity';
import { loadConnectome, type LoadStep } from '../data/loader';
import type {
  BackendInfo,
  ConnectionFilters,
  ConnectomeData,
  ExperimentPreset,
  LayerVisibility,
  LocalNetwork,
  ModelInfo,
  NeuronRecord,
  PathResult,
  SearchHit,
  SimulationConfig,
  SimulationState,
  SimulationSummary,
  SpikeTrain,
  Subnetwork,
  TraceResponse,
  ViewMode,
} from '../types';
import { clock } from './clock';
import type { FlyPartKey } from '../three/flyAnatomy';

export type RateScope =
  | { kind: 'brain' }
  | { kind: 'module'; moduleId: number }
  | { kind: 'neuron'; neuronIndex: number }
  | { kind: 'cellType'; name: string };

interface AppState {
  // --- bootstrap ---
  entered: boolean;
  loadSteps: LoadStep[];
  loadError: string | null;
  connectome: ConnectomeData | null;
  model: ModelInfo | null;
  backends: BackendInfo[];
  experiments: ExperimentPreset[];
  serviceError: string | null;
  enter: () => void;
  bootstrap: () => Promise<void>;

  // --- view ---
  viewMode: ViewMode;
  layers: LayerVisibility;
  filters: ConnectionFilters;
  /** Head-capsule transparency, 0 = solid cuticle, 1 = fully see-through. */
  xray: number;
  debug: boolean;
  reducedMotion: boolean;
  setViewMode: (mode: ViewMode) => void;
  toggleLayer: (key: keyof LayerVisibility) => void;
  setFilters: (patch: Partial<ConnectionFilters>) => void;
  setXray: (value: number) => void;
  toggleDebug: () => void;

  // --- camera ---
  /** Pose key the rig should fly to; cleared once consumed. */
  cameraRequest: string | null;
  requestCamera: (poseKey: string) => void;
  consumeCamera: () => void;

  // --- selection ---
  selectedNeuron: number | null;
  neuronRecord: NeuronRecord | null;
  localNetwork: LocalNetwork | null;
  selectedModule: number | null;
  selectedPart: FlyPartKey | null;
  hoveredNeuron: number | null;
  inspectorError: string | null;
  selectNeuron: (index: number | null, focus?: boolean) => Promise<void>;
  selectModule: (id: number | null) => void;
  selectPart: (key: FlyPartKey | null) => void;
  setHovered: (index: number | null) => void;

  // --- search ---
  searchQuery: string;
  searchResults: SearchHit[];
  searching: boolean;
  setSearchQuery: (q: string) => void;
  runSearch: (q: string) => Promise<void>;

  // --- pathway ---
  pathSource: number | null;
  pathTarget: number | null;
  pathResult: PathResult | null;
  pathBusy: boolean;
  setPathEndpoint: (which: 'source' | 'target', index: number | null) => void;
  findPath: () => Promise<void>;
  clearPath: () => void;

  // --- simulation ---
  config: SimulationConfig;
  simState: SimulationState;
  simStage: string;
  simProgress: number;
  simSpikesSoFar: number;
  simElapsed: number;
  simError: string | null;
  simErrorDetail: string | null;
  summary: SimulationSummary | null;
  spikes: SpikeTrain | null;
  spikeIndex: SpikeIndex | null;
  activation: ActivationField | null;
  traces: TraceResponse | null;
  /** Measured synapses among the neurons that fired; drives propagation. */
  activeSubnetwork: Subnetwork | null;
  rateScope: RateScope;
  setConfig: (patch: Partial<SimulationConfig>) => void;
  applyExperiment: (key: string) => void;
  runSimulation: () => Promise<void>;
  cancelSimulation: () => Promise<void>;
  clearSimulation: () => void;
  setRateScope: (scope: RateScope) => void;
}

const DEFAULT_LAYERS: LayerVisibility = {
  anatomy: true,
  neurons: true,
  connections: false,
  activity: true,
  labels: false,
  axes: false,
};

const DEFAULT_FILTERS: ConnectionFilters = {
  minSynapses: 40,
  maxSynapses: Infinity,
  showExcitatory: true,
  showInhibitory: true,
  density: 0.35,
  activeOnly: false,
};

const DEFAULT_CONFIG: SimulationConfig = {
  durationMs: 300,
  trials: 1,
  inputRateHz: 200,
  inputNeurons: [],
  silencedNeurons: [],
  probeNeurons: [],
  backend: 'pytorch',
  seed: 1,
};

const prefersReducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export const useStore = create<AppState>((set, get) => ({
  // --- bootstrap ---
  entered: false,
  loadSteps: [],
  loadError: null,
  connectome: null,
  model: null,
  backends: [],
  experiments: [],
  serviceError: null,

  enter: () => set({ entered: true }),

  bootstrap: async () => {
    set({ loadError: null, serviceError: null });

    // The connectome files are static and must load for the app to mean
    // anything; the API is queried in parallel but is allowed to fail, because
    // browsing the measured wiring does not require the simulator to be up.
    const connectomePromise = loadConnectome((steps) => set({ loadSteps: steps }));

    const servicePromise = Promise.all([
      api.getModel(),
      api.getBackends(),
      api.getExperiments(),
    ]);

    try {
      const connectome = await connectomePromise;
      set({ connectome });
    } catch (error) {
      set({ loadError: error instanceof Error ? error.message : String(error) });
      return;
    }

    try {
      const [model, backends, experiments] = await servicePromise;
      const available = backends.backends.find((b) => b.available);
      set({
        model,
        backends: backends.backends,
        experiments: experiments.experiments,
        config: {
          ...get().config,
          backend: (available?.key ?? backends.default) as SimulationConfig['backend'],
        },
      });
      // Preload the repository's own published experiment so the first run is
      // one click, and it is a real published stimulus rather than an invention.
      const sugar = experiments.experiments.find((e) => e.key === 'sugar');
      if (sugar) get().applyExperiment(sugar.key);
    } catch (error) {
      set({
        serviceError:
          error instanceof ApiError
            ? error.message
            : `Simulation service unavailable: ${String(error)}`,
      });
    }
  },

  // --- view ---
  viewMode: 'anatomy',
  layers: DEFAULT_LAYERS,
  filters: DEFAULT_FILTERS,
  xray: 0,
  debug: false,
  reducedMotion: Boolean(prefersReducedMotion),

  setViewMode: (mode) => {
    const layers = { ...get().layers };
    // Each mode is a preset over the layer stack rather than a separate scene,
    // so the fly never disappears and rebuilds -- it is one object throughout.
    switch (mode) {
      case 'anatomy':
        layers.neurons = false;
        layers.connections = false;
        layers.activity = false;
        set({ xray: 0 });
        break;
      case 'xray':
        layers.neurons = true;
        layers.connections = false;
        layers.activity = true;
        set({ xray: 0.85 });
        break;
      case 'connections':
        layers.neurons = true;
        layers.connections = true;
        layers.activity = false;
        set({ xray: 0.92 });
        break;
      case 'active':
        layers.neurons = true;
        layers.connections = false;
        layers.activity = true;
        set({ xray: 0.92 });
        break;
      case 'propagation':
        layers.neurons = true;
        layers.connections = true;
        layers.activity = true;
        set({ xray: 0.95 });
        break;
      case 'local':
      case 'pathway':
        layers.neurons = true;
        layers.connections = true;
        layers.activity = true;
        set({ xray: 0.95 });
        break;
    }
    set({ viewMode: mode, layers });
    if (mode !== 'anatomy' && get().cameraRequest === null) {
      set({ cameraRequest: 'brain' });
    }
  },

  toggleLayer: (key) =>
    set((s) => ({ layers: { ...s.layers, [key]: !s.layers[key] } })),

  setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),

  setXray: (value) => set({ xray: Math.max(0, Math.min(1, value)) }),

  toggleDebug: () => set((s) => ({ debug: !s.debug })),

  // --- camera ---
  cameraRequest: null,
  requestCamera: (poseKey) => set({ cameraRequest: poseKey }),
  consumeCamera: () => set({ cameraRequest: null }),

  // --- selection ---
  selectedNeuron: null,
  neuronRecord: null,
  localNetwork: null,
  selectedModule: null,
  selectedPart: null,
  hoveredNeuron: null,
  inspectorError: null,

  selectNeuron: async (index, focus = false) => {
    if (index === null) {
      set({ selectedNeuron: null, neuronRecord: null, localNetwork: null });
      return;
    }
    set({
      selectedNeuron: index,
      neuronRecord: null,
      localNetwork: null,
      inspectorError: null,
      selectedPart: null,
    });
    if (focus) set({ cameraRequest: 'selection' });

    try {
      const [record, local] = await Promise.all([
        api.getNeuron(index),
        api.getLocalNetwork(index, 1, 18, get().filters.minSynapses),
      ]);
      // a later click may have landed while these were in flight
      if (get().selectedNeuron !== index) return;
      set({ neuronRecord: record, localNetwork: local });
    } catch (error) {
      if (get().selectedNeuron !== index) return;
      set({
        inspectorError:
          error instanceof ApiError
            ? error.message
            : `Could not load neuron #${index}: ${String(error)}`,
      });
    }
  },

  selectModule: (id) => set({ selectedModule: id, selectedPart: null }),
  selectPart: (key) => set({ selectedPart: key, selectedModule: null }),
  setHovered: (index) => set({ hoveredNeuron: index }),

  // --- search ---
  searchQuery: '',
  searchResults: [],
  searching: false,

  setSearchQuery: (q) => set({ searchQuery: q }),

  runSearch: async (q) => {
    if (!q.trim()) {
      set({ searchResults: [], searching: false });
      return;
    }
    set({ searching: true });
    try {
      const { results } = await api.searchNeurons(q);
      if (get().searchQuery === q) set({ searchResults: results, searching: false });
    } catch {
      set({ searchResults: [], searching: false });
    }
  },

  // --- pathway ---
  pathSource: null,
  pathTarget: null,
  pathResult: null,
  pathBusy: false,

  setPathEndpoint: (which, index) =>
    set(which === 'source' ? { pathSource: index } : { pathTarget: index }),

  findPath: async () => {
    const { pathSource, pathTarget, filters } = get();
    if (pathSource === null || pathTarget === null) return;
    set({ pathBusy: true, pathResult: null });
    try {
      const result = await api.findPath(pathSource, pathTarget, filters.minSynapses);
      set({ pathResult: result, pathBusy: false });
    } catch (error) {
      set({
        pathBusy: false,
        pathResult: {
          found: false,
          reason:
            error instanceof ApiError ? error.message : `Path search failed: ${String(error)}`,
          provenance: 'measured',
        },
      });
    }
  },

  clearPath: () => set({ pathSource: null, pathTarget: null, pathResult: null }),

  // --- simulation ---
  config: DEFAULT_CONFIG,
  simState: 'IDLE',
  simStage: '',
  simProgress: 0,
  simSpikesSoFar: 0,
  simElapsed: 0,
  simError: null,
  simErrorDetail: null,
  summary: null,
  spikes: null,
  spikeIndex: null,
  activation: null,
  traces: null,
  activeSubnetwork: null,
  rateScope: { kind: 'brain' },

  setConfig: (patch) => set((s) => ({ config: { ...s.config, ...patch } })),

  applyExperiment: (key) => {
    const exp = get().experiments.find((e) => e.key === key);
    if (!exp) return;
    set((s) => ({
      config: {
        ...s.config,
        inputNeurons: exp.inputNeurons,
        inputRateHz: exp.stimRateHz,
      },
    }));
  },

  runSimulation: async () => {
    const { config } = get();
    set({
      simState: 'QUEUED',
      simStage: 'Submitting',
      simProgress: 0,
      simSpikesSoFar: 0,
      simElapsed: 0,
      simError: null,
      simErrorDetail: null,
      summary: null,
      spikes: null,
      spikeIndex: null,
      activation: null,
      traces: null,
      activeSubnetwork: null,
    });
    clock.reset();

    try {
      const submitted = await api.runSimulation(config);
      const final = await api.pollSimulation(submitted.simulationId, (status) => {
        set({
          simState: status.state,
          simStage: status.stage,
          simProgress: status.progress,
          simSpikesSoFar: status.spikesSoFar,
          simElapsed: status.elapsedSeconds,
        });
      });

      if (final.state === 'ERROR') {
        set({
          simState: 'ERROR',
          simError: final.error ?? 'The simulation failed without a message.',
          simErrorDetail: final.errorDetail ?? null,
        });
        return;
      }
      if (final.state === 'CANCELLED') {
        set({ simState: 'CANCELLED', simStage: 'Cancelled' });
        return;
      }

      const summary = final.result;
      if (!summary) {
        set({
          simState: 'ERROR',
          simError: 'The run completed but returned no result payload.',
        });
        return;
      }

      set({ simState: 'PROCESSING', simStage: 'Downloading spikes' });
      const spikes = await api.fetchSpikes(summary.spikeEncoding.url);
      const connectome = get().connectome;
      const index = buildSpikeIndex(
        spikes,
        connectome?.neuronCount ?? summary.inputNeurons.length,
        summary.durationMs,
        summary.trials,
      );

      let traces: TraceResponse | null = null;
      if (summary.probeNeurons.length > 0) {
        try {
          traces = await api.getTraces(summary.simulationId);
        } catch {
          traces = null; // the run is still valid without membrane traces
        }
      }

      // Fetch the real wiring among the neurons that fired, so the
      // propagation animation follows measured synapses rather than
      // invented lines. A failure here costs the animation, not the result.
      let activeSubnetwork: Subnetwork | null = null;
      if (index.activeNeurons.length > 1) {
        try {
          set({ simStage: 'Resolving active subnetwork' });
          activeSubnetwork = await api.getSubnetwork(
            Array.from(index.activeNeurons.slice(0, 6000)),
          );
        } catch {
          activeSubnetwork = null;
        }
      }

      clock.setDuration(summary.durationMs);
      set({
        simState: 'COMPLETE',
        simStage: 'Complete',
        simProgress: 1,
        summary,
        spikes,
        spikeIndex: index,
        activation: new ActivationField(index),
        traces,
        activeSubnetwork,
      });

      // The whole point of the run is to see it, so reveal the brain and start
      // playing rather than leaving the result sitting behind a button.
      get().setViewMode('propagation');
      if (!get().reducedMotion) clock.play();
    } catch (error) {
      set({
        simState: 'ERROR',
        simError:
          error instanceof ApiError ? error.message : `Simulation failed: ${String(error)}`,
        simErrorDetail: error instanceof Error ? (error.stack ?? null) : null,
      });
    }
  },

  cancelSimulation: async () => {
    const id = get().summary?.simulationId;
    if (id) {
      try {
        await api.cancelSimulation(id);
      } catch {
        /* already finished */
      }
    }
    set({ simState: 'CANCELLED', simStage: 'Cancelled' });
  },

  clearSimulation: () => {
    clock.reset();
    set({
      simState: 'IDLE',
      simStage: '',
      simProgress: 0,
      simSpikesSoFar: 0,
      simError: null,
      simErrorDetail: null,
      summary: null,
      spikes: null,
      spikeIndex: null,
      activation: null,
      traces: null,
      activeSubnetwork: null,
    });
  },

  setRateScope: (scope) => set({ rateScope: scope }),
}));
