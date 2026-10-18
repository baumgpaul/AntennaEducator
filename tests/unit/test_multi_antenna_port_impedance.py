"""Multi-antenna path reports the same port impedance as the single path.

Regression: distribute_solution indexed the merged source list with a
branch-current index, found no sources, fell back to 1 V and reported half the
impedance of every balanced-feed (gap) dipole.
"""

import numpy as np
import pytest

from backend.preprocessor.builders import create_dipole, dipole_to_mesh
from backend.solver.schemas import AntennaInput, SolverConfiguration, VoltageSourceInput
from backend.solver.solver import solve_multi_antenna, solve_peec_frequency_sweep
from backend.solver.system import VoltageSource

FREQ = 300e6


def _dipole(amplitude: float = 1.0, x_offset: float = 0.0):
    element = create_dipole(
        length=0.5,
        wire_radius=0.001,
        gap=0.01,
        segments=20,
        source={"type": "voltage", "amplitude": amplitude},
        name="d",
    )
    mesh = dipole_to_mesh(element)
    nodes = [[x + x_offset, y, z] for x, y, z in mesh.nodes]
    return element, mesh, nodes


def _antenna_input(antenna_id: str, amplitude: float = 1.0, x_offset: float = 0.0):
    element, mesh, nodes = _dipole(amplitude, x_offset)
    return AntennaInput(
        antenna_id=antenna_id,
        nodes=nodes,
        edges=mesh.edges,
        radii=mesh.radii,
        voltage_sources=[
            VoltageSourceInput(node_start=s.node_start, node_end=s.node_end, value=s.amplitude)
            for s in element.sources
        ],
    )


@pytest.fixture(scope="module")
def z_single_path():
    element, mesh, nodes = _dipole()
    sources = [VoltageSource(s.node_start, s.node_end, s.amplitude) for s in element.sources]
    result = solve_peec_frequency_sweep(
        np.array(nodes), mesh.edges, np.array(mesh.radii), np.array([FREQ]), sources
    )
    return result.frequency_solutions[0].input_impedance


def _z(solution) -> complex:
    return complex(solution["input_impedance"])


def test_one_antenna_matches_single_path(z_single_path):
    result = solve_multi_antenna([_antenna_input("a")], FREQ, SolverConfiguration())
    assert _z(result["antenna_solutions"][0]) == pytest.approx(z_single_path, rel=1e-9)


def test_second_antenna_uses_its_own_sources(z_single_path):
    """Far apart (100 λ), each dipole sees ~its isolated impedance; the second is
    driven at 2 V, which must not change Z."""
    result = solve_multi_antenna(
        [_antenna_input("a"), _antenna_input("b", amplitude=2.0, x_offset=100.0)],
        FREQ,
        SolverConfiguration(),
    )
    for sol in result["antenna_solutions"]:
        assert _z(sol) == pytest.approx(z_single_path, rel=1e-2), sol["antenna_id"]
