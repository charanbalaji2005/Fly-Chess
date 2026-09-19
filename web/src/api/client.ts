/**
 * Typed client for the Python simulation service.
 *
 * Failures surface as ApiError with the server's own message attached. Nothing
 * here substitutes a placeholder result when a request fails: a simulation that
 * did not run must not look like one that returned zero spikes.
 */

import type {
  BackendInfo,
  ExperimentPreset,
  LocalNetwork,
  ModelInfo,
  NeuronRecord,
  PartnerResponse,
  PathResult,
  SearchHit,
  SimulationConfig,
  SimulationStatus,
  SpikeTrain,
  Subnetwork,
  TraceResponse,
} from '../types';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly detail?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const BASE = import.meta.env.VITE_API_BASE ?? '';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
  } catch (cause) {
    throw new ApiError(
      `Cannot reach the simulation service at ${BASE || window.location.origin}. ` +
        `Start it with: uvicorn server.app:app --port 8000`,
      0,
      cause,
    );
  }

  if (!response.ok) {
    let detail: unknown;
    let message = `${response.status} ${response.statusText}`;
    try {
      const body = await response.json();
      detail = body?.detail ?? body;
      if (typeof detail === 'string') message = detail;
      else if (detail && typeof detail === 'object') {
        const d = detail as { message?: string; errors?: string[]; detail?: string };
        message = d.message ?? d.detail ?? message;
        if (d.errors?.length) message += `: ${d.errors.join('; ')}`;
      }
    } catch {
      /* body was not JSON; the status line is all we have */
    }
    throw new ApiError(message, response.status, detail);
  }

  return response.json() as Promise<T>;
}

// --- metadata -------------------------------------------------------------

export const getHealth = () =>
  request<{
    status: string;
    neuronCount: number;
    connectionCount: number;
    connectomeLoadSeconds: number;
  }>('/api/health');

export const getModel = () => request<ModelInfo>('/api/model');

export const getBackends = () =>
  request<{ backends: BackendInfo[]; default: string; environment: Record<string, string> }>(
    '/api/backends',
  );

export const getExperiments = () =>
  request<{ experiments: ExperimentPreset[] }>('/api/experiments');

// --- connectome -----------------------------------------------------------

export const getNeuron = (index: number) =>
  request<NeuronRecord>(`/api/neuron/${index}`);

export const getPartners = (
  index: number,
  direction: 'in' | 'out',
  limit = 100,
  minSynapses = 0,
) =>
  request<PartnerResponse>(
    `/api/neuron/${index}/partners?direction=${direction}&limit=${limit}` +
      `&minSynapses=${minSynapses}`,
  );

export const getLocalNetwork = (
  index: number,
  depth = 1,
  fanout = 24,
  minSynapses = 0,
) =>
  request<LocalNetwork>(
    `/api/neuron/${index}/local?depth=${depth}&fanout=${fanout}` +
      `&minSynapses=${minSynapses}`,
  );

export const findPath = (
  source: number,
  target: number,
  minSynapses = 0,
  maxHops = 8,
) =>
  request<PathResult>(
    `/api/path?source=${source}&target=${target}&minSynapses=${minSynapses}` +
      `&maxHops=${maxHops}`,
  );

/**
 * Measured connections among a set of neurons.
 *
 * Posted rather than queried because the neuron list after a run is a few
 * hundred entries long and would not survive a URL.
 */
export const getSubnetwork = (
  neurons: number[],
  minSynapses = 0,
  limit = 120000,
) =>
  request<Subnetwork>('/api/subnetwork', {
    method: 'POST',
    body: JSON.stringify({ neurons, minSynapses, limit }),
  });

export const searchNeurons = (query: string, limit = 25) =>
  request<{ query: string; results: SearchHit[] }>(
    `/api/search?q=${encodeURIComponent(query)}&limit=${limit}`,
  );

// --- simulation -----------------------------------------------------------

export const runSimulation = (config: SimulationConfig) =>
  request<SimulationStatus>('/api/simulation/run', {
    method: 'POST',
    body: JSON.stringify(config),
  });

export const getSimulationStatus = (id: string) =>
  request<SimulationStatus>(`/api/simulation/${id}`);

export const cancelSimulation = (id: string) =>
  request<{ simulationId: string; state: string }>(`/api/simulation/${id}/cancel`, {
    method: 'POST',
  });

export const getTraces = (id: string) =>
  request<TraceResponse>(`/api/simulation/${id}/traces`);

/**
 * Fetch and decode the packed spike train.
 *
 * Layout is three contiguous blocks, not interleaved records: all neuron
 * indices, then all times, then all trial numbers. That keeps each block a
 * single typed-array view over the response buffer with no per-spike work,
 * and it is the order the raster and heatmap want to read them in anyway.
 */
export async function fetchSpikes(url: string): Promise<SpikeTrain> {
  const response = await fetch(`${BASE}${url}`);
  if (!response.ok) {
    throw new ApiError(
      `Could not download spike data (HTTP ${response.status})`,
      response.status,
    );
  }
  const buffer = await response.arrayBuffer();
  const count = Number(response.headers.get('X-Spike-Count') ?? 0);

  const expected = count * 10; // 4 + 4 + 2 bytes per spike
  if (buffer.byteLength !== expected) {
    throw new ApiError(
      `Spike payload is ${buffer.byteLength} bytes but ${count} spikes need ` +
        `${expected}. The response was truncated.`,
      0,
    );
  }

  return {
    count,
    neuronIndex: new Uint32Array(buffer, 0, count),
    timeMs: new Float32Array(buffer, count * 4, count),
    trial: new Uint16Array(buffer, count * 8, count),
  };
}

/**
 * Poll a running simulation to completion.
 *
 * The server reports progress per timestep, so a fixed interval is enough; no
 * backoff, because a run that takes 10 s should not be discovered 4 s late.
 */
export async function pollSimulation(
  id: string,
  onUpdate: (status: SimulationStatus) => void,
  options: { intervalMs?: number; signal?: AbortSignal } = {},
): Promise<SimulationStatus> {
  const interval = options.intervalMs ?? 400;
  for (;;) {
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const status = await getSimulationStatus(id);
    onUpdate(status);
    if (status.state === 'COMPLETE' || status.state === 'ERROR' || status.state === 'CANCELLED') {
      return status;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}
