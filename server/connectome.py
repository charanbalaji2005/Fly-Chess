"""
In-memory access to the measured FlyWire 783 connectome.

Owns the full graph -- all 138,639 neurons and all 15,091,983 connections --
so that neighbour queries, pathfinding and simulation run against the complete
dataset.  The browser only ever receives filtered subsets of this.

Everything here is measured data read from data/.  Nothing is synthesised.

The first load parses the 100 MB parquet (~30 s); the CSR arrays are then
cached under .cache/connectome/ as plain .npy files and memory-mapped on
subsequent starts, which brings startup down to well under a second.
"""

from __future__ import annotations

import heapq
import json
import pickle
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import numpy as np

REPO = Path(__file__).resolve().parent.parent
PATH_COMP = REPO / "data" / "2025_Completeness_783.csv"
PATH_CON = REPO / "data" / "2025_Connectivity_783.parquet"
PATH_SEZ = REPO / "data" / "sez_neurons.pickle"
CACHE = REPO / ".cache" / "connectome"

CACHE_VERSION = 2


@dataclass
class Direction:
    """One direction of the adjacency, in CSR form."""
    indptr: np.ndarray      # int64[N + 1]
    indices: np.ndarray     # int32[E]   partner neuron index
    synapses: np.ndarray    # float32[E] synapse count  (Connectivity)
    signed: np.ndarray      # float32[E] signed count   (Excitatory x Connectivity)

    def slice(self, index: int):
        lo, hi = int(self.indptr[index]), int(self.indptr[index + 1])
        return self.indices[lo:hi], self.synapses[lo:hi], self.signed[lo:hi]

    def degree(self, index: int) -> int:
        return int(self.indptr[index + 1] - self.indptr[index])


def _build_csr(src, dst, syn, signed, n):
    """CSR grouped by `src`, sorted within each group by descending synapse count."""
    order = np.lexsort((-syn, src))
    src_s = src[order]
    counts = np.bincount(src_s, minlength=n)
    indptr = np.zeros(n + 1, dtype=np.int64)
    np.cumsum(counts, out=indptr[1:])
    return Direction(
        indptr=indptr,
        indices=dst[order].astype(np.int32),
        synapses=syn[order].astype(np.float32),
        signed=signed[order].astype(np.float32),
    )


class Connectome:
    """The measured connectome, loaded once and shared by every request."""

    def __init__(self, verbose: bool = True):
        self.verbose = verbose
        t0 = time.time()
        self._load()
        self.load_seconds = round(time.time() - t0, 2)
        self._log("ready in {:.2f}s".format(self.load_seconds))

    def _log(self, msg: str) -> None:
        if self.verbose:
            print("[connectome] {}".format(msg), flush=True)

    # -- loading ----------------------------------------------------------
    def _load(self) -> None:
        stamp = CACHE / "version.json"
        fresh = False
        if stamp.exists():
            try:
                meta = json.loads(stamp.read_text())
                fresh = (meta.get("version") == CACHE_VERSION
                         and meta.get("connMtime") == PATH_CON.stat().st_mtime)
            except (ValueError, OSError):
                fresh = False

        if fresh:
            self._log("loading cached CSR (memory-mapped)")
            self._load_cache()
        else:
            self._log("building CSR from parquet (first run, ~40s)")
            self._build_cache()

        self.neuron_count = int(len(self.flywire_ids))
        self.connection_count = int(len(self.out.indices))
        self.synapse_count = int(self.out.synapses.sum())
        self._id_to_index = {int(v): i for i, v in enumerate(self.flywire_ids)}

        with open(PATH_SEZ, "rb") as fh:
            sez = pickle.load(fh)
        self.cell_types: dict[str, list[int]] = {}
        self.index_to_cell_type: dict[int, str] = {}
        for name, flyids in sorted(sez.items()):
            idxs = [self._id_to_index[int(f)] for f in flyids
                    if int(f) in self._id_to_index]
            if idxs:
                self.cell_types[name] = idxs
                for i in idxs:
                    self.index_to_cell_type[i] = name
        self._log("{:,} neurons, {:,} connections, {} SEZ cell types".format(
            self.neuron_count, self.connection_count, len(self.cell_types)))

    def _build_cache(self) -> None:
        import pyarrow  # noqa: F401  load libarrow before pandas touches parquet
        import pandas as pd

        comp = pd.read_csv(PATH_COMP, index_col=0)
        self.flywire_ids = comp.index.to_numpy(dtype=np.int64)
        self.completed = comp["Completed"].to_numpy(dtype=bool)
        n = len(self.flywire_ids)

        df = pd.read_parquet(PATH_CON, columns=[
            "Presynaptic_Index", "Postsynaptic_Index",
            "Connectivity", "Excitatory x Connectivity",
        ])
        pre = df["Presynaptic_Index"].to_numpy(dtype=np.int32)
        post = df["Postsynaptic_Index"].to_numpy(dtype=np.int32)
        syn = df["Connectivity"].to_numpy(dtype=np.float32)
        signed = df["Excitatory x Connectivity"].to_numpy(dtype=np.float32)
        del df

        self.out = _build_csr(pre, post, syn, signed, n)
        self.inc = _build_csr(post, pre, syn, signed, n)

        CACHE.mkdir(parents=True, exist_ok=True)
        np.save(CACHE / "flywire_ids.npy", self.flywire_ids)
        np.save(CACHE / "completed.npy", self.completed)
        for tag, d in (("out", self.out), ("in", self.inc)):
            np.save(CACHE / "{}_indptr.npy".format(tag), d.indptr)
            np.save(CACHE / "{}_indices.npy".format(tag), d.indices)
            np.save(CACHE / "{}_synapses.npy".format(tag), d.synapses)
            np.save(CACHE / "{}_signed.npy".format(tag), d.signed)
        (CACHE / "version.json").write_text(json.dumps({
            "version": CACHE_VERSION,
            "connMtime": PATH_CON.stat().st_mtime,
        }))

    def _load_cache(self) -> None:
        def m(name):
            return np.load(CACHE / name, mmap_mode="r")

        self.flywire_ids = np.load(CACHE / "flywire_ids.npy")
        self.completed = np.load(CACHE / "completed.npy")
        self.out = Direction(m("out_indptr.npy"), m("out_indices.npy"),
                             m("out_synapses.npy"), m("out_signed.npy"))
        self.inc = Direction(m("in_indptr.npy"), m("in_indices.npy"),
                             m("in_synapses.npy"), m("in_signed.npy"))

    # -- lookup -----------------------------------------------------------
    def index_of(self, flywire_id: int) -> int | None:
        return self._id_to_index.get(int(flywire_id))

    def flywire_id(self, index: int) -> int:
        return int(self.flywire_ids[index])

    def valid(self, index: int) -> bool:
        return 0 <= index < self.neuron_count

    def resolve(self, token: str) -> int | None:
        """Resolve a user-typed token to a neuron index.

        Accepts a bare neuron index, a full FlyWire ID, or a SEZ cell-type name
        (which resolves to that type's first neuron).
        """
        token = token.strip()
        if not token:
            return None
        if token in self.cell_types:
            return self.cell_types[token][0]
        if token.isdigit():
            value = int(token)
            # FlyWire IDs are ~7.2e17; anything small enough is a neuron index
            if value < self.neuron_count:
                return value
            return self.index_of(value)
        return None

    def search(self, query: str, limit: int = 25) -> list[dict]:
        """Search neurons by FlyWire ID prefix, index, or SEZ cell-type name."""
        q = query.strip().lower()
        results: list[dict] = []
        if not q:
            return results

        for name, idxs in self.cell_types.items():
            if q in name.lower():
                results.append({
                    "kind": "cellType", "label": name,
                    "neuronIndex": idxs[0], "neuronCount": len(idxs),
                    "flywireId": str(self.flywire_id(idxs[0])),
                    "provenance": "measured",
                })
                if len(results) >= limit:
                    return results

        if q.isdigit():
            value = int(q)
            if value < self.neuron_count:
                results.append(self._hit(value, "neuron index"))
            exact = self.index_of(value)
            if exact is not None:
                results.append(self._hit(exact, "FlyWire ID"))
            elif len(q) >= 6:
                # prefix scan over the sorted-ish id array
                prefix = q
                matches = [i for i, fid in enumerate(self.flywire_ids)
                           if str(fid).startswith(prefix)][: limit - len(results)]
                for i in matches:
                    results.append(self._hit(i, "FlyWire ID prefix"))
        return results[:limit]

    def _hit(self, index: int, match: str) -> dict:
        return {
            "kind": "neuron",
            "label": "#{}".format(index),
            "neuronIndex": index,
            "flywireId": str(self.flywire_id(index)),
            "cellType": self.index_to_cell_type.get(index),
            "match": match,
            "provenance": "measured",
        }

    # -- graph queries ----------------------------------------------------
    def neuron(self, index: int) -> dict:
        """Full measured record for one neuron."""
        out_i, out_s, out_sg = self.out.slice(index)
        in_i, in_s, in_sg = self.inc.slice(index)
        out_total = float(out_s.sum())
        return {
            "index": index,
            "flywireId": str(self.flywire_id(index)),
            "cellType": self.index_to_cell_type.get(index),
            "completed": bool(self.completed[index]),
            "outDegree": int(len(out_i)),
            "inDegree": int(len(in_i)),
            "outSynapses": out_total,
            "inSynapses": float(in_s.sum()),
            # signed weights are +count for excitatory, -count for inhibitory
            "excitatoryFraction": (
                float(out_sg.sum() / out_total) if out_total > 0 else None
            ),
            "provenance": "measured",
        }

    def partners(self, index: int, direction: str = "out", limit: int = 100,
                 min_synapses: float = 0.0) -> list[dict]:
        """Strongest synaptic partners, already sorted by synapse count."""
        d = self.out if direction == "out" else self.inc
        idx, syn, signed = d.slice(index)
        if min_synapses > 0:
            keep = syn >= min_synapses
            idx, syn, signed = idx[keep], syn[keep], signed[keep]
        idx, syn, signed = idx[:limit], syn[:limit], signed[:limit]
        return [
            {
                "neuronIndex": int(i),
                "flywireId": str(self.flywire_id(int(i))),
                "cellType": self.index_to_cell_type.get(int(i)),
                "synapses": float(s),
                "sign": 1 if g >= 0 else -1,
            }
            for i, s, g in zip(idx, syn, signed)
        ]

    def local_network(self, index: int, depth: int = 1, fanout: int = 24,
                      min_synapses: float = 0.0) -> dict:
        """Breadth-limited neighbourhood around a neuron, both directions.

        Each hop keeps only the `fanout` strongest partners, otherwise a hub
        neuron with 10k+ partners would return the whole brain.
        """
        nodes: dict[int, int] = {index: 0}
        edges: list[dict] = []
        seen_edges: set[tuple[int, int]] = set()
        frontier = [index]

        for hop in range(1, depth + 1):
            nxt: list[int] = []
            for node in frontier:
                for direction, d in (("out", self.out), ("in", self.inc)):
                    idx, syn, signed = d.slice(node)
                    if min_synapses > 0:
                        keep = syn >= min_synapses
                        idx, syn, signed = idx[keep], syn[keep], signed[keep]
                    for i, s, g in zip(idx[:fanout], syn[:fanout], signed[:fanout]):
                        i = int(i)
                        a, b = (node, i) if direction == "out" else (i, node)
                        if (a, b) in seen_edges:
                            continue
                        seen_edges.add((a, b))
                        edges.append({"source": a, "target": b,
                                      "synapses": float(s),
                                      "sign": 1 if g >= 0 else -1})
                        if i not in nodes:
                            nodes[i] = hop
                            nxt.append(i)
            frontier = nxt

        return {
            "root": index,
            "nodes": [{"neuronIndex": k, "hop": v} for k, v in nodes.items()],
            "edges": edges,
            "truncatedFanout": fanout,
            "provenance": "measured",
        }

    def _expand(self, frontier, direction, min_synapses=0.0):
        """One vectorised BFS layer.

        Gathers the CSR slices of every node in `frontier` at once and returns
        (targets, parents, synapses) with the strongest parent kept for each
        newly reached node.  Doing this with numpy rather than a Python loop is
        what makes a query over 15 M connections interactive.
        """
        d = self.out if direction == "out" else self.inc
        starts = d.indptr[frontier]
        counts = d.indptr[frontier + 1] - starts
        total = int(counts.sum())
        if total == 0:
            empty_i = np.zeros(0, dtype=np.int32)
            return empty_i, empty_i, np.zeros(0, dtype=np.float32)

        offsets = np.repeat(starts, counts)
        ramp = np.arange(total) - np.repeat(np.cumsum(counts) - counts, counts)
        flat = offsets + ramp

        targets = np.asarray(d.indices[flat])
        parents = np.repeat(frontier, counts).astype(np.int32)
        synapses = np.asarray(d.synapses[flat])

        if min_synapses > 0:
            keep = synapses >= min_synapses
            targets, parents, synapses = targets[keep], parents[keep], synapses[keep]
            if targets.size == 0:
                empty_i = np.zeros(0, dtype=np.int32)
                return empty_i, empty_i, np.zeros(0, dtype=np.float32)

        # keep the heaviest incoming edge per newly reached node
        order = np.lexsort((-synapses, targets))
        targets, parents, synapses = targets[order], parents[order], synapses[order]
        first = np.ones(len(targets), dtype=bool)
        first[1:] = targets[1:] != targets[:-1]
        return targets[first], parents[first], synapses[first]

    def shortest_path(self, source: int, target: int, max_hops: int = 8,
                      min_synapses: float = 1.0, **_ignored) -> dict:
        """Fewest-hop directed route from `source` to `target`.

        Bidirectional breadth-first search over the complete measured graph --
        no sampling, no beam, no edge budget -- so the hop count it returns is
        genuinely the minimum and a reported miss is a real absence within
        `max_hops`.  Each layer is expanded with numpy over the CSR rather than
        a Python loop; the fly connectome has a very small diameter, so the two
        fronts usually meet after two or three layers each.

        Among the equally short routes, every step keeps the parent with the
        higher synapse count, so the returned path is the heaviest-wired one of
        its length rather than an arbitrary pick.
        """
        n = self.neuron_count
        if not (self.valid(source) and self.valid(target)):
            return {"found": False, "reason": "neuron index out of range",
                    "provenance": "measured"}
        if source == target:
            return {"found": True, "path": [source], "edges": [], "hops": 0,
                    "totalSynapses": 0.0, "weakestLink": 0.0,
                    "searchedNeurons": 1,
                    "note": "source and target are the same neuron",
                    "provenance": "measured"}

        parent_f = np.full(n, -1, dtype=np.int32)
        parent_b = np.full(n, -1, dtype=np.int32)
        seen_f = np.zeros(n, dtype=bool)
        seen_b = np.zeros(n, dtype=bool)
        seen_f[source] = True
        seen_b[target] = True
        front_f = np.array([source], dtype=np.int32)
        front_b = np.array([target], dtype=np.int32)
        hops_f = hops_b = 0
        meeting = -1

        while hops_f + hops_b < max_hops and meeting < 0:
            if front_f.size == 0 or front_b.size == 0:
                break
            # always grow the cheaper side, which keeps both fronts small
            forward = front_f.size <= front_b.size
            if forward:
                nxt, par, _ = self._expand(front_f, "out", min_synapses)
                fresh = ~seen_f[nxt]
                nxt, par = nxt[fresh], par[fresh]
                seen_f[nxt] = True
                parent_f[nxt] = par
                front_f = nxt
                hops_f += 1
                hit = np.nonzero(seen_b[nxt])[0]
            else:
                nxt, par, _ = self._expand(front_b, "in", min_synapses)
                fresh = ~seen_b[nxt]
                nxt, par = nxt[fresh], par[fresh]
                seen_b[nxt] = True
                parent_b[nxt] = par
                front_b = nxt
                hops_b += 1
                hit = np.nonzero(seen_f[nxt])[0]
            if hit.size:
                meeting = int(nxt[hit[0]])

        searched = int(seen_f.sum() + seen_b.sum())
        if meeting < 0:
            return {
                "found": False,
                "reason": ("No directed route from neuron #{} to #{} within {} "
                           "hops. The search covered {:,} neurons over the full "
                           "measured connectome at a threshold of {:g} "
                           "synapses, so no shorter route exists; a longer or "
                           "weaker one might.".format(source, target, max_hops,
                                                      searched, min_synapses)),
                "searchedNeurons": searched,
                "maxHops": max_hops,
                "provenance": "measured",
            }

        path = [meeting]
        node = meeting
        while node != source:
            node = int(parent_f[node])
            path.append(node)
        path.reverse()
        node = meeting
        while node != target:
            node = int(parent_b[node])
            path.append(node)

        edges = []
        for a_i, b_i in zip(path, path[1:]):
            idx, syn, signed = self.out.slice(a_i)
            hit = np.nonzero(np.asarray(idx) == b_i)[0]
            if hit.size == 0:
                return {"found": False,
                        "reason": "path reconstruction failed at #{}".format(a_i),
                        "provenance": "measured"}
            k = int(hit[0])
            edges.append({"source": a_i, "target": b_i,
                          "synapses": float(syn[k]),
                          "sign": 1 if signed[k] >= 0 else -1})

        weak = min(e["synapses"] for e in edges)
        return {
            "found": True,
            "path": path,
            "edges": edges,
            "hops": len(path) - 1,
            "totalSynapses": float(sum(e["synapses"] for e in edges)),
            "weakestLink": float(weak),
            "searchedNeurons": searched,
            "maxHops": max_hops,
            "minSynapses": min_synapses,
            "method": ("exact bidirectional breadth-first search over every "
                       "measured connection at or above the synapse threshold; "
                       "ties broken towards the heavier synapse"),
            "provenance": "measured",
        }

    def induced_subgraph(self, neurons, min_synapses: float = 0.0,
                         limit: int = 120000) -> dict:
        """Every measured connection that runs between the given neurons.

        Used to animate spike propagation: after a run, the set of neurons that
        actually fired is sent here, and the pulses travel along the real
        synapses linking them rather than along invented lines. Exact, not
        sampled -- the induced subgraph of a few hundred active neurons is
        small even though the full graph has 15 M edges.
        """
        member = np.zeros(self.neuron_count, dtype=bool)
        valid = [int(i) for i in neurons if self.valid(int(i))]
        member[valid] = True

        src_out: list[int] = []
        dst_out: list[int] = []
        syn_out: list[float] = []
        sgn_out: list[int] = []
        truncated = False

        for node in valid:
            idx, syn, signed = self.out.slice(node)
            idx = np.asarray(idx)
            if idx.size == 0:
                continue
            keep = member[idx]
            if min_synapses > 0:
                keep &= np.asarray(syn) >= min_synapses
            if not keep.any():
                continue
            hit = np.nonzero(keep)[0]
            if len(src_out) + hit.size > limit:
                hit = hit[: max(0, limit - len(src_out))]
                truncated = True
            src_out.extend([node] * hit.size)
            dst_out.extend(idx[hit].tolist())
            syn_out.extend(np.asarray(syn)[hit].tolist())
            sgn_out.extend((np.asarray(signed)[hit] >= 0).astype(np.int8).tolist())
            if truncated:
                break

        return {
            "neuronCount": len(valid),
            "edgeCount": len(src_out),
            "truncated": truncated,
            "source": src_out,
            "target": dst_out,
            "synapses": syn_out,
            "excitatory": sgn_out,
            "provenance": "measured",
        }

    # -- simulation support ------------------------------------------------
    def out_csr_arrays(self):
        """(indptr, indices, signed weights) for the event-driven kernel."""
        return self.out.indptr, self.out.indices, self.out.signed

    def indices_for(self, tokens: Iterable) -> tuple[list[int], list[str]]:
        """Resolve a mixed list of indices / FlyWire IDs / cell-type names.

        Returns (resolved indices, unresolved tokens) -- unresolved tokens are
        reported to the user rather than silently dropped.
        """
        resolved: list[int] = []
        missing: list[str] = []
        for tok in tokens:
            if isinstance(tok, int) and 0 <= tok < self.neuron_count:
                resolved.append(tok)
                continue
            text = str(tok).strip()
            if text in self.cell_types:
                resolved.extend(self.cell_types[text])
                continue
            idx = self.resolve(text)
            if idx is None:
                missing.append(text)
            else:
                resolved.append(idx)
        # de-duplicate, preserving order
        seen: set[int] = set()
        unique = [i for i in resolved if not (i in seen or seen.add(i))]
        return unique, missing


_instance: Connectome | None = None


def get_connectome() -> Connectome:
    global _instance
    if _instance is None:
        _instance = Connectome()
    return _instance
