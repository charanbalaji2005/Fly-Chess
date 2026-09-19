/**
 * Loads the preprocessed connectome into typed arrays.
 *
 * The artefacts in public/data are raw little-endian binaries rather than
 * JSON. 138,639 neurons with positions, degrees, weights, polarity, module ids
 * and flags is ~4 MB packed; the same content as JSON would be ~40 MB and
 * would have to be parsed into boxed numbers before it could reach the GPU.
 * Every array here can be uploaded to a buffer attribute as-is.
 *
 * Run `python preprocess/build_layout.py` to regenerate them.
 */

import type {
  AnatomyScaffold,
  CellTypeSet,
  ConnectomeData,
  ConnectomeMeta,
  EdgeData,
  ModuleSet,
} from '../types';

export interface LoadStep {
  key: string;
  label: string;
  state: 'pending' | 'active' | 'done' | 'error';
  detail?: string;
}

export type LoadProgress = (steps: LoadStep[]) => void;

const STEPS: { key: string; label: string }[] = [
  { key: 'meta', label: 'Reading dataset manifest' },
  { key: 'neurons', label: 'Loading neuron records' },
  { key: 'connectivity', label: 'Loading connectivity' },
  { key: 'annotations', label: 'Loading modules and cell types' },
  { key: 'gpu', label: 'Preparing GPU buffers' },
];

class LoadError extends Error {
  constructor(public readonly file: string, cause: unknown) {
    super(
      `Could not load ${file}. Run "python preprocess/build_layout.py" to ` +
        `generate the connectome artefacts. (${String(cause)})`,
    );
    this.name = 'LoadError';
  }
}

async function fetchBuffer(path: string): Promise<ArrayBuffer> {
  let response: Response;
  try {
    response = await fetch(path);
  } catch (cause) {
    throw new LoadError(path, cause);
  }
  if (!response.ok) throw new LoadError(path, `HTTP ${response.status}`);
  return response.arrayBuffer();
}

async function fetchJson<T>(path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path);
  } catch (cause) {
    throw new LoadError(path, cause);
  }
  if (!response.ok) throw new LoadError(path, `HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

/**
 * The exported binaries are little-endian, which is the byte order of every
 * platform this runs on, so the typed-array views are zero-copy.
 */
function assertLittleEndian(): void {
  const probe = new Uint8Array(new Uint16Array([1]).buffer);
  if (probe[0] !== 1) {
    throw new Error(
      'This machine is big-endian; the connectome binaries are little-endian ' +
        'and would be read as garbage. Regenerate them with a byte-swap.',
    );
  }
}

export async function loadConnectome(
  onProgress: LoadProgress,
  base = '/data',
): Promise<ConnectomeData> {
  assertLittleEndian();

  const steps: LoadStep[] = STEPS.map((s) => ({ ...s, state: 'pending' }));
  const emit = () => onProgress(steps.map((s) => ({ ...s })));
  const begin = (key: string) => {
    const step = steps.find((s) => s.key === key);
    if (step) step.state = 'active';
    emit();
  };
  const finish = (key: string, detail?: string) => {
    const step = steps.find((s) => s.key === key);
    if (step) {
      step.state = 'done';
      step.detail = detail;
    }
    emit();
  };
  const fail = (key: string, detail: string) => {
    const step = steps.find((s) => s.key === key);
    if (step) {
      step.state = 'error';
      step.detail = detail;
    }
    emit();
  };

  emit();
  try {
    begin('meta');
    const meta = await fetchJson<ConnectomeMeta>(`${base}/meta.json`);
    const n = meta.neuronCount;
    finish('meta', `${n.toLocaleString()} neurons`);

    begin('neurons');
    const [idsBuf, posBuf, degBuf, wtBuf, polBuf, modBuf, flagBuf] =
      await Promise.all([
        fetchBuffer(`${base}/flywire_ids.bin`),
        fetchBuffer(`${base}/positions.bin`),
        fetchBuffer(`${base}/degrees.bin`),
        fetchBuffer(`${base}/weights.bin`),
        fetchBuffer(`${base}/polarity.bin`),
        fetchBuffer(`${base}/modules.bin`),
        fetchBuffer(`${base}/flags.bin`),
      ]);

    const flywireIds = new BigInt64Array(idsBuf);
    const positions = new Float32Array(posBuf);
    if (flywireIds.length !== n || positions.length !== n * 3) {
      throw new Error(
        `Artefacts are inconsistent with meta.json (${flywireIds.length} ids, ` +
          `${positions.length / 3} positions, expected ${n}). Re-run the ` +
          `preprocessing step.`,
      );
    }
    finish('neurons', `${n.toLocaleString()} records`);

    begin('connectivity');
    const edgeBuf = await fetchBuffer(`${base}/edges.bin`);
    const edgeCount = meta.exportedEdgeCount;
    const edges: EdgeData = {
      count: edgeCount,
      pairs: new Uint32Array(edgeBuf, 0, edgeCount * 2),
      weights: new Float32Array(edgeBuf, edgeCount * 8, edgeCount),
    };
    finish(
      'connectivity',
      `${edgeCount.toLocaleString()} of ${meta.connectionCount.toLocaleString()}`,
    );

    begin('annotations');
    const [anatomy, modules, cellTypes] = await Promise.all([
      fetchJson<AnatomyScaffold>(`${base}/anatomy.json`),
      fetchJson<ModuleSet>(`${base}/modules.json`),
      fetchJson<CellTypeSet>(`${base}/celltypes.json`),
    ]);
    finish(
      'annotations',
      `${modules.modules.length} modules, ${cellTypes.cellTypes.length} cell types`,
    );

    begin('gpu');
    const data: ConnectomeData = {
      neuronCount: n,
      flywireIds,
      positions,
      degrees: new Uint32Array(degBuf),
      synapseWeights: new Float32Array(wtBuf),
      polarity: new Float32Array(polBuf),
      moduleIds: new Uint8Array(modBuf),
      flags: new Uint8Array(flagBuf),
      edges,
      meta,
      anatomy,
      modules,
      cellTypes,
    };
    finish('gpu', 'buffers ready');
    return data;
  } catch (error) {
    const active = steps.find((s) => s.state === 'active');
    fail(active?.key ?? 'meta', error instanceof Error ? error.message : String(error));
    throw error;
  }
}

// --- per-neuron accessors -------------------------------------------------
// The connectome is stored column-wise, so these exist to keep call sites from
// open-coding stride arithmetic.

export const neuronPosition = (c: ConnectomeData, i: number): [number, number, number] => [
  c.positions[i * 3],
  c.positions[i * 3 + 1],
  c.positions[i * 3 + 2],
];

export const inDegree = (c: ConnectomeData, i: number) => c.degrees[i * 2];
export const outDegree = (c: ConnectomeData, i: number) => c.degrees[i * 2 + 1];
export const inSynapses = (c: ConnectomeData, i: number) => c.synapseWeights[i * 2];
export const outSynapses = (c: ConnectomeData, i: number) => c.synapseWeights[i * 2 + 1];
export const isCompleted = (c: ConnectomeData, i: number) => (c.flags[i] & 1) !== 0;
export const isNamedCellType = (c: ConnectomeData, i: number) => (c.flags[i] & 2) !== 0;
export const flywireIdOf = (c: ConnectomeData, i: number) => c.flywireIds[i].toString();

/** Index lookup for cell-type names, built once on demand. */
export function buildCellTypeIndex(c: ConnectomeData): Map<number, string> {
  const map = new Map<number, string>();
  for (const type of c.cellTypes.cellTypes) {
    for (const i of type.neuronIndices) map.set(i, type.name);
  }
  return map;
}
