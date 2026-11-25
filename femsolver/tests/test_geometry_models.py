"""Electrostatics on models only geometry v2 can describe: thin (1D) electrodes,
structured meshes, rings, point-picked boundaries. Analytic references."""

import math

import numpy as np
import pytest
from fem_mesher import Geometry, mesh_geometry
from fem_solver import EPSILON_0, Electrostatics, solve

W, H, ER = 0.1, 0.02, 3.0  # plate width, plate gap, permittivity


def run(geometry: dict, materials: dict, bcs: list):
    mesh = mesh_geometry(Geometry.model_validate(geometry)).mesh
    problem = Electrostatics.model_validate(
        {
            "materials": {d: {"name": d, "relative_permittivity": e} for d, e in materials.items()},
            "boundary_conditions": bcs,
        }
    )
    return mesh, solve(problem, mesh)


def thin_electrode(mesh_settings: dict):
    """Dielectric between grounded plates (y = 0 and y = H), with a zero-thickness
    electrode at U = 1 across the middle: two plate capacitors in parallel."""
    return run(
        {
            "steps": [
                {"kind": "rectangle", "name": "diel", "x": 0, "y": 0, "width": W, "height": H},
                {"kind": "polyline", "name": "electrode", "points": [[0, H / 2], [W, H / 2]]},
            ],
            "selections": [
                {"kind": "points", "name": "plates", "points": [[W / 2, 0], [W / 2, H]]}
            ],
            "mesh": mesh_settings,
        },
        {"diel": ER},
        [
            {"type": "potential", "boundary": "electrode", "value": 1},
            {"type": "ground", "boundary": "plates"},
        ],
    )


def test_thin_electrode_gives_the_exact_parallel_plate_capacitance():
    # the field is uniform in each half: P1 is exact (up to round-off)
    exact = 2 * EPSILON_0 * ER * W / (H / 2)
    _, r = thin_electrode({"size": H / 4})
    assert r.capacitance["from_energy"] == pytest.approx(exact, rel=1e-9)
    assert r.capacitance["from_charge"] == pytest.approx(exact, rel=1e-9)


def test_structured_mesh_gives_the_same_exact_capacitance():
    _, r = thin_electrode({"size": H / 4, "controls": [{"target": "diel", "structured": True}]})
    assert r.capacitance["from_energy"] == pytest.approx(2 * EPSILON_0 * ER * W / (H / 2), rel=1e-9)


def test_ring_coax_with_point_picked_conductors_converges_to_the_exact_value():
    a, b = 0.5e-3, 1.7e-3
    exact = 2 * math.pi * EPSILON_0 * 2.1 / math.log(b / a)
    errors = []
    for h in ((b - a) / 4, (b - a) / 8):
        _, r = run(
            {
                "steps": [
                    {
                        "kind": "sector",
                        "name": "ptfe",
                        "cx": 0,
                        "cy": 0,
                        "r": b,
                        "start": 0,
                        "end": 360,
                        "r_inner": a,
                    },
                ],
                "selections": [
                    {"kind": "points", "name": "inner", "points": [[a, 0]]},
                    {"kind": "points", "name": "shield", "points": [[0, -b]]},
                ],
                "mesh": {"size": h, "elements_per_circle": round(2 * math.pi * a / h * 4)},
            },
            {"ptfe": 2.1},
            [
                {"type": "potential", "boundary": "inner", "value": 1},
                {"type": "ground", "boundary": "shield"},
            ],
        )
        errors.append(abs(r.capacitance["from_energy"] / exact - 1))
    assert errors[1] < 2e-3
    assert errors[1] < errors[0] / 2.5  # ~h² under refinement


def _coax(mesh_settings: dict):
    a, b = 0.5e-3, 1.7e-3
    return run(
        {
            "steps": [
                {"kind": "circle", "name": "ptfe", "cx": 0, "cy": 0, "r": b},
                {"kind": "circle", "name": "inner", "cx": 0, "cy": 0, "r": a},
            ],
            "holes": ["inner"],
            "mesh": mesh_settings,
        },
        {"ptfe": 2.1},
        [
            {"type": "potential", "boundary": "inner", "value": 1},
            {"type": "ground", "boundary": "outer"},
        ],
    )


def _space_charge(controls: list, size: float):
    """A charge layer ρ₀·e^(−y/δ) on a grounded plate, grounded plate at y = H:
    the field changes on the scale δ ≪ H next to the bottom plate."""
    h, delta = 0.01, 0.0002
    sel = [
        {"kind": "box", "name": "bottom", "xmin": 0, "ymin": 0, "xmax": h, "ymax": 0},
        {"kind": "box", "name": "top", "xmin": 0, "ymin": h, "xmax": h, "ymax": h},
    ]
    geometry = {
        "steps": [{"kind": "rectangle", "name": "d", "x": 0, "y": 0, "width": h, "height": h}],
        "selections": sel,
        "mesh": {"size": size, "controls": controls},
    }
    mesh = mesh_geometry(Geometry.model_validate(geometry)).mesh
    problem = Electrostatics.model_validate(
        {
            "parameters": {"rho0": 1e-3, "delta": delta},
            "materials": {"d": {"name": "d", "relative_permittivity": 1}},
            "boundary_conditions": [
                {"type": "ground", "boundary": "bottom"},
                {"type": "ground", "boundary": "top"},
            ],
            # e^x written as a power: the expression language has no exp
            "sources": [
                {
                    "type": "charge_density",
                    "domain": "d",
                    "value": "rho0*2.718281828459045**(-y/delta)",
                }
            ],
        }
    )
    # exact: −εV″ = ρ₀e^(−y/δ), V(0) = V(H) = 0 → V′ = (ρ₀δ/ε)e^(−y/δ) + A
    eps = EPSILON_0
    b = 1e-3 * delta**2 / eps
    a = b * (math.exp(-h / delta) - 1) / h
    y = np.linspace(0, h, 2_000_001)
    exact = 0.5 * eps * np.trapezoid(((1e-3 * delta / eps) * np.exp(-y / delta) + a) ** 2, y) * h
    return mesh, abs(solve(problem, mesh).energy / exact - 1)


def test_boundary_layer_resolves_a_thin_charge_layer():
    """Rows of thin elements along the plate: as accurate as refining
    isotropically to the same size there, with far fewer nodes."""
    delta, size = 0.0002, 0.001
    layer = {
        "target": "bottom",
        "boundary_layer": {"first": delta / 4, "growth": 1.3, "layers": 12},
    }
    _, plain = _space_charge([], size)
    m_layer, layered = _space_charge([layer], size)
    m_iso, iso = _space_charge([{"target": "bottom", "size": delta / 4}], size)
    assert plain > 0.5  # δ = H/50 is invisible to elements of H/10
    assert layered < 0.02 and layered < plain / 40
    assert layered < 2 * iso and m_layer.n_nodes < 0.6 * m_iso.n_nodes


def test_quadrilateral_meshes_are_for_export_only():
    from fem_solver import SetupError

    with pytest.raises(SetupError, match="triangles"):
        _coax({"size": 2e-4, "element": "quad"})
