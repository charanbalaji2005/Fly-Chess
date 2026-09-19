"""
Simulation backend registry.

The repository ships runners for six backends (Brian2 CPU, Brian2CUDA, GeNN,
Brian2GeNN, NEST GPU, PyTorch).  Most of them need toolchains that are not
present in a given environment, so this module *probes* rather than assumes:
each backend reports whether it can actually execute here, and why not if it
cannot.  The UI shows that status verbatim and refuses to submit a run to a
backend that is not ready, instead of failing halfway through.

Brian2 is the scientific reference implementation.  When it is importable the
server runs it through the repository's own reference model
(code/paper-phil-drosophila/model.py), not a reimplementation.
"""

from __future__ import annotations

import importlib.util
import platform
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent


def _installed(module: str) -> bool:
    try:
        return importlib.util.find_spec(module) is not None
    except (ImportError, ValueError):
        return False


def _torch_cuda() -> tuple[bool, str]:
    try:
        import torch
    except ImportError:
        return False, "PyTorch is not installed"
    if not torch.cuda.is_available():
        build = getattr(torch.version, "cuda", None)
        if not build:
            return False, "this PyTorch build has no CUDA support ({})".format(
                torch.__version__)
        return False, "no CUDA device is visible to PyTorch"
    return True, torch.cuda.get_device_name(0)


def describe() -> list[dict]:
    """Report every backend the repository defines, with live availability."""
    backends: list[dict] = []

    torch_ok = _installed("torch")
    torch_version = ""
    if torch_ok:
        import torch
        torch_version = torch.__version__

    backends.append({
        "key": "pytorch",
        "label": "PyTorch",
        "device": "CPU",
        "available": torch_ok,
        "status": "Ready" if torch_ok else "Unavailable",
        "detail": ("torch {} - event-driven kernel, verified spike-for-spike "
                   "against code/run_pytorch.py".format(torch_version)
                   if torch_ok else "PyTorch is not installed"),
        "reference": False,
        "runner": "server/simulation.py (model from code/run_pytorch.py)",
    })

    cuda_ok, cuda_detail = _torch_cuda()
    backends.append({
        "key": "pytorch-cuda",
        "label": "PyTorch",
        "device": "CUDA",
        "available": cuda_ok,
        "status": "GPU available" if cuda_ok else "Unavailable",
        "detail": cuda_detail,
        "reference": False,
        "runner": "server/simulation.py (model from code/run_pytorch.py)",
    })

    brian2_ok = _installed("brian2")
    backends.append({
        "key": "brian2",
        "label": "Brian2",
        "device": "CPU",
        "available": brian2_ok,
        "status": "Ready" if brian2_ok else "Unavailable",
        "detail": ("reference implementation, run through "
                   "code/paper-phil-drosophila/model.py"
                   if brian2_ok else
                   "brian2 is not installed in this environment "
                   "(see environment.yml)"),
        "reference": True,
        "runner": "code/paper-phil-drosophila/model.py",
    })

    for key, label, module, runner, note in [
        ("brian2cuda", "Brian2CUDA", "brian2cuda", "code/run_brian2_cuda.py",
         "needs brian2cuda and an NVIDIA toolchain"),
        ("brian2genn", "Brian2GeNN", "brian2genn", "code/run_brian2_genn.py",
         "needs a separate brian2<2.6 environment "
         "(see environment-brian2genn.yml)"),
        ("genn", "GeNN", "pygenn", "code/run_genn.py",
         "needs pygenn and an NVIDIA toolchain"),
        ("nestgpu", "NEST GPU", "nestgpu", "code/run_nestgpu.py",
         "needs a NEST GPU build (see scripts/setup_WSL_CUDA.sh)"),
    ]:
        present = _installed(module)
        backends.append({
            "key": key,
            "label": label,
            "device": "GPU",
            # These runners are benchmark harnesses that write parquet files;
            # they are not wired to the interactive API, so even when the
            # module imports they are reported as not interactively runnable.
            "available": False,
            "status": "Installed, not wired" if present else "Unavailable",
            "detail": ("module imports, but {} is a benchmark harness rather "
                       "than an interactive runner".format(runner)
                       if present else note),
            "reference": False,
            "runner": runner,
        })

    return backends


def available_keys() -> list[str]:
    return [b["key"] for b in describe() if b["available"]]


def default_key() -> str:
    keys = available_keys()
    for preferred in ("pytorch-cuda", "pytorch", "brian2"):
        if preferred in keys:
            return preferred
    return keys[0] if keys else "pytorch"


def environment() -> dict:
    return {
        "python": sys.version.split()[0],
        "platform": "{} {}".format(platform.system(), platform.release()),
        "machine": platform.machine(),
    }
