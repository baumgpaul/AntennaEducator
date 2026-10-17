"""`converged` reflects the actual solution (TEST_PLAN B28; was hardcoded True)."""

from types import SimpleNamespace
from unittest.mock import patch

import numpy as np

from backend.solver.schemas import AntennaInput
from backend.solver.solver import solve_multi_antenna

ANTENNA = AntennaInput(
    antenna_id="a",
    nodes=[[0, 0, -0.25], [0, 0, 0], [0, 0, 0.25]],
    edges=[[1, 2], [2, 3]],
    radii=[0.001, 0.001],
    voltage_sources=[{"node_start": 2, "node_end": 0, "value": 1}],
)


def test_real_solve_reports_converged():
    result = solve_multi_antenna(antennas=[ANTENNA], frequency=3e8)
    assert result["converged"] is True


def test_non_finite_solution_reports_not_converged():
    bad = SimpleNamespace(branch_currents=np.array([np.nan, 1.0]))
    with (
        patch("backend.solver.solver.solve_single_frequency", return_value=bad),
        patch("backend.solver.solver.distribute_solution", return_value=[]),
    ):
        result = solve_multi_antenna(antennas=[ANTENNA], frequency=3e8)
    assert result["converged"] is False
