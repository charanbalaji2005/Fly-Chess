"""
Interactive simulation engine for the Drosophila brain model.

This is the repository's own model, not a reimplementation of it.  The neuron
and synapse parameters are imported live from code/run_pytorch.py, which in
turn mirrors the Brian2 reference in code/paper-phil-drosophila/model.py:

    leaky integrate-and-fire, alpha-function synapses, 1.8 ms axonal delay,
    2.2 ms refractory period, Poisson input scaled by f_poi = 250,
    dt = 0.1 ms, v_rest = v_reset = -52 mV, v_threshold = -45 mV

Two changes are made for interactive use.  Both are algebraic identities, not
approximations, and test_equivalence.py checks them bit-for-bit against the
repository implementation:

1. EVENT-DRIVEN PROPAGATION.  code/run_pytorch.py computes the recurrent input
   as `spikes @ W.T`, a dense-by-sparse product over all 138,639 neurons every
   timestep.  In practice only a handful of neurons spike in any 0.1 ms step
   (the sugar experiment drives ~450 neurons at ~25 Hz, i.e. ~1 spike/step), so
   we instead gather the outgoing rows of the spiking neurons only and scatter
   them into the target accumulator.  Same sum, ~10x less work.

2. RING-BUFFER AXONAL DELAY.  The reference rolls the entire (batch, 19,
   138639) delay buffer every step, copying ~10 MB per step.  A modular write
   pointer produces the identical read sequence with no copy at all.

Nothing about the dynamics, the parameters or the connectome is altered.
"""

from __future__ import annotations

import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import torch

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "code"))

# The scientific parameters come from the repository, so that editing the model
# there changes what this server simulates.
from run_pytorch import DT, MODEL_PARAMS  # noqa: E402

MAX_DURATION_MS = 5000.0
MAX_TRIALS = 8
MAX_SPIKES = 4_000_000
MAX_PROBES = 64


@dataclass
class SimulationConfig:
    duration_ms: float = 200.0
    trials: int = 1
    input_rate_hz: float = 200.0
    input_neurons: list[int] = field(default_factory=list)
    silenced_neurons: list[int] = field(default_factory=list)
    probe_neurons: list[int] = field(default_factory=list)
    backend: str = "pytorch"
    seed: int = 0

    def validate(self, neuron_count: int) -> list[str]:
        errors: list[str] = []
        if not (0 < self.duration_ms <= MAX_DURATION_MS):
            errors.append(
                "duration must be >0 and <= {:g} ms".format(MAX_DURATION_MS))
        if not (1 <= self.trials <= MAX_TRIALS):
            errors.append("trials must be between 1 and {}".format(MAX_TRIALS))
        if self.input_rate_hz < 0:
            errors.append("input rate must be >= 0 Hz")
        if not self.input_neurons:
            errors.append("at least one input neuron is required")
        for name, group in (("input", self.input_neurons),
                            ("silenced", self.silenced_neurons),
                            ("probe", self.probe_neurons)):
            bad = [i for i in group if not (0 <= i < neuron_count)]
            if bad:
                errors.append("{} neuron index out of range: {}".format(
                    name, bad[:5]))
        if len(self.probe_neurons) > MAX_PROBES:
            errors.append("at most {} probe neurons".format(MAX_PROBES))
        return errors


@dataclass
class SimulationResult:
    spike_neuron: np.ndarray        # uint32[S]
    spike_time_ms: np.ndarray       # float32[S]
    spike_trial: np.ndarray         # uint16[S]
    probe_indices: list[int]
    probe_voltage: np.ndarray       # float32[P, T] membrane potential, trial 0
    probe_times_ms: np.ndarray      # float32[T]
    steps: int
    truncated: bool
    timings: dict
    device: str


class BrainSimulation:
    """One configured run of the connectome model."""

    def __init__(self, connectome, config: SimulationConfig, device: str = "cpu"):
        self.c = connectome
        self.cfg = config
        self.device = torch.device(device)
        self.n = connectome.neuron_count
        self.cancelled = False

        indptr, indices, signed = connectome.out_csr_arrays()
        self.indptr = torch.from_numpy(np.ascontiguousarray(indptr)).to(self.device)
        self.indices = torch.from_numpy(
            np.ascontiguousarray(indices).astype(np.int64)).to(self.device)
        self.weights = torch.from_numpy(
            np.ascontiguousarray(signed).astype(np.float32)).to(self.device)

    # -- the model --------------------------------------------------------
    def _propagate(self, b: torch.Tensor, j: torch.Tensor,
                   out: torch.Tensor) -> torch.Tensor:
        """Recurrent input, identical to `spikes @ W.T` but event-driven.

        `b`/`j` are the trial and neuron indices of the spikes emitted on the
        previous step -- already computed by the caller, so no full-width scan
        happens here.  For each spiking neuron we take its slice of the
        outgoing CSR and scatter those weights onto its postsynaptic targets.
        """
        out.zero_()
        if j.numel() == 0:
            return out

        starts = self.indptr[j]
        counts = self.indptr[j + 1] - starts
        total = int(counts.sum())
        if total == 0:
            return out

        # expand each spiking neuron's CSR slice into a flat gather index
        offsets = torch.repeat_interleave(starts, counts)
        ramp = torch.arange(total, device=self.device) - torch.repeat_interleave(
            torch.cumsum(counts, 0) - counts, counts)
        flat = offsets + ramp

        targets = self.indices[flat]
        trial = torch.repeat_interleave(b, counts)
        out.view(-1).index_add_(0, trial * self.n + targets, self.weights[flat])
        return out

    def run(self, progress=None) -> SimulationResult:
        cfg = self.cfg
        p = MODEL_PARAMS
        n, b = self.n, cfg.trials
        steps = int(round(cfg.duration_ms / DT))
        dev = self.device

        gen = torch.Generator(device="cpu").manual_seed(cfg.seed)

        # --- state, matching run_pytorch.AlphaLIF.state_init -------------
        v = torch.full((b, n), p["v0"], device=dev)
        g = torch.zeros(b, n, device=dev)
        spikes = torch.zeros(b, n, device=dev)

        delay_slots = int(p["tDelay"] / DT) + 1
        delay_buf = torch.zeros(b, delay_slots, n, device=dev)
        ptr = 0

        base_refrac = int(round(p["tRefrac"] / DT))
        refrac_steps = torch.full((n,), base_refrac, dtype=torch.float32, device=dev)
        # Poisson-driven neurons have their refractory period removed, exactly
        # as model.py's poi() sets neu[i].rfc = 0 ms.
        input_idx = torch.tensor(sorted(set(cfg.input_neurons)), dtype=torch.long,
                                 device=dev)
        refrac_steps[input_idx] = 0
        refrac = refrac_steps.unsqueeze(0).repeat(b, 1).clone()

        silenced = torch.tensor(sorted(set(cfg.silenced_neurons)), dtype=torch.long,
                                device=dev) if cfg.silenced_neurons else None

        syn_factor = DT / p["tauSyn"]
        mem_factor = DT / p["tauMem"]
        poisson_prob = cfg.input_rate_hz * DT / 1000.0
        stim_amplitude = p["wScale"] * p["scalePoisson"]

        probes = sorted(set(cfg.probe_neurons))
        probe_idx = torch.tensor(probes, dtype=torch.long, device=dev) if probes else None
        probe_v = (torch.zeros(len(probes), steps, dtype=torch.float32)
                   if probes else torch.zeros(0, 0))

        rec_neuron: list[np.ndarray] = []
        rec_step: list[np.ndarray] = []
        rec_trial: list[np.ndarray] = []
        total_spikes = 0
        truncated = False

        # scratch buffers, reused every step so the loop allocates nothing
        recurrent = torch.zeros(b, n, device=dev)
        zero_refrac = torch.zeros(b, n, device=dev)
        v_stim = torch.zeros(b, n, device=dev)
        poisson_rates = torch.full((b, input_idx.numel()), poisson_prob)
        probe_buf = (torch.zeros(len(probes), steps, device=dev)
                     if probes else None)

        # spike indices carried over from the previous step; the model delays
        # every spike by tDelay anyway, so this is the drive for this step
        fired_trial = torch.zeros(0, dtype=torch.long, device=dev)
        fired_neuron = torch.zeros(0, dtype=torch.long, device=dev)

        t0 = time.perf_counter()
        report_every = max(1, steps // 100)

        with torch.no_grad():
            for step in range(steps):
                if self.cancelled:
                    raise RuntimeError("Simulation cancelled")

                # --- refractory bookkeeping (run_pytorch.AlphaLIF.forward) ---
                refrac = torch.where(spikes > 0, zero_refrac, refrac + 1)
                not_refractory = (refrac >= refrac_steps.unsqueeze(0)).float()

                # --- recurrent drive, delayed by tDelay ----------------------
                self._propagate(fired_trial, fired_neuron, recurrent)
                recurrent.mul_(p["wScale"])

                # alpha synapse: read then overwrite the ring slot, which is
                # exactly what roll(-1) + write-to-last does in the reference
                delayed = delay_buf[:, ptr, :]
                g_new = g * (1.0 - syn_factor) + delayed * not_refractory
                delay_buf[:, ptr, :] = recurrent
                ptr = (ptr + 1) % delay_slots

                # --- Poisson stimulus ---------------------------------------
                if poisson_prob > 0 and input_idx.numel() > 0:
                    draws = torch.bernoulli(poisson_rates, generator=gen).to(dev)
                    v_stim.zero_()
                    v_stim[:, input_idx] = draws * stim_amplitude
                    v = v + v_stim

                # --- LIF membrane update (run_pytorch.LIFNeuron.forward) -----
                # note: uses the PREVIOUS conductance, as the reference does
                v = v + mem_factor * (g - (v - p["vRest"]))
                spikes = (v > p["vThreshold"]).float()
                v = v - (v - p["vReset"]) * spikes

                g = g_new - g_new * spikes

                if probe_buf is not None:
                    probe_buf[:, step] = v[0, probe_idx]

                # --- record --------------------------------------------------
                # one scan per step: the result feeds both the spike record and
                # the next step's propagation
                fired_trial, fired_neuron = (spikes > 0).nonzero(as_tuple=True)
                count = fired_neuron.numel()
                if count:
                    if total_spikes + count > MAX_SPIKES:
                        truncated = True
                    else:
                        rec_neuron.append(
                            fired_neuron.cpu().numpy().astype(np.uint32))
                        rec_trial.append(
                            fired_trial.cpu().numpy().astype(np.uint16))
                        rec_step.append(np.full(count, step, dtype=np.int64))
                        total_spikes += count

                    # Silencing zeroes every synapse leaving these neurons, as
                    # model.py's silence() does. The neuron still fires and is
                    # still recorded; it simply stops driving its targets, so
                    # it is dropped from the propagation set only.
                    if silenced is not None:
                        keep = ~torch.isin(fired_neuron, silenced)
                        fired_trial = fired_trial[keep]
                        fired_neuron = fired_neuron[keep]

                if progress is not None and (step % report_every == 0):
                    progress(step + 1, steps, total_spikes)

        elapsed = time.perf_counter() - t0
        if progress is not None:
            progress(steps, steps, total_spikes)

        if rec_neuron:
            neuron_arr = np.concatenate(rec_neuron)
            step_arr = np.concatenate(rec_step)
            trial_arr = np.concatenate(rec_trial)
        else:
            neuron_arr = np.zeros(0, dtype=np.uint32)
            step_arr = np.zeros(0, dtype=np.int64)
            trial_arr = np.zeros(0, dtype=np.uint16)

        if probe_buf is not None:
            probe_v = probe_buf.cpu()

        return SimulationResult(
            spike_neuron=neuron_arr,
            spike_time_ms=(step_arr * DT).astype(np.float32),
            spike_trial=trial_arr,
            probe_indices=probes,
            probe_voltage=probe_v.numpy() if probes else np.zeros((0, 0), np.float32),
            probe_times_ms=(np.arange(steps) * DT).astype(np.float32),
            steps=steps,
            truncated=truncated,
            timings={
                "simulationSeconds": round(elapsed, 3),
                "msPerStep": round(elapsed / max(steps, 1) * 1000.0, 4),
                "realtimeRatio": round(
                    (cfg.duration_ms / 1000.0) / max(elapsed, 1e-9), 4),
            },
            device=str(self.device),
        )


def summarise(result: SimulationResult, cfg: SimulationConfig,
              neuron_count: int) -> dict:
    """Aggregate statistics computed from the simulated spikes only."""
    spikes = result.spike_neuron
    total = int(spikes.size)
    duration_s = cfg.duration_ms / 1000.0
    trials = cfg.trials

    if total == 0:
        return {
            "spikeCount": 0,
            "activeNeuronCount": 0,
            "meanFiringRateHz": 0.0,
            "peakFiringRateHz": 0.0,
            "populationRateHz": 0.0,
            "truncated": result.truncated,
        }

    counts = np.bincount(spikes.astype(np.int64), minlength=neuron_count)
    active = counts > 0
    # per-neuron rate over the trials it could have fired in
    rates = counts[active] / (duration_s * trials)
    return {
        "spikeCount": total,
        "activeNeuronCount": int(active.sum()),
        # mean over ACTIVE neurons -- the mean over all 138,639 would be
        # dominated by the ~99.7% that never fire and says nothing useful
        "meanFiringRateHz": round(float(rates.mean()), 3),
        "medianFiringRateHz": round(float(np.median(rates)), 3),
        "peakFiringRateHz": round(float(rates.max()), 3),
        "populationRateHz": round(float(total / (duration_s * trials)), 2),
        "truncated": result.truncated,
        "rateBasis": "spikes per neuron divided by (duration x trials)",
    }
