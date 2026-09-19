"""
Proves that server/simulation.py reproduces code/run_pytorch.py exactly.

The interactive engine replaces two things in the repository implementation:
the dense `spikes @ W.T` product becomes an event-driven gather/scatter, and
the rolled delay buffer becomes a ring buffer.  Both are meant to be algebraic
identities.  This script checks that claim rather than assuming it, by running
the repository's own TorchModel and the server engine side by side on the same
random network and comparing the resulting spike trains element for element.

To keep the comparison deterministic the Poisson rate is set so that
rate * dt / 1000 == 1, i.e. every stimulated neuron receives input on every
timestep in both implementations, removing RNG divergence while still
exercising the delay line, refractory logic, alpha synapse, recurrence,
threshold and reset.

    python server/test_equivalence.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import torch

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "code"))
sys.path.insert(0, str(REPO / "server"))

from run_pytorch import DT, MODEL_PARAMS, TorchModel  # noqa: E402
from simulation import BrainSimulation, SimulationConfig  # noqa: E402


class FakeConnectome:
    """Minimal stand-in exposing the interface BrainSimulation needs."""

    def __init__(self, indptr, indices, signed, n):
        self._csr = (indptr, indices, signed)
        self.neuron_count = n

    def out_csr_arrays(self):
        return self._csr


def random_network(n, density, seed, inhibitory_fraction=0.3):
    """Random signed connectome fragment, in the same units as the real data.

    Weights are synapse counts with a sign, exactly like the dataset column
    'Excitatory x Connectivity'.
    """
    rng = np.random.default_rng(seed)
    n_edges = int(n * n * density)
    pre = rng.integers(0, n, n_edges)
    post = rng.integers(0, n, n_edges)
    keep = pre != post
    pre, post = pre[keep], post[keep]
    key = pre.astype(np.int64) * n + post
    _, first = np.unique(key, return_index=True)
    pre, post = pre[first], post[first]

    syn = rng.integers(1, 30, len(pre)).astype(np.float32)
    sign = np.where(rng.random(len(pre)) < inhibitory_fraction, -1.0, 1.0)
    signed = (syn * sign).astype(np.float32)

    order = np.lexsort((-syn, pre))
    pre, post, signed = pre[order], post[order], signed[order]
    indptr = np.zeros(n + 1, dtype=np.int64)
    np.cumsum(np.bincount(pre, minlength=n), out=indptr[1:])
    return indptr, post.astype(np.int32), signed


def run_reference(indptr, indices, signed, n, steps, inputs, rate_hz, trials):
    """Run code/run_pytorch.py's TorchModel unmodified."""
    dense = torch.zeros(n, n)
    for j in range(n):
        lo, hi = int(indptr[j]), int(indptr[j + 1])
        dense[torch.from_numpy(indices[lo:hi].astype(np.int64)), j] = \
            torch.from_numpy(signed[lo:hi])

    model = TorchModel(trials, n, DT, MODEL_PARAMS, dense,
                       exc_indices=inputs, device="cpu")
    conductance, delay_buffer, spikes, v, refrac = model.state_init()

    rates = torch.zeros(trials, n)
    rates[:, inputs] = rate_hz

    fired = []
    with torch.no_grad():
        for step in range(steps):
            conductance, delay_buffer, spikes, v, refrac = model(
                rates, conductance, delay_buffer, spikes, v, refrac)
            if spikes.any():
                tr, nid = (spikes > 0).nonzero(as_tuple=True)
                for t, i in zip(tr.tolist(), nid.tolist()):
                    fired.append((step, t, i))
    return fired, v


def run_engine(indptr, indices, signed, n, steps, inputs, rate_hz, trials):
    """Run the interactive server engine."""
    conn = FakeConnectome(indptr, indices, signed, n)
    cfg = SimulationConfig(
        duration_ms=steps * DT, trials=trials, input_rate_hz=rate_hz,
        input_neurons=list(inputs), seed=0)
    result = BrainSimulation(conn, cfg).run()
    return sorted(zip((result.spike_time_ms / DT).round().astype(int).tolist(),
                      result.spike_trial.tolist(),
                      result.spike_neuron.tolist()))


def main() -> int:
    # rate chosen so rate * dt / 1000 == 1 -> stimulus fires every step in both
    rate_hz = 1000.0 / DT
    failures = 0

    for case, (n, density, trials, steps, seed) in enumerate([
        (300, 0.010, 1, 250, 1),
        (300, 0.010, 3, 150, 2),
        (600, 0.004, 1, 200, 3),
    ], start=1):
        indptr, indices, signed = random_network(n, density, seed)
        inputs = list(range(0, n, max(1, n // 8)))[:8]

        ref, _ = run_reference(indptr, indices, signed, n, steps, inputs,
                               rate_hz, trials)
        ref = sorted(ref)
        got = run_engine(indptr, indices, signed, n, steps, inputs,
                         rate_hz, trials)

        ok = ref == got
        failures += 0 if ok else 1
        print("case {}: n={} trials={} steps={} edges={}".format(
            case, n, trials, steps, len(indices)))
        print("   reference spikes {:>7}   engine spikes {:>7}   {}".format(
            len(ref), len(got), "IDENTICAL" if ok else "*** MISMATCH ***"))
        if not ok:
            only_ref = sorted(set(ref) - set(got))[:5]
            only_got = sorted(set(got) - set(ref))[:5]
            print("   first in reference only:", only_ref)
            print("   first in engine only:   ", only_got)

    if failures:
        print("\nFAILED: {} case(s) diverged from the repository model".format(
            failures))
        return 1
    print("\nPASS: the interactive engine reproduces code/run_pytorch.py "
          "spike-for-spike.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
