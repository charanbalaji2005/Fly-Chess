"""
Procedural Drosophila brain scaffold.

SCIENTIFIC STATUS  -- READ THIS FIRST
=====================================
Everything in this module is a *visualisation approximation*.

This repository's datasets (data/2025_Completeness_783.csv and
data/2025_Connectivity_783.parquet) contain FlyWire neuron IDs and the
synaptic connectivity between them.  They contain NO neuron soma
coordinates and NO neuropil / brain-region annotations.

Therefore the compartments below are NOT registered anatomy.  They are a
hand-authored set of ellipsoids whose proportions are loosely modelled on
published descriptions of the adult Drosophila melanogaster brain, and they
exist for two reasons only:

  1. to give the 3D scene a silhouette a reader recognises as a fly brain,
  2. to define a closed volume that the connectivity-derived neuron
     embedding is fitted into (see build_layout.py).

Neurons are NOT assigned membership of these compartments, and no statistic
in the application is ever aggregated over them.  Region-style analytics use
connectivity modules derived from the real graph, plus the SEZ cell types
that data/sez_neurons.pickle actually records.

Coordinate frame (arbitrary units, ~1 unit = 60 um):
    +x = fly's right, +y = dorsal, +z = anterior
"""

from __future__ import annotations

import numpy as np

# Each compartment: axis-aligned ellipsoid (centre, radii).  `mirror` emits a
# left/right pair at +/- centre-x.  `group` drives colour + legend grouping.
_COMPARTMENTS: list[dict] = [
    # ---- optic lobes -----------------------------------------------------
    dict(key="lamina",       label="Lamina",        group="optic",
         center=(4.95, 0.20, 0.00), radii=(0.45, 1.85, 1.45), mirror=True),
    dict(key="medulla",      label="Medulla",       group="optic",
         center=(3.75, 0.15, 0.00), radii=(1.30, 2.00, 1.60), mirror=True),
    dict(key="lobula",       label="Lobula",        group="optic",
         center=(2.70, -0.05, 0.40), radii=(0.90, 1.35, 1.00), mirror=True),
    dict(key="lobula_plate", label="Lobula plate",  group="optic",
         center=(2.75, 0.20, -0.60), radii=(0.62, 1.15, 0.62), mirror=True),
    # ---- central brain ---------------------------------------------------
    dict(key="protocerebrum", label="Protocerebrum", group="central",
         center=(0.00, 0.35, 0.00), radii=(2.65, 2.05, 1.85), mirror=False),
    dict(key="central_complex", label="Central complex", group="central",
         center=(0.00, 0.80, -0.15), radii=(0.90, 0.60, 0.55), mirror=False),
    dict(key="mb_calyx",     label="MB calyx",      group="mushroom",
         center=(1.55, 1.05, -0.95), radii=(0.58, 0.52, 0.52), mirror=True),
    dict(key="mb_lobes",     label="MB peduncle & lobes", group="mushroom",
         center=(1.20, 0.10, 0.70), radii=(0.34, 0.95, 1.15), mirror=True),
    dict(key="antennal_lobe", label="Antennal lobe", group="sensory",
         center=(1.05, -0.90, 1.20), radii=(0.66, 0.66, 0.66), mirror=True),
    # ---- ventral ---------------------------------------------------------
    dict(key="sez",          label="SEZ (gnathal ganglia)", group="sez",
         center=(0.00, -1.70, 0.25), radii=(1.85, 1.15, 1.45), mirror=False),
]


def compartments() -> list[dict]:
    """Expand the mirrored definitions into a flat list of ellipsoids."""
    out: list[dict] = []
    for c in _COMPARTMENTS:
        cx, cy, cz = c["center"]
        if c["mirror"]:
            for side, sign in (("R", 1.0), ("L", -1.0)):
                out.append(dict(
                    key=f"{c['key']}_{side.lower()}",
                    label=f"{c['label']} ({side})",
                    group=c["group"],
                    side=side,
                    center=(sign * cx, cy, cz),
                    radii=tuple(c["radii"]),
                ))
        else:
            out.append(dict(
                key=c["key"], label=c["label"], group=c["group"], side="M",
                center=(cx, cy, cz), radii=tuple(c["radii"]),
            ))
    return out


def as_arrays() -> tuple[np.ndarray, np.ndarray]:
    """Return (centres, radii) as float64 arrays of shape (K, 3)."""
    comps = compartments()
    centers = np.array([c["center"] for c in comps], dtype=np.float64)
    radii = np.array([c["radii"] for c in comps], dtype=np.float64)
    return centers, radii


def hull_radius(directions: np.ndarray) -> np.ndarray:
    """Distance from the origin to the outer surface of the compartment union.

    For each unit direction ``u`` this ray-casts against every ellipsoid and
    returns the largest positive intersection parameter, i.e. the radius of
    the union's silhouette along ``u``.  Vectorised over N directions.

    Parameters
    ----------
    directions : (N, 3) array of unit vectors.

    Returns
    -------
    (N,) array of radii.  Directions that miss every ellipsoid get the
    radius of the smallest enclosing sphere of the central compartment, so
    the result is always positive.
    """
    centers, radii = as_arrays()
    n = directions.shape[0]
    best = np.zeros(n, dtype=np.float64)

    for c, r in zip(centers, radii):
        # Ray  p(t) = t * u  against  ||(p - c) / r|| = 1
        ur = directions / r                       # (N,3)
        cr = c / r                                # (3,)
        a = np.einsum("ij,ij->i", ur, ur)         # (N,)
        b = -2.0 * (ur @ cr)                      # (N,)
        cc = float(cr @ cr) - 1.0
        disc = b * b - 4.0 * a * cc
        hit = disc > 0.0
        if not np.any(hit):
            continue
        sq = np.sqrt(disc[hit])
        t = (-b[hit] + sq) / (2.0 * a[hit])       # far intersection
        best[hit] = np.maximum(best[hit], np.maximum(t, 0.0))

    fallback = 0.5
    return np.where(best > 0.0, best, fallback)


def to_json() -> dict:
    """Serialisable scaffold description consumed by the frontend renderer."""
    return {
        "provenance": "approximation",
        "note": (
            "Procedural scaffold. The repository connectome contains no soma "
            "coordinates or neuropil annotations, so these compartments are "
            "illustrative geometry, not registered anatomy. No neuron is "
            "assigned membership and no statistic is computed over them."
        ),
        "frame": {"x": "fly right", "y": "dorsal", "z": "anterior",
                  "unitApproxMicrons": 60},
        "compartments": [
            {
                "key": c["key"], "label": c["label"], "group": c["group"],
                "side": c["side"],
                "center": list(c["center"]), "radii": list(c["radii"]),
            }
            for c in compartments()
        ],
    }
