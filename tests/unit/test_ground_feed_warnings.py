"""Warnings for antennas fed against ground (node 0) without a ground plane."""

from backend.preprocessor.builders import (
    create_dipole,
    create_loop,
    create_rod,
    dipole_to_mesh,
    loop_to_mesh,
    rod_to_mesh,
)
from backend.solver.schemas import AntennaInput, CurrentSourceInput, VoltageSourceInput
from backend.solver.solver import ground_feed_warnings, solve_multi_antenna

ONE_VOLT = {"type": "voltage", "amplitude": {"real": 1.0, "imag": 0.0}}


def _antenna(element, mesh, antenna_id="a1") -> AntennaInput:
    return AntennaInput(
        antenna_id=antenna_id,
        nodes=mesh.nodes,
        edges=mesh.edges,
        radii=mesh.radii,
        voltage_sources=[
            VoltageSourceInput(node_start=s.node_start, node_end=s.node_end, value=s.amplitude)
            for s in element.sources
        ],
    )


def test_balanced_gap_dipole_is_fine():
    el = create_dipole(length=0.5, gap=0.01, segments=10, source=ONE_VOLT)
    assert ground_feed_warnings([_antenna(el, dipole_to_mesh(el))]) == []


def test_loops_are_fine():
    for gap in (0.0, 0.002):
        el = create_loop(radius=0.05, gap=gap, segments=10, source=ONE_VOLT)
        assert ground_feed_warnings([_antenna(el, loop_to_mesh(el))]) == []


def test_rod_fed_at_its_base_warns():
    el = create_rod(length=0.25, segments=10, source=ONE_VOLT)
    (warning,) = ground_feed_warnings([_antenna(el, rod_to_mesh(el), "rod1")])
    assert warning.startswith("rod1: fed against ground")


def test_single_terminal_current_source_warns():
    el = create_dipole(length=0.5, gap=0.0, segments=10)
    mesh = dipole_to_mesh(el)
    antenna = AntennaInput(
        antenna_id="d",
        nodes=mesh.nodes,
        edges=mesh.edges,
        radii=mesh.radii,
        current_sources=[CurrentSourceInput(node=6, value=1.0)],
    )
    assert len(ground_feed_warnings([antenna])) == 1


def test_warnings_reach_the_response():
    el = create_rod(length=0.25, segments=10, source=ONE_VOLT)
    result = solve_multi_antenna([_antenna(el, rod_to_mesh(el), "rod1")], 300e6)
    assert len(result["warnings"]) == 1
