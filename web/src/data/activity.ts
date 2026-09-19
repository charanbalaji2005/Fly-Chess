/**
 * Turns a spike train into the structures the views need.
 *
 * A single run can produce hundreds of thousands of spikes, and the 3D scene,
 * the raster, the rate plot, the heatmap and the module bars all want to ask
 * different questions of the same data at 60 fps. So the train is indexed once,
 * on arrival, into:
 *
 *   - per-neuron spike counts        -> rates, "most active" lists, heatmap rows
 *   - a time-bin offset table        -> O(1) "which spikes fall in this window"
 *   - per-bin population counts      -> the rate plot and the timeline gutter
 *
 * The spike arrays arrive already sorted by time (the server records them step
 * by step), which is what makes the offset table a single linear pass.
 */

import type { ConnectomeData, RegionActivity, SpikeTrain } from '../types';

export const BIN_MS = 1;

export interface SpikeIndex {
  spikes: SpikeTrain;
  neuronCount: number;
  durationMs: number;
  trials: number;
  /** Total spikes per neuron, summed over trials. */
  countsByNeuron: Uint32Array;
  /** Neuron indices that fired at least once, descending by count. */
  activeNeurons: Uint32Array;
  binCount: number;
  /** Index into the spike arrays where each time bin starts; length binCount+1. */
  binStart: Uint32Array;
  /** Spikes per time bin, summed over trials. */
  binCounts: Uint32Array;
  /** Highest population rate in any single bin, in Hz. */
  peakPopulationRateHz: number;
}

export function buildSpikeIndex(
  spikes: SpikeTrain,
  neuronCount: number,
  durationMs: number,
  trials: number,
): SpikeIndex {
  const binCount = Math.max(1, Math.ceil(durationMs / BIN_MS));
  const countsByNeuron = new Uint32Array(neuronCount);
  const binCounts = new Uint32Array(binCount);
  const binStart = new Uint32Array(binCount + 1);

  for (let i = 0; i < spikes.count; i++) {
    countsByNeuron[spikes.neuronIndex[i]]++;
    const bin = Math.min(binCount - 1, (spikes.timeMs[i] / BIN_MS) | 0);
    binCounts[bin]++;
  }

  // prefix sum over bins. Valid because the spike arrays are time-ordered, so
  // every spike in bin b sits between the last of bin b-1 and the first of b+1.
  let running = 0;
  for (let b = 0; b < binCount; b++) {
    binStart[b] = running;
    running += binCounts[b];
  }
  binStart[binCount] = running;

  const active: number[] = [];
  for (let i = 0; i < neuronCount; i++) if (countsByNeuron[i] > 0) active.push(i);
  active.sort((a, b) => countsByNeuron[b] - countsByNeuron[a]);

  let peakBin = 0;
  for (let b = 0; b < binCount; b++) if (binCounts[b] > peakBin) peakBin = binCounts[b];

  return {
    spikes,
    neuronCount,
    durationMs,
    trials,
    countsByNeuron,
    activeNeurons: Uint32Array.from(active),
    binCount,
    binStart,
    binCounts,
    peakPopulationRateHz: (peakBin * 1000) / (BIN_MS * Math.max(trials, 1)),
  };
}

/** Half-open range of spike array positions covering [fromMs, toMs). */
export function spikeRange(index: SpikeIndex, fromMs: number, toMs: number): [number, number] {
  if (toMs <= fromMs) return [0, 0];
  const lo = Math.max(0, Math.min(index.binCount, Math.floor(fromMs / BIN_MS)));
  const hi = Math.max(0, Math.min(index.binCount, Math.ceil(toMs / BIN_MS)));
  return [index.binStart[lo], index.binStart[hi]];
}

/**
 * Per-neuron activation for the 3D view.
 *
 * Each spike sets its neuron's level to 1, and levels decay exponentially so a
 * neuron that just fired reads brighter than one that fired 30 ms ago. Playing
 * forward only applies the new spikes since the last frame; scrubbing backwards
 * cannot be done incrementally, so the field is rebuilt from a window before
 * the target time. `tauMs` is a display constant, not a model parameter -- it
 * controls how long a spike stays visible, nothing about the dynamics.
 */
export class ActivationField {
  readonly level: Float32Array;
  /** Time of each neuron's most recent spike, or -1. Drives the SPIKING state. */
  readonly lastSpikeMs: Float32Array;
  private cursor = 0;
  private timeMs = 0;

  constructor(
    private readonly index: SpikeIndex,
    readonly tauMs = 60,
  ) {
    this.level = new Float32Array(index.neuronCount);
    this.lastSpikeMs = new Float32Array(index.neuronCount).fill(-1);
  }

  get currentTimeMs(): number {
    return this.timeMs;
  }

  /** Advance or jump to `targetMs`, updating levels. */
  seek(targetMs: number): void {
    if (targetMs < this.timeMs) this.rebuild(targetMs);
    else this.advance(targetMs);
    this.timeMs = targetMs;
  }

  private advance(targetMs: number): void {
    const dt = targetMs - this.timeMs;
    if (dt > 0) {
      const decay = Math.exp(-dt / this.tauMs);
      // A neuron below this contributes less than a quarter of an 8-bit level,
      // so clamping to zero costs nothing visually and keeps the array sparse.
      const floor = 0.002;
      const level = this.level;
      for (let i = 0; i < level.length; i++) {
        const v = level[i];
        if (v > 0) level[i] = v > floor ? v * decay : 0;
      }
    }

    const { spikes } = this.index;
    while (this.cursor < spikes.count && spikes.timeMs[this.cursor] <= targetMs) {
      const n = spikes.neuronIndex[this.cursor];
      this.level[n] = 1;
      this.lastSpikeMs[n] = spikes.timeMs[this.cursor];
      this.cursor++;
    }
  }

  private rebuild(targetMs: number): void {
    this.level.fill(0);
    this.lastSpikeMs.fill(-1);
    // five time constants is where exp(-t/tau) falls under 1%
    const windowStart = Math.max(0, targetMs - this.tauMs * 5);
    const [from, to] = spikeRange(this.index, windowStart, targetMs);
    const { spikes } = this.index;
    for (let i = from; i < to; i++) {
      if (spikes.timeMs[i] > targetMs) break;
      const n = spikes.neuronIndex[i];
      this.level[n] = Math.exp(-(targetMs - spikes.timeMs[i]) / this.tauMs);
      this.lastSpikeMs[n] = spikes.timeMs[i];
    }
    this.cursor = to;
    while (this.cursor > 0 && spikes.timeMs[this.cursor - 1] > targetMs) this.cursor--;
  }

  reset(): void {
    this.level.fill(0);
    this.lastSpikeMs.fill(-1);
    this.cursor = 0;
    this.timeMs = 0;
  }
}

/** Population firing rate per time bin, in Hz. */
export function populationRateSeries(index: SpikeIndex): Float32Array {
  const out = new Float32Array(index.binCount);
  const scale = 1000 / (BIN_MS * Math.max(index.trials, 1));
  for (let b = 0; b < index.binCount; b++) out[b] = index.binCounts[b] * scale;
  return out;
}

/** Firing rate per time bin restricted to a set of neurons, in Hz. */
export function subsetRateSeries(index: SpikeIndex, members: Set<number>): Float32Array {
  const out = new Float32Array(index.binCount);
  const { spikes } = index;
  for (let i = 0; i < spikes.count; i++) {
    if (!members.has(spikes.neuronIndex[i])) continue;
    const bin = Math.min(index.binCount - 1, (spikes.timeMs[i] / BIN_MS) | 0);
    out[bin]++;
  }
  const scale = 1000 / (BIN_MS * Math.max(index.trials, 1));
  for (let b = 0; b < index.binCount; b++) out[b] *= scale;
  return out;
}

/**
 * Activity aggregated over the derived connectivity modules.
 *
 * These are graph communities, not neuropils -- the datasets carry no
 * anatomical region labels -- so the UI must present them as such.
 */
export function moduleActivity(
  index: SpikeIndex,
  connectome: ConnectomeData,
): RegionActivity[] {
  const count = connectome.modules.modules.length;
  const spikeTotals = new Float64Array(count);
  const activeSets: Set<number>[] = Array.from({ length: count }, () => new Set());

  for (let i = 0; i < index.neuronCount; i++) {
    const c = index.countsByNeuron[i];
    if (c === 0) continue;
    const m = connectome.moduleIds[i];
    spikeTotals[m] += c;
    activeSets[m].add(i);
  }

  const seconds = (index.durationMs / 1000) * Math.max(index.trials, 1);
  return connectome.modules.modules.map((mod) => {
    const activeNeurons = activeSets[mod.id].size;
    return {
      moduleId: mod.id,
      label: mod.label,
      neuronCount: mod.neuronCount,
      activeNeurons,
      spikeCount: spikeTotals[mod.id],
      // averaged over the module's ACTIVE neurons; averaging over all of them
      // would report ~0 Hz for every module and hide the differences
      meanRateHz: activeNeurons > 0 ? spikeTotals[mod.id] / activeNeurons / seconds : 0,
    };
  });
}

/**
 * Heatmap matrix: `rows` most active neurons x time bins, values in Hz.
 *
 * Sub-sampling to the most active neurons is the only honest way to fit 138,639
 * rows into a few hundred pixels; the alternative, averaging unrelated neurons
 * into a row, would invent values that no neuron actually had.
 */
export function activityMatrix(
  index: SpikeIndex,
  rows = 64,
  columns = 180,
): { neurons: Uint32Array; values: Float32Array; columns: number; maxHz: number } {
  const neurons = index.activeNeurons.slice(0, rows);
  const rowOf = new Map<number, number>();
  neurons.forEach((n, r) => rowOf.set(n, r));

  const values = new Float32Array(neurons.length * columns);
  const columnMs = index.durationMs / columns;
  const { spikes } = index;

  for (let i = 0; i < spikes.count; i++) {
    const r = rowOf.get(spikes.neuronIndex[i]);
    if (r === undefined) continue;
    const c = Math.min(columns - 1, (spikes.timeMs[i] / columnMs) | 0);
    values[r * columns + c]++;
  }

  const scale = 1000 / (columnMs * Math.max(index.trials, 1));
  let maxHz = 0;
  for (let i = 0; i < values.length; i++) {
    values[i] *= scale;
    if (values[i] > maxHz) maxHz = values[i];
  }
  return { neurons, values, columns, maxHz };
}

/** Per-neuron firing rate in Hz over the whole run. */
export function neuronRateHz(index: SpikeIndex, neuron: number): number {
  const seconds = (index.durationMs / 1000) * Math.max(index.trials, 1);
  return seconds > 0 ? index.countsByNeuron[neuron] / seconds : 0;
}

/** Spike times of one neuron, for the inspector's spike train. */
export function neuronSpikeTimes(index: SpikeIndex, neuron: number, trial?: number): number[] {
  const out: number[] = [];
  const { spikes } = index;
  for (let i = 0; i < spikes.count; i++) {
    if (spikes.neuronIndex[i] !== neuron) continue;
    if (trial !== undefined && spikes.trial[i] !== trial) continue;
    out.push(spikes.timeMs[i]);
  }
  return out;
}
