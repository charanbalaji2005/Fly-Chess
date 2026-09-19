"""
Preprocess the FlyWire connectome in data/ into frontend-ready artefacts.

Reads (never writes) the repository's scientific datasets:
    data/2025_Completeness_783.csv      neuron index -> FlyWire ID, completion flag
    data/2025_Connectivity_783.parquet  15.09 M synaptic connections
    data/sez_neurons.pickle             106 named SEZ cell types -> FlyWire IDs

Writes to  web/public/data/ :
    meta.json          counts, provenance, build parameters
    anatomy.json       procedural scaffold (see anatomy.py -- approximation)
    modules.json       connectivity modules derived from the real graph
    celltypes.json     SEZ cell types, verbatim from the pickle
    flywire_ids.bin    int64  x N   real FlyWire IDs (>2^53, needs BigInt64Array)
    positions.bin      float32 x 3N derived embedding coordinates
    degrees.bin        uint32 x 2N  real in/out synaptic degree
    weights.bin        float32 x 2N real in/out summed synapse counts
    polarity.bin       float32 x N  real excitatory fraction of outgoing synapses
    modules.bin        uint8   x N  derived module id
    flags.bin          uint8   x N  bit0 Completed, bit1 named SEZ cell type
    edges.bin          uint32 x 2E then float32 x E  strongest real edges

PROVENANCE
----------
measured     FlyWire IDs, degrees, weights, polarity, edges, SEZ cell types
derived      force-directed layout coordinates, connectivity modules
approximate  the anatomical scaffold geometry only (see anatomy.py)

Neuron coordinates are NOT FlyWire soma positions -- this repository does not
ship any.  They are a force-directed (SGD, negative-sampling) embedding of the
measured connectivity graph, fitted into the procedural hull so the scene reads
as a fly brain.  Two neurons drawn close together are strongly connected, not
necessarily anatomically adjacent.  See layout_sgd.py for why the more obvious
spectral embedding is not usable on this graph.

Usage:
    python preprocess/build_layout.py [--modules 16] [--edges 200000]
"""

from __future__ import annotations

import argparse
import json
import pickle
import sys
import time
from pathlib import Path

import numpy as np
import pyarrow  # noqa: F401  ensure libarrow loads before pandas parquet use
import pandas as pd
from scipy.cluster.vq import kmeans2

sys.path.insert(0, str(Path(__file__).resolve().parent))
import anatomy  # noqa: E402
import layout_sgd  # noqa: E402

REPO = Path(__file__).resolve().parent.parent
PATH_COMP = REPO / "data" / "2025_Completeness_783.csv"
PATH_CON = REPO / "data" / "2025_Connectivity_783.parquet"
PATH_SEZ = REPO / "data" / "sez_neurons.pickle"
OUT = REPO / "web" / "public" / "data"

LAYOUT_EPOCHS = 300     # SGD epochs for the force-directed layout
LAYOUT_TOPK = 12        # strongest partners kept per neuron per direction
SEED = 20260918


def log(msg: str) -> None:
    print("[{}] {}".format(time.strftime("%H:%M:%S"), msg), flush=True)


# ---------------------------------------------------------------------------
# loading
# ---------------------------------------------------------------------------
def load_neurons():
    """Return (flywire_ids int64[N], completed bool[N]) in canonical index order.

    The row order of the completeness CSV *is* the neuron index used by every
    simulation backend in code/, so it must never be reordered.
    """
    df = pd.read_csv(PATH_COMP, index_col=0)
    ids = df.index.to_numpy(dtype=np.int64)
    completed = df["Completed"].to_numpy(dtype=bool)
    return ids, completed


def load_edges():
    """Return (pre, post, connectivity, excitatory_x_connectivity)."""
    df = pd.read_parquet(PATH_CON, columns=[
        "Presynaptic_Index", "Postsynaptic_Index",
        "Connectivity", "Excitatory x Connectivity",
    ])
    return (
        df["Presynaptic_Index"].to_numpy(dtype=np.int64),
        df["Postsynaptic_Index"].to_numpy(dtype=np.int64),
        df["Connectivity"].to_numpy(dtype=np.float32),
        df["Excitatory x Connectivity"].to_numpy(dtype=np.float32),
    )


# ---------------------------------------------------------------------------
# embedding
# ---------------------------------------------------------------------------
def fit_to_hull(emb3, rng):
    """Map a 3-D cloud into the procedural brain hull, filling it evenly.

    Direction comes straight from the embedding; radius is replaced by the
    neuron's radial *rank*, reshaped to uniform density inside the hull.  So
    angular structure -- which is what carries the connectivity signal -- is
    preserved, while radial crowding artefacts are removed.
    """
    p = emb3 - emb3.mean(axis=0)
    # whiten so no single eigenvector dominates the silhouette
    cov = np.cov(p, rowvar=False)
    w, V = np.linalg.eigh(cov)
    p = (p @ V) / np.sqrt(np.maximum(w, 1e-12))

    r = np.linalg.norm(p, axis=1)
    degenerate = r < 1e-9
    if np.any(degenerate):
        p[degenerate] = rng.normal(size=(int(degenerate.sum()), 3))
        r = np.linalg.norm(p, axis=1)
    u = p / r[:, None]

    # radial rank -> uniform density in a ball (invert the r^3 cdf)
    n = len(r)
    rank = np.empty(n, dtype=np.float64)
    rank[np.argsort(r, kind="stable")] = (np.arange(n) + 0.5) / n
    r_unit = np.cbrt(rank)

    # thin margin so neurons stay inside the translucent shell
    radius = r_unit * anatomy.hull_radius(u) * 0.94
    return (u * radius[:, None]).astype(np.float32)


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description="Build frontend connectome artefacts")
    ap.add_argument("--modules", type=int, default=16,
                    help="number of connectivity modules (k-means, default 16)")
    ap.add_argument("--edges", type=int, default=200000,
                    help="strongest edges exported for the global layer")
    args = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(SEED)
    t_start = time.time()

    log("loading neurons ...")
    ids, completed = load_neurons()
    n = len(ids)
    log("  {:,} neurons ({:,} flagged Completed)".format(n, int(completed.sum())))

    log("loading connectivity ...")
    pre, post, conn, exc_conn = load_edges()
    log("  {:,} connections, {:,.0f} synapses total".format(len(pre), conn.sum()))

    # ---- measured per-neuron statistics ----------------------------------
    out_deg = np.bincount(pre, minlength=n).astype(np.uint32)
    in_deg = np.bincount(post, minlength=n).astype(np.uint32)
    out_w = np.bincount(pre, weights=conn, minlength=n).astype(np.float32)
    in_w = np.bincount(post, weights=conn, minlength=n).astype(np.float32)
    # 'Excitatory x Connectivity' is +conn for excitatory, -conn for inhibitory,
    # so the signed sum over a neuron's output gives its excitatory fraction.
    out_signed = np.bincount(pre, weights=exc_conn, minlength=n)
    polarity = np.where(out_w > 0, out_signed / np.maximum(out_w, 1e-9), 0.0)
    polarity = polarity.astype(np.float32)

    # ---- derived embedding -----------------------------------------------
    log("force-directed layout of the measured graph (slow step) ...")
    raw, (la, lb, lw) = layout_sgd.layout(
        pre, post, conn, n, dim=3, epochs=LAYOUT_EPOCHS, k=LAYOUT_TOPK,
        seed=SEED, initial_lr=2.0)
    ratio, edge_len, rand_len = layout_sgd.separation_score(raw, la, lb, n,
                                                            seed=SEED)
    log("  separation ratio {:.4f} (connected pairs are {:.1f}x closer "
        "than random pairs)".format(ratio, 1.0 / max(ratio, 1e-9)))

    log("fitting layout into procedural hull ...")
    positions = fit_to_hull(raw, rng)
    log("  bbox x[{:.2f},{:.2f}] y[{:.2f},{:.2f}] z[{:.2f},{:.2f}]".format(
        positions[:, 0].min(), positions[:, 0].max(),
        positions[:, 1].min(), positions[:, 1].max(),
        positions[:, 2].min(), positions[:, 2].max()))

    # ---- derived modules --------------------------------------------------
    log("clustering into {} connectivity modules ...".format(args.modules))
    feats = raw - raw.mean(axis=0)
    feats = (feats / (feats.std(axis=0, keepdims=True) + 1e-12)).astype(np.float64)
    centroids, labels = kmeans2(feats, args.modules, minit="++", seed=SEED,
                                iter=40, missing="warn")
    labels = labels.astype(np.uint8)
    sizes = np.bincount(labels, minlength=args.modules)
    log("  module sizes: {}".format(sizes.tolist()))

    # ---- measured SEZ cell types ------------------------------------------
    log("loading SEZ cell types ...")
    with open(PATH_SEZ, "rb") as fh:
        sez = pickle.load(fh)
    id_to_index = {int(v): i for i, v in enumerate(ids)}
    celltypes = []
    sez_member = np.zeros(n, dtype=bool)
    for name, flyids in sorted(sez.items()):
        idxs = [id_to_index[int(f)] for f in flyids if int(f) in id_to_index]
        sez_member[idxs] = True
        celltypes.append({
            "name": name,
            "neuronIndices": idxs,
            "missing": len(flyids) - len(idxs),
        })
    log("  {} cell types covering {} neurons".format(
        len(celltypes), int(sez_member.sum())))

    # ---- module statistics -------------------------------------------------
    edge_mod_pre = labels[pre]
    edge_mod_post = labels[post]
    same = edge_mod_pre == edge_mod_post
    internal = np.bincount(edge_mod_pre[same], minlength=args.modules)
    out_edges = np.bincount(edge_mod_pre, minlength=args.modules)
    in_edges = np.bincount(edge_mod_post, minlength=args.modules)
    modules = []
    for m in range(args.modules):
        sel = labels == m
        c = positions[sel].mean(axis=0) if sel.any() else np.zeros(3)
        modules.append({
            "id": int(m),
            "label": "Module {:02d}".format(m + 1),
            "neuronCount": int(sizes[m]),
            "centroid": [round(float(v), 4) for v in c],
            "internalEdges": int(internal[m]),
            "outgoingEdges": int(out_edges[m]),
            "incomingEdges": int(in_edges[m]),
            "meanOutDegree": round(float(out_deg[sel].mean()), 2) if sel.any() else 0.0,
            "sezNeurons": int(sez_member[sel].sum()),
        })

    # ---- strongest edges for the global layer -------------------------------
    k = int(min(args.edges, len(conn)))
    log("selecting {:,} strongest edges of {:,} ...".format(k, len(conn)))
    top = np.argpartition(conn, len(conn) - k)[len(conn) - k:]
    top = top[np.argsort(conn[top])[::-1]]
    e_pre = pre[top].astype(np.uint32)
    e_post = post[top].astype(np.uint32)
    e_w = exc_conn[top].astype(np.float32)   # signed: +excitatory / -inhibitory
    log("  synapse-count range {:.0f} .. {:.0f}".format(
        conn[top].min(), conn[top].max()))

    # ---- write --------------------------------------------------------------
    log("writing artefacts ...")
    ids.astype("<i8").tofile(OUT / "flywire_ids.bin")
    positions.astype("<f4").tofile(OUT / "positions.bin")
    np.stack([in_deg, out_deg], axis=1).astype("<u4").tofile(OUT / "degrees.bin")
    np.stack([in_w, out_w], axis=1).astype("<f4").tofile(OUT / "weights.bin")
    polarity.astype("<f4").tofile(OUT / "polarity.bin")
    labels.tofile(OUT / "modules.bin")
    flags = completed.astype(np.uint8) | (sez_member.astype(np.uint8) << 1)
    flags.tofile(OUT / "flags.bin")
    with open(OUT / "edges.bin", "wb") as fh:
        fh.write(np.stack([e_pre, e_post], axis=1).astype("<u4").tobytes())
        fh.write(e_w.astype("<f4").tobytes())

    (OUT / "anatomy.json").write_text(json.dumps(anatomy.to_json(), indent=1))
    (OUT / "modules.json").write_text(json.dumps({
        "provenance": "derived",
        "method": ("k-means on the leading eigenvectors of the symmetrically "
                   "normalised adjacency of the measured connectome. These are "
                   "connectivity communities, NOT anatomical neuropils."),
        "modules": modules,
    }, indent=1))
    (OUT / "celltypes.json").write_text(json.dumps({
        "provenance": "measured",
        "source": "data/sez_neurons.pickle",
        "note": ("Named subesophageal-zone cell types shipped with the "
                 "repository. These are the only region-style annotations the "
                 "datasets contain."),
        "cellTypes": celltypes,
    }, indent=1))

    meta = {
        "builtAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "buildSeconds": round(time.time() - t_start, 1),
        "neuronCount": int(n),
        "connectionCount": int(len(pre)),
        "synapseCount": int(conn.sum()),
        "completedCount": int(completed.sum()),
        "exportedEdgeCount": k,
        "moduleCount": int(args.modules),
        "sezCellTypeCount": len(celltypes),
        "sezNeuronCount": int(sez_member.sum()),
        "sources": {
            "neurons": "data/2025_Completeness_783.csv",
            "connectivity": "data/2025_Connectivity_783.parquet",
            "cellTypes": "data/sez_neurons.pickle",
        },
        "provenance": {
            "flywireIds": "measured",
            "degrees": "measured",
            "weights": "measured",
            "polarity": "measured",
            "edges": "measured (filtered to strongest by synapse count)",
            "positions": "derived (force-directed layout, not soma coordinates)",
            "modules": "derived (k-means on the force-directed layout)",
            "anatomy": "approximation (procedural scaffold)",
        },
        "layout": {
            "method": "force-directed SGD with negative sampling (LargeVis family)",
            "epochs": LAYOUT_EPOCHS,
            "topKPerNeuron": LAYOUT_TOPK,
            "layoutEdgeCount": int(len(la)),
            "separationRatio": round(ratio, 4),
            "meanConnectedPairDistance": round(edge_len, 4),
            "meanRandomPairDistance": round(rand_len, 4),
            "separationNote": ("Mean distance between connected neurons divided "
                               "by mean distance between random neurons. Below 1 "
                               "means the layout encodes real connectivity; ~1 "
                               "would mean it encodes nothing."),
            "seed": SEED,
            "warning": ("Coordinates encode connectivity proximity, not "
                        "anatomical position. The repository ships no soma "
                        "coordinates."),
        },
    }
    (OUT / "meta.json").write_text(json.dumps(meta, indent=1))

    total_mb = sum(f.stat().st_size for f in OUT.iterdir()) / 1e6
    log("done in {:.1f}s -> {} ({:.1f} MB)".format(
        time.time() - t_start, OUT, total_mb))


if __name__ == "__main__":
    main()
