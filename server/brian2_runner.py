"""
Brian2 reference backend.

Brian2 is the ground-truth implementation for this model: every other backend
in the repository is validated against it (see code/compare_ground_truth.py).
Rather than reimplementing it, this module calls the repository's own reference
network builder, code/paper-phil-drosophila/model.py, with parameters derived
from the interactive request.

NOT EXERCISED IN THIS ENVIRONMENT.  brian2 is absent from the interpreter this
was developed against, so backends.py reports it as unavailable and the API
refuses to dispatch to it.  The code path below is written against model.py's
documented signatures but has not been executed; treat it as untested until it
runs somewhere with brian2 installed (`conda env create -f environment.yml`).
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

import numpy as np

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "code" / "paper-phil-drosophila"))

PATH_COMP = REPO / "data" / "2025_Completeness_783.csv"
PATH_CON = REPO / "data" / "2025_Connectivity_783.parquet"


def available() -> bool:
    try:
        import brian2  # noqa: F401
        return True
    except ImportError:
        return False


def run(config, connectome, progress=None):
    """Run one configuration through the Brian2 reference model.

    Returns the same (spike arrays, timings) shape as the PyTorch engine so the
    API layer does not care which backend produced a result.
    """
    if not available():
        raise RuntimeError(
            "Brian2 is not installed in this environment. Create it with "
            "`conda env create -f environment.yml`.")

    from brian2 import Hz, ms
    import model as reference          # code/paper-phil-drosophila/model.py

    params = dict(reference.default_params)
    params["t_run"] = float(config.duration_ms) * ms
    params["n_run"] = int(config.trials)
    params["r_poi"] = float(config.input_rate_hz) * Hz

    if progress is not None:
        progress(0, config.trials, 0)

    neuron_arr: list[np.ndarray] = []
    time_arr: list[np.ndarray] = []
    trial_arr: list[np.ndarray] = []
    t0 = time.perf_counter()

    for trial in range(config.trials):
        # run_trial builds the network from the parquet/CSV each call, exactly
        # as the published experiments do
        spk_trn = reference.run_trial(
            list(config.input_neurons), [], list(config.silenced_neurons),
            str(PATH_COMP), str(PATH_CON), params)
        for neuron_index, times in spk_trn.items():
            t_ms = np.asarray([float(t) for t in times], dtype=np.float32) * 1000.0
            neuron_arr.append(np.full(len(t_ms), neuron_index, dtype=np.uint32))
            time_arr.append(t_ms)
            trial_arr.append(np.full(len(t_ms), trial, dtype=np.uint16))
        if progress is not None:
            progress(trial + 1, config.trials, sum(len(a) for a in neuron_arr))

    elapsed = time.perf_counter() - t0
    empty_u32 = np.zeros(0, dtype=np.uint32)
    return {
        "spike_neuron": np.concatenate(neuron_arr) if neuron_arr else empty_u32,
        "spike_time_ms": (np.concatenate(time_arr) if time_arr
                          else np.zeros(0, dtype=np.float32)),
        "spike_trial": (np.concatenate(trial_arr) if trial_arr
                        else np.zeros(0, dtype=np.uint16)),
        "timings": {
            "simulationSeconds": round(elapsed, 3),
            "realtimeRatio": round(
                (config.duration_ms / 1000.0 * config.trials)
                / max(elapsed, 1e-9), 4),
        },
        # Brian2's SpikeMonitor records spike times only; the reference model
        # attaches no StateMonitor, so there is no membrane trace to return.
        "probe_supported": False,
    }
