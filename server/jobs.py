"""
Background job manager for simulation runs.

A 1000 ms run of the full 138,639-neuron network takes ~10 s on CPU, which is
far too long to hold an HTTP request open.  Runs are therefore submitted, then
polled: the client gets a job id immediately and watches `state` and `progress`
until the result is ready.

States: QUEUED -> RUNNING -> PROCESSING -> COMPLETE, or ERROR / CANCELLED.
Errors carry the real exception text; nothing is ever completed with
synthesised data when a run fails.
"""

from __future__ import annotations

import threading
import time
import traceback
import uuid
from collections import OrderedDict
from dataclasses import dataclass, field
from typing import Any, Callable

MAX_RETAINED = 12          # completed jobs kept in memory, oldest evicted


@dataclass
class Job:
    id: str
    state: str = "QUEUED"
    created_at: float = field(default_factory=time.time)
    started_at: float | None = None
    finished_at: float | None = None
    step: int = 0
    total_steps: int = 0
    spikes_so_far: int = 0
    stage: str = "Queued"
    error: str | None = None
    error_detail: str | None = None
    request: dict = field(default_factory=dict)
    result: Any = None
    payload: dict | None = None
    _cancel: threading.Event = field(default_factory=threading.Event)

    def snapshot(self) -> dict:
        elapsed = (
            (self.finished_at or time.time()) - self.started_at
            if self.started_at else 0.0
        )
        return {
            "simulationId": self.id,
            "state": self.state,
            "stage": self.stage,
            "step": self.step,
            "totalSteps": self.total_steps,
            "progress": (self.step / self.total_steps
                         if self.total_steps else 0.0),
            "spikesSoFar": self.spikes_so_far,
            "elapsedSeconds": round(elapsed, 2),
            "error": self.error,
            "errorDetail": self.error_detail,
            "request": self.request,
        }


class JobManager:
    """Runs one simulation at a time; concurrent submissions queue behind it."""

    def __init__(self) -> None:
        self._jobs: OrderedDict[str, Job] = OrderedDict()
        self._lock = threading.Lock()
        self._run_lock = threading.Lock()

    def submit(self, request: dict, work: Callable[[Job], dict],
               total_steps: int) -> Job:
        job = Job(id=uuid.uuid4().hex[:12], request=request,
                  total_steps=total_steps)
        with self._lock:
            self._jobs[job.id] = job
            self._evict()

        thread = threading.Thread(target=self._run, args=(job, work),
                                  name="sim-{}".format(job.id), daemon=True)
        thread.start()
        return job

    def _run(self, job: Job, work: Callable[[Job], dict]) -> None:
        # serialise runs: two full-connectome simulations at once would thrash
        # memory and make both slower than running them back to back
        with self._run_lock:
            if job._cancel.is_set():
                job.state = "CANCELLED"
                job.stage = "Cancelled before start"
                job.finished_at = time.time()
                return
            job.state = "RUNNING"
            job.stage = "Integrating network"
            job.started_at = time.time()
            try:
                job.payload = work(job)
                job.state = "COMPLETE"
                job.stage = "Complete"
            except Exception as exc:                      # noqa: BLE001
                if job._cancel.is_set():
                    job.state = "CANCELLED"
                    job.stage = "Cancelled"
                else:
                    job.state = "ERROR"
                    job.stage = "Failed"
                    job.error = str(exc) or exc.__class__.__name__
                    job.error_detail = traceback.format_exc()
            finally:
                job.finished_at = time.time()

    def _evict(self) -> None:
        done = [j for j in self._jobs.values()
                if j.state in ("COMPLETE", "ERROR", "CANCELLED")]
        while len(done) > MAX_RETAINED:
            oldest = done.pop(0)
            self._jobs.pop(oldest.id, None)

    def get(self, job_id: str) -> Job | None:
        with self._lock:
            return self._jobs.get(job_id)

    def cancel(self, job_id: str) -> bool:
        job = self.get(job_id)
        if job is None or job.state in ("COMPLETE", "ERROR", "CANCELLED"):
            return False
        job._cancel.set()
        return True

    def list(self) -> list[dict]:
        with self._lock:
            return [j.snapshot() for j in reversed(self._jobs.values())]


manager = JobManager()
