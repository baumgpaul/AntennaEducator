"""Electrostatics on models only geometry v2 can describe: thin (1D) electrodes,
structured meshes, rings, point-picked boundaries. Analytic references."""

import math

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
