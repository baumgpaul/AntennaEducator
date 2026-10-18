"""Small-loop impedance and loop feeds.

A closed loop used to be fed across a whole missing segment (the source
replaced the closing edge), which radiated as an extra small dipole: R was
4-10x the small-loop value 20π²(C/λ)⁴ and depended on the mesh. Gapped loops
were fed from ground to one side only (net charge on the wire).
"""

import numpy as np
import pytest

from backend.preprocessor.builders import create_loop, loop_to_mesh
from backend.solver.solver import SolverConfiguration, solve_peec_frequency_sweep
from backend.solver.system import CurrentSource, VoltageSource

CIRCUMFERENCE = 0.4
WIRE_RADIUS = 0.001
LOSSLESS = SolverConfiguration(resistivity=1e-30)


def _loop_impedance(freq: float, gap: float = 0.0, kind: str = "voltage", segments: int = 20):
    element = create_loop(
        radius=CIRCUMFERENCE / (2 * np.pi),
        wire_radius=WIRE_RADIUS,
        gap=gap,
        segments=segments,
        source={"type": kind, "amplitude": {"real": 1.0, "imag": 0.0}},
    )
    mesh = loop_to_mesh(element)
    src = element.sources[0]
    vs = [VoltageSource(src.node_start, src.node_end, src.amplitude)] if kind == "voltage" else []
    cs = (
        [CurrentSource(node=src.node_start, value=src.amplitude, node_end=src.node_end)]
        if kind == "current"
        else []
    )
    result = solve_peec_frequency_sweep(
        np.array(mesh.nodes),
        mesh.edges,
        np.array(mesh.radii),
        np.array([freq]),
        voltage_sources=vs,
        current_sources=cs,
        config=LOSSLESS,
    )
    return result.frequency_solutions[0].input_impedance


@pytest.mark.solver
@pytest.mark.parametrize("segments", [20, 40])
def test_small_loop_radiation_resistance(segments):
    freq = 0.04 * 299_792_458.0 / CIRCUMFERENCE  # C/λ = 0.04
    r_theory = 20 * np.pi**2 * 0.04**4  # ≈ 0.5 mΩ
    z = _loop_impedance(freq, segments=segments)
    assert 0.8 * r_theory < z.real < 2.0 * r_theory, f"R = {z.real * 1e3:.3f} mOhm"


@pytest.mark.solver
def test_small_loop_inductance():
    """X = ωL with L = μ0 b (ln(8b/a) - 2) for a circular loop of radius b."""
    freq = 30e6
    b = CIRCUMFERENCE / (2 * np.pi)
    inductance = 4e-7 * np.pi * b * (np.log(8 * b / WIRE_RADIUS) - 2)
    z = _loop_impedance(freq)
    assert z.imag == pytest.approx(2 * np.pi * freq * inductance, rel=0.05)


@pytest.mark.solver
@pytest.mark.parametrize("gap, kind", [(0.002, "voltage"), (0.002, "current"), (0.0, "current")])
def test_all_loop_feeds_agree(gap, kind):
    """Closed or gapped, voltage or current fed: the same small loop."""
    z_ref = _loop_impedance(60e6)
    assert _loop_impedance(60e6, gap=gap, kind=kind) == pytest.approx(z_ref, rel=0.02)


def test_gapped_loop_is_fed_across_the_gap():
    for kind in ("voltage", "current"):
        el = create_loop(
            radius=0.05,
            gap=0.002,
            segments=10,
            source={"type": kind, "amplitude": {"real": 1.0, "imag": 0.0}},
        )
        nodes = {el.sources[0].node_start, el.sources[0].node_end}
        assert nodes == {1, 11}, f"{kind}: {nodes}"
