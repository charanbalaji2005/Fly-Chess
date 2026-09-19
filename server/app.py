"""
Simulation API for the Drosophila connectome explorer.

    uvicorn server.app:app --port 8000

Serves the measured connectome (neuron records, synaptic partners, local
networks, pathfinding) and runs simulations of the repository's model on
demand.  Spike data is returned as a binary blob rather than JSON: a 1000 ms
run produces ~16,000 spikes, and at ~40 bytes of JSON per spike that would be
an order of magnitude more bytes than the 10 it costs packed.

Every response that carries data also carries its provenance, so the client can
label what is measured, what is simulated, and what is a visual approximation.
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

import numpy as np
from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "server"))
sys.path.insert(0, str(REPO / "code"))

import backends                                    # noqa: E402
import brian2_runner                               # noqa: E402
from connectome import get_connectome              # noqa: E402
from jobs import manager                           # noqa: E402
from simulation import (                           # noqa: E402
    DT, MAX_DURATION_MS, MAX_PROBES, MAX_TRIALS, MODEL_PARAMS,
    BrainSimulation, SimulationConfig, summarise,
)

app = FastAPI(title="Drosophila Connectome Simulation API", version="1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # local research tool; no credentials are used
    allow_methods=["*"],
    allow_headers=["*"],
)

_started = time.time()


@app.on_event("startup")
def _warm() -> None:
    get_connectome()


# ---------------------------------------------------------------------------
# schemas
# ---------------------------------------------------------------------------
class SimulationRequest(BaseModel):
    durationMs: float = Field(200.0, gt=0, le=MAX_DURATION_MS)
    trials: int = Field(1, ge=1, le=MAX_TRIALS)
    inputRateHz: float = Field(200.0, ge=0, le=5000)
    inputNeurons: list[int] = Field(default_factory=list)
    silencedNeurons: list[int] = Field(default_factory=list)
    probeNeurons: list[int] = Field(default_factory=list)
    backend: str = "pytorch"
    seed: int = 0


# ---------------------------------------------------------------------------
# metadata
# ---------------------------------------------------------------------------
@app.get("/api/health")
def health() -> dict:
    c = get_connectome()
    return {
        "status": "ok",
        "uptimeSeconds": round(time.time() - _started, 1),
        "neuronCount": c.neuron_count,
        "connectionCount": c.connection_count,
        "connectomeLoadSeconds": c.load_seconds,
    }


@app.get("/api/model")
def model_info() -> dict:
    """The model actually being integrated, read from the repository."""
    return {
        "name": "Leaky integrate-and-fire with alpha-function synapses",
        "source": "code/run_pytorch.py, mirroring "
                  "code/paper-phil-drosophila/model.py",
        "timestepMs": DT,
        "parameters": MODEL_PARAMS,
        "units": {
            "tauSyn": "ms", "tDelay": "ms", "v0": "mV", "vReset": "mV",
            "vRest": "mV", "vThreshold": "mV", "tauMem": "ms",
            "tRefrac": "ms", "scalePoisson": "dimensionless",
            "wScale": "mV per synapse",
        },
        "citations": [
            "Kakaria & de Bivort 2017, doi:10.3389/fnbeh.2017.00008 "
            "(resting/threshold potentials, membrane time constant)",
            "Jurgensen et al., doi:10.1088/2634-4386/ac3ba6 (synaptic tau)",
            "Lazar et al., doi:10.7554/eLife.62362 (refractory period)",
            "Paul et al. 2015, doi:10.3389/fncel.2015.00029 (synaptic delay)",
        ],
        "limits": {
            "maxDurationMs": MAX_DURATION_MS,
            "maxTrials": MAX_TRIALS,
            "maxProbeNeurons": MAX_PROBES,
        },
        "provenance": "measured (model definition from the repository)",
    }


@app.get("/api/backends")
def list_backends() -> dict:
    return {
        "backends": backends.describe(),
        "default": backends.default_key(),
        "environment": backends.environment(),
    }


@app.get("/api/experiments")
def experiments() -> dict:
    """The published experiments defined in code/benchmark.py."""
    import benchmark
    c = get_connectome()
    out = []
    for key, exp in benchmark.EXPERIMENTS.items():
        idx, missing = c.indices_for(exp["neu_exc"])
        out.append({
            "key": key,
            "name": exp["name"],
            "stimRateHz": exp["stim_rate"],
            "inputNeurons": idx,
            "inputFlywireIds": [str(i) for i in exp["neu_exc"]],
            "unresolved": missing,
            "source": "code/benchmark.py",
            "provenance": "measured",
        })
    return {"experiments": out}


@app.get("/api/celltypes")
def cell_types() -> dict:
    c = get_connectome()
    return {
        "source": "data/sez_neurons.pickle",
        "note": ("Named subesophageal-zone cell types. These are the only "
                 "region-style annotations the repository datasets contain; "
                 "all other neurons have no region label available."),
        "provenance": "measured",
        "cellTypes": [
            {"name": name, "neuronCount": len(idxs), "neuronIndices": idxs}
            for name, idxs in c.cell_types.items()
        ],
    }


# ---------------------------------------------------------------------------
# connectome queries
# ---------------------------------------------------------------------------
@app.get("/api/neuron/{index}")
def neuron(index: int) -> dict:
    c = get_connectome()
    if not c.valid(index):
        raise HTTPException(404, "neuron index {} out of range".format(index))
    return c.neuron(index)


@app.get("/api/neuron/{index}/partners")
def partners(index: int,
             direction: str = Query("out", pattern="^(in|out)$"),
             limit: int = Query(100, ge=1, le=2000),
             minSynapses: float = Query(0.0, ge=0)) -> dict:
    c = get_connectome()
    if not c.valid(index):
        raise HTTPException(404, "neuron index {} out of range".format(index))
    items = c.partners(index, direction, limit, minSynapses)
    total = (c.out.degree(index) if direction == "out" else c.inc.degree(index))
    return {
        "neuronIndex": index,
        "direction": direction,
        "returned": len(items),
        "total": total,
        "truncated": len(items) < total,
        "partners": items,
        "provenance": "measured",
    }


@app.get("/api/neuron/{index}/local")
def local_network(index: int,
                  depth: int = Query(1, ge=1, le=3),
                  fanout: int = Query(24, ge=1, le=200),
                  minSynapses: float = Query(0.0, ge=0)) -> dict:
    c = get_connectome()
    if not c.valid(index):
        raise HTTPException(404, "neuron index {} out of range".format(index))
    return c.local_network(index, depth, fanout, minSynapses)


@app.get("/api/path")
def path(source: int, target: int,
         minSynapses: float = Query(0.0, ge=0),
         maxHops: int = Query(8, ge=1, le=12)) -> dict:
    """Shortest directed route between two neurons, over the measured graph."""
    c = get_connectome()
    if not c.valid(source) or not c.valid(target):
        raise HTTPException(404, "neuron index out of range")
    result = c.shortest_path(source, target, max_hops=maxHops,
                             min_synapses=minSynapses)
    if result.get("found"):
        result["nodes"] = [c.neuron(i) for i in result["path"]]
    return result


class SubgraphRequest(BaseModel):
    neurons: list[int] = Field(default_factory=list)
    minSynapses: float = 0.0
    limit: int = Field(120000, ge=1, le=400000)


@app.post("/api/subnetwork")
def subnetwork(req: SubgraphRequest) -> dict:
    """Measured connections among a set of neurons.

    The client posts the neurons that fired in a run and gets back the real
    synapses between them, which is what the propagation animation follows.
    """
    c = get_connectome()
    if not req.neurons:
        raise HTTPException(422, "at least one neuron index is required")
    if len(req.neurons) > 20000:
        raise HTTPException(422, "at most 20,000 neurons per request")
    return c.induced_subgraph(req.neurons, req.minSynapses, req.limit)


@app.get("/api/search")
def search(q: str, limit: int = Query(25, ge=1, le=100)) -> dict:
    c = get_connectome()
    return {"query": q, "results": c.search(q, limit)}


# ---------------------------------------------------------------------------
# simulation
# ---------------------------------------------------------------------------
def _build_config(req: SimulationRequest) -> SimulationConfig:
    return SimulationConfig(
        duration_ms=req.durationMs,
        trials=req.trials,
        input_rate_hz=req.inputRateHz,
        input_neurons=list(dict.fromkeys(req.inputNeurons)),
        silenced_neurons=list(dict.fromkeys(req.silencedNeurons)),
        probe_neurons=list(dict.fromkeys(req.probeNeurons))[:MAX_PROBES],
        backend=req.backend,
        seed=req.seed,
    )


@app.post("/api/simulation/run")
def run_simulation(req: SimulationRequest) -> dict:
    c = get_connectome()
    cfg = _build_config(req)

    errors = cfg.validate(c.neuron_count)
    if errors:
        raise HTTPException(422, {"message": "invalid simulation configuration",
                                  "errors": errors})

    ready = {b["key"]: b for b in backends.describe()}
    chosen = ready.get(req.backend)
    if chosen is None:
        raise HTTPException(422, "unknown backend '{}'".format(req.backend))
    if not chosen["available"]:
        raise HTTPException(
            409,
            {"message": "backend '{}' cannot run here".format(req.backend),
             "status": chosen["status"], "detail": chosen["detail"]})

    steps = int(round(cfg.duration_ms / DT))

    def work(job) -> dict:
        def progress(step, total, spikes):
            if job._cancel.is_set():
                raise RuntimeError("Cancelled by user")
            job.step, job.total_steps, job.spikes_so_far = step, total, spikes

        if req.backend == "brian2":
            job.stage = "Building Brian2 network"
            raw = brian2_runner.run(cfg, c, progress)
            job.stage = "Aggregating spikes"
            from simulation import SimulationResult
            result = SimulationResult(
                spike_neuron=raw["spike_neuron"],
                spike_time_ms=raw["spike_time_ms"],
                spike_trial=raw["spike_trial"],
                probe_indices=[], probe_voltage=np.zeros((0, 0), np.float32),
                probe_times_ms=np.zeros(0, np.float32),
                steps=steps, truncated=False,
                timings=raw["timings"], device="cpu")
        else:
            device = "cuda" if req.backend == "pytorch-cuda" else "cpu"
            sim = BrainSimulation(c, cfg, device=device)
            result = sim.run(progress)
            job.stage = "Aggregating spikes"

        stats = summarise(result, cfg, c.neuron_count)
        job.result = result
        return {
            "simulationId": job.id,
            "backend": req.backend,
            "backendLabel": "{} ({})".format(chosen["label"], chosen["device"]),
            "device": result.device,
            "durationMs": cfg.duration_ms,
            "timestepMs": DT,
            "trials": cfg.trials,
            "inputRateHz": cfg.input_rate_hz,
            "inputNeurons": cfg.input_neurons,
            "silencedNeurons": cfg.silenced_neurons,
            "probeNeurons": result.probe_indices,
            "probeSupported": req.backend != "brian2",
            "seed": cfg.seed,
            "statistics": stats,
            "timings": result.timings,
            "spikeEncoding": {
                "url": "/api/simulation/{}/spikes.bin".format(job.id),
                "layout": "uint32 neuronIndex[S], float32 timeMs[S], "
                          "uint16 trial[S], contiguous in that order",
                "count": int(result.spike_neuron.size),
            },
            "provenance": "simulated",
        }

    job = manager.submit(req.model_dump(), work, steps)
    return job.snapshot()


@app.get("/api/simulation/{job_id}")
def simulation_status(job_id: str) -> dict:
    job = manager.get(job_id)
    if job is None:
        raise HTTPException(404, "unknown simulation id")
    snap = job.snapshot()
    if job.state == "COMPLETE" and job.payload:
        snap["result"] = job.payload
    return snap


@app.post("/api/simulation/{job_id}/cancel")
def cancel(job_id: str) -> dict:
    if not manager.cancel(job_id):
        raise HTTPException(409, "simulation is not cancellable")
    return {"simulationId": job_id, "state": "CANCELLING"}


@app.get("/api/simulation/{job_id}/spikes.bin")
def spikes_binary(job_id: str) -> Response:
    job = manager.get(job_id)
    if job is None:
        raise HTTPException(404, "unknown simulation id")
    if job.state != "COMPLETE" or job.result is None:
        raise HTTPException(409, "simulation is {}".format(job.state))
    r = job.result
    blob = (r.spike_neuron.astype("<u4").tobytes()
            + r.spike_time_ms.astype("<f4").tobytes()
            + r.spike_trial.astype("<u2").tobytes())
    return Response(content=blob, media_type="application/octet-stream",
                    headers={"X-Spike-Count": str(int(r.spike_neuron.size)),
                             "Cache-Control": "no-store"})


@app.get("/api/simulation/{job_id}/traces")
def traces(job_id: str) -> dict:
    """Membrane potential of the probed neurons, trial 0.

    Returned as plain JSON because there are at most 64 probes; the spike train
    is the part that needs a binary channel.
    """
    job = manager.get(job_id)
    if job is None:
        raise HTTPException(404, "unknown simulation id")
    if job.state != "COMPLETE" or job.result is None:
        raise HTTPException(409, "simulation is {}".format(job.state))
    r = job.result
    if not r.probe_indices:
        return {"probes": [], "note": "no probe neurons were requested",
                "provenance": "simulated"}

    # thin to ~2000 samples so a 5000 ms trace stays a reasonable payload
    stride = max(1, r.probe_voltage.shape[1] // 2000)
    return {
        "timesMs": r.probe_times_ms[::stride].tolist(),
        "strideSteps": stride,
        "unit": "mV",
        "thresholdMv": MODEL_PARAMS["vThreshold"],
        "restMv": MODEL_PARAMS["vRest"],
        "probes": [
            {"neuronIndex": idx,
             "voltageMv": [round(float(v), 3)
                           for v in r.probe_voltage[k, ::stride]]}
            for k, idx in enumerate(r.probe_indices)
        ],
        "note": ("Reset is instantaneous in this model, so a spike appears as "
                 "a return to -52 mV rather than an action potential."),
        "provenance": "simulated",
    }


@app.get("/api/simulations")
def list_simulations() -> dict:
    return {"simulations": manager.list()}
