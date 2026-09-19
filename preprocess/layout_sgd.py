"""
Force-directed 3-D layout of the measured connectome, by SGD with negative
sampling (the LargeVis / UMAP family of objectives).

WHY NOT SPECTRAL
----------------
The obvious choice -- leading eigenvectors of the normalised adjacency -- fails
badly on this graph.  The symmetrised FlyWire 783 connectome has 89 connected
components (a 138,113-neuron giant plus 88 fragments of <=10 neurons), and even
restricted to the giant component the leading non-trivial eigenvectors are
severely localised: their inverse participation ratios correspond to effective
supports of 5-139 neurons out of 138k.  They describe weakly-attached
peripheral appendages, not global organisation, so they produce a layout in
which ~99.9% of neurons collapse to a point.  Measured with
scipy.sparse.linalg.eigsh at tol=1e-6; see the docstring of build_layout.py.

The SGD layout below instead optimises an explicit objective -- connected
neurons attract, random pairs repel -- which is well conditioned regardless of
the spectrum, and directly encodes "drawn close == strongly connected".

WHAT THE COORDINATES MEAN
-------------------------
Nothing anatomical.  They are an optimisation result over measured synaptic
connectivity.  Proximity in the final scene means "these neurons are strongly
connected", NOT "these neurons are near each other in the fly's head".
"""

from __future__ import annotations

import time

import numpy as np
import torch


def log(msg: str) -> None:
    print("[{}] {}".format(time.strftime("%H:%M:%S"), msg), flush=True)


def sparsify_topk(pre, post, weight, n, k=12):
    """Keep each neuron's k strongest outgoing and k strongest incoming edges.

    The full graph has 15.09 M connections, most of them single-synapse noise
    floor.  Layout only needs the backbone, and running SGD over every edge for
    hundreds of epochs is wasted work.  Keeping the top-k per neuron in each
    direction is the standard k-NN-graph sparsification; the union is taken so
    no neuron is left without neighbours.

    Returns (a, b, w) for an undirected, de-duplicated edge set.
    """
    keep = []
    for src, label in ((pre, "outgoing"), (post, "incoming")):
        order = np.lexsort((-weight, src))
        src_sorted = src[order]
        # rank of each edge within its source group
        starts = np.searchsorted(src_sorted, np.arange(n), side="left")
        rank = np.arange(len(order)) - starts[src_sorted]
        sel = order[rank < k]
        keep.append(sel)
        log("    top-{} {}: {:,} edges".format(k, label, len(sel)))

    sel = np.unique(np.concatenate(keep))
    a = np.minimum(pre[sel], post[sel])
    b = np.maximum(pre[sel], post[sel])
    w = weight[sel]

    # collapse reciprocal pairs, summing their synapse counts
    key = a.astype(np.int64) * n + b.astype(np.int64)
    order = np.argsort(key, kind="stable")
    key, a, b, w = key[order], a[order], b[order], w[order]
    uniq, start = np.unique(key, return_index=True)
    w_sum = np.add.reduceat(w, start)
    a, b = a[start], b[start]

    self_loop = a != b
    a, b, w_sum = a[self_loop], b[self_loop], w_sum[self_loop]
    log("    sparsified to {:,} undirected edges".format(len(a)))
    return a.astype(np.int64), b.astype(np.int64), w_sum.astype(np.float32)


def layout(pre, post, weight, n, dim=3, epochs=300, neg_ratio=5,
           k=12, seed=0, initial_lr=1.0, gamma=1.0, device="cpu"):
    """Optimise a `dim`-dimensional embedding of the connectome.

    Objective per epoch, evaluated on every sparsified edge at once:

        attractive   grad =  2 d / (1 + |d|^2)              for connected pairs
        repulsive    grad = -2 gamma d / ((0.1+|d|^2)(1+|d|^2))  for random pairs

    Edge weights (synapse counts) are log-compressed and used to scale the
    attractive term, so a 2000-synapse connection pulls harder than a
    30-synapse one without swamping it.
    """
    t0 = time.time()
    rng = np.random.default_rng(seed)
    torch.manual_seed(seed)

    log("  sparsifying graph for layout ...")
    a_np, b_np, w_np = sparsify_topk(pre, post, weight, n, k=k)

    dev = torch.device(device)
    a = torch.from_numpy(a_np).to(dev)
    b = torch.from_numpy(b_np).to(dev)
    # log compression keeps the dynamic range of synapse counts manageable
    w = torch.from_numpy(np.log1p(w_np)).to(dev)
    w = w / w.mean()

    pos = torch.from_numpy(
        rng.normal(scale=1.0, size=(n, dim)).astype(np.float32)
    ).to(dev)

    n_edges = a.numel()
    n_neg = int(n_edges * neg_ratio / 4)     # negatives are cheap and plentiful
    log("  optimising {} epochs over {:,} edges (+{:,} negatives/epoch) ...".format(
        epochs, n_edges, n_neg))

    ones_e = torch.ones(n_edges, device=dev)
    for epoch in range(epochs):
        lr = initial_lr * (1.0 - epoch / epochs) ** 1.2 + 1e-3

        # Attractive and repulsive terms are accumulated separately and each is
        # averaged over the number of terms that touched the node.  Summing them
        # instead lets hub neurons -- some have >10k partners -- accumulate a
        # gradient thousands of times larger than a leaf neuron's, overshoot,
        # and fly out of the cloud, which inverts the layout entirely.
        g_att = torch.zeros_like(pos)
        c_att = torch.zeros(n, device=dev)
        d = pos[a] - pos[b]
        dist2 = (d * d).sum(1, keepdim=True)
        ga = (2.0 * d / (1.0 + dist2)) * w.unsqueeze(1)
        g_att.index_add_(0, a, -ga)
        g_att.index_add_(0, b, ga)
        c_att.index_add_(0, a, ones_e)
        c_att.index_add_(0, b, ones_e)
        g_att /= c_att.clamp(min=1.0).unsqueeze(1)

        g_rep = torch.zeros_like(pos)
        c_rep = torch.zeros(n, device=dev)
        i = torch.randint(0, n, (n_neg,), device=dev)
        j = torch.randint(0, n, (n_neg,), device=dev)
        d = pos[i] - pos[j]
        dist2 = (d * d).sum(1, keepdim=True)
        gr = 2.0 * gamma * d / ((0.1 + dist2) * (1.0 + dist2))
        g_rep.index_add_(0, i, gr)
        g_rep.index_add_(0, j, -gr)
        ones_n = torch.ones(n_neg, device=dev)
        c_rep.index_add_(0, i, ones_n)
        c_rep.index_add_(0, j, ones_n)
        g_rep /= c_rep.clamp(min=1.0).unsqueeze(1)

        step = lr * (g_att + g_rep)
        # hard cap on displacement per epoch keeps the system stable even if a
        # pathological neuron produces a large gradient
        norm = step.norm(dim=1, keepdim=True)
        step = torch.where(norm > 0.5, step * (0.5 / norm.clamp(min=1e-9)), step)
        pos += step

        if (epoch + 1) % max(1, epochs // 6) == 0:
            with torch.no_grad():
                el = (pos[a] - pos[b]).norm(dim=1).mean().item()
                ri = torch.randint(0, n, (100000,), device=dev)
                rj = torch.randint(0, n, (100000,), device=dev)
                rl = (pos[ri] - pos[rj]).norm(dim=1).mean().item()
            log("    epoch {:>4}/{}  lr {:.3f}  mean edge len {:.3f}  "
                "random-pair len {:.3f}  ratio {:.3f}".format(
                    epoch + 1, epochs, lr, el, rl, el / max(rl, 1e-9)))

    out = pos.cpu().numpy().astype(np.float32)
    log("  layout finished in {:.1f}s".format(time.time() - t0))
    return out, (a_np, b_np, w_np)


def separation_score(pos, a, b, n, seed=0, samples=200000):
    """Mean connected-pair distance / mean random-pair distance.

    A value well below 1 means the embedding genuinely groups connected
    neurons; ~1 would mean the layout carries no connectivity information.
    Reported in meta.json so the claim is checkable rather than asserted.
    """
    rng = np.random.default_rng(seed)
    idx = rng.choice(len(a), size=min(samples, len(a)), replace=False)
    edge_len = np.linalg.norm(pos[a[idx]] - pos[b[idx]], axis=1).mean()
    ri = rng.integers(0, n, samples)
    rj = rng.integers(0, n, samples)
    rand_len = np.linalg.norm(pos[ri] - pos[rj], axis=1).mean()
    return float(edge_len / max(rand_len, 1e-9)), float(edge_len), float(rand_len)
