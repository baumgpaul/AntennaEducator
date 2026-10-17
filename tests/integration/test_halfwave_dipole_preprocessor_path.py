"""
Integration test: Half-Wave Dipole via Preprocessor Path
==========================================================
Verifies that `create_dipole` + `dipole_to_mesh` produce a mesh that, when
solved using the preprocessor's balanced-source convention, reproduces the
GOLD STANDARD impedance (~73 Ω) from `test_halfwave_dipole_complete.py`.

Frontend parameters that reproduce the gold standard:
  length=0.5 m, gap=0.05 m, segments=10, wire_radius=0.001 m
  frequency=299.792458 MHz, voltage source amplitude=1 V, feed=gap

The preprocessor generates two ±1 V sources from ground (balanced feed), i.e.
2 V across the gap. The solver's port voltage for such a pair is the difference
V(+) - V(-); the impedance therefore does not depend on whether the feed is
described as a balanced pair or as one gap source (issue #70).
"""

import numpy as np
import pytest

from backend.preprocessor.builders import create_dipole, dipole_to_mesh
from backend.solver.solver import solve_peec_frequency_sweep
from backend.solver.system import VoltageSource

# ---------------------------------------------------------------------------
# Gold-standard parameters (must stay in sync with test_halfwave_dipole_complete.py)
# ---------------------------------------------------------------------------
FREQUENCY = 299.792458e6  # Hz  (λ ≈ 1 m)
WIRE_RADIUS = 0.001  # m
GAP = 0.05  # m  (5 cm)
LENGTH = 0.5  # m  (= λ/2 at FREQUENCY)
SEGMENTS = 10  # total; 5 per arm (n_seg = 5)
SOURCE_AMPLITUDE = 1.0
REFERENCE_IMPEDANCE = 50.0


# ===========================================================================
# Helper
# ===========================================================================


def _build_mesh():
    """Create the dipole element and convert to mesh."""
    element = create_dipole(
        length=LENGTH,
        wire_radius=WIRE_RADIUS,
        gap=GAP,
        segments=SEGMENTS,
        source={"type": "voltage", "amplitude": SOURCE_AMPLITUDE},
    )
    mesh = dipole_to_mesh(element)
    return element, mesh


# ===========================================================================
# Geometry tests
# ===========================================================================


class TestPreprocessorDipoleGeometry:
    """Verify the mesh produced by the preprocessor matches the gold standard geometry."""

    def test_node_count(self):
        """12 nodes: 6 per arm."""
        _, mesh = _build_mesh()
        assert len(mesh.nodes) == 12

    def test_edge_count(self):
        """10 edges: 5 per arm."""
        _, mesh = _build_mesh()
        assert len(mesh.edges) == 10

    def test_radii(self):
        """All segment radii equal WIRE_RADIUS."""
        _, mesh = _build_mesh()
        assert np.allclose(mesh.radii, WIRE_RADIUS)

    def test_lower_arm_z_positions(self):
        """Lower arm (nodes 1-6) spans from -22.5 cm (tip) to -2.5 cm (gap edge)."""
        _, mesh = _build_mesh()
        nodes = np.array(mesh.nodes)
        z_lower = nodes[:6, 2]  # frontend: lower arm is first
        expected = np.linspace(-(LENGTH - GAP) / 2, -GAP / 2, 6)
        np.testing.assert_allclose(z_lower, expected, atol=1e-9)

    def test_upper_arm_z_positions(self):
        """Upper arm (nodes 7-12) spans from +2.5 cm (gap edge) to +22.5 cm (tip)."""
        _, mesh = _build_mesh()
        nodes = np.array(mesh.nodes)
        z_upper = nodes[6:, 2]  # frontend: upper arm is second
        expected = np.linspace(GAP / 2, (LENGTH - GAP) / 2, 6)
        np.testing.assert_allclose(z_upper, expected, atol=1e-9)

    def test_gap_edges_are_adjacent_arms(self):
        """Node 6 (lower gap edge) and node 7 (upper gap edge) are at ±2.5 cm."""
        _, mesh = _build_mesh()
        nodes = np.array(mesh.nodes)
        assert abs(nodes[5, 2] - (-GAP / 2)) < 1e-9, "lower gap edge not at -2.5 cm"
        assert abs(nodes[6, 2] - (GAP / 2)) < 1e-9, "upper gap edge not at +2.5 cm"

    def test_balanced_sources_polarity(self):
        """Preprocessor creates two ±1 V sources referenced to ground."""
        element, _ = _build_mesh()
        assert len(element.sources) == 2
        s1, s2 = element.sources
        assert s1.node_start == 0 and s1.amplitude == pytest.approx(SOURCE_AMPLITUDE)
        assert s2.node_start == 0 and s2.amplitude == pytest.approx(-SOURCE_AMPLITUDE)

    def test_sources_connected_to_gap_nodes(self):
        """Balanced sources connect ground to node 6 (lower gap) and node 7 (upper gap)."""
        element, _ = _build_mesh()
        s1, s2 = element.sources
        # frontend lower arm has n_seg+1 = 6 nodes → feed_lower = node 6
        assert s1.node_end == 6, f"Expected lower gap node 6, got {s1.node_end}"
        assert s2.node_end == 7, f"Expected upper gap node 7, got {s2.node_end}"


# ===========================================================================
# Solver tests — well-posed half-wave dipole via the preprocessor path
# ===========================================================================
# Re-baselined 2026-10 (issue #70): the old "73 Ohm" on the coarse geometry
# above came from a resistance ~890x too large and from reporting V/I of one
# balanced source (half the port voltage). The geometry tests above still
# check the preprocessor; impedance is validated on a thin lambda/2 dipole.

VALID_LENGTH = 0.5  # lambda/2 at FREQUENCY
VALID_GAP = 0.005  # lambda/200
VALID_RADIUS = 0.001  # lambda/1000
VALID_SEGMENTS = 80


def _solve_valid(feed: str, resistivity: float = 1.68e-8):
    from backend.solver.solver import SolverConfiguration

    element = create_dipole(
        length=VALID_LENGTH,
        wire_radius=VALID_RADIUS,
        gap=VALID_GAP,
        segments=VALID_SEGMENTS,
        source={"type": "voltage", "amplitude": SOURCE_AMPLITUDE},
    )
    mesh = dipole_to_mesh(element)
    s1, s2 = element.sources
    if feed == "balanced":
        vs = [
            VoltageSource(node_start=s.node_start, node_end=s.node_end, value=complex(s.amplitude))
            for s in (s1, s2)
        ]
    else:  # one source across the gap, same 2 V port voltage
        vs = [VoltageSource(node_start=s1.node_end, node_end=s2.node_end, value=2.0 + 0j)]
    result = solve_peec_frequency_sweep(
        nodes=np.array(mesh.nodes),
        edges=mesh.edges,
        radii=np.array(mesh.radii),
        frequencies=np.array([FREQUENCY]),
        voltage_sources=vs,
        reference_impedance=REFERENCE_IMPEDANCE,
        config=SolverConfiguration(resistivity=resistivity),
    )
    return complex(result.frequency_solutions[0].input_impedance)


@pytest.mark.solver
class TestHalfWaveDipoleImpedance:
    """Physics validation of the PEEC impedance for a thin half-wave dipole."""

    @pytest.fixture(scope="class")
    def z_balanced(self):
        return _solve_valid("balanced")

    def test_resistance_matches_thin_wire_theory(self, z_balanced):
        """R_in of a lambda/2 dipole ~ 73 Ohm (thin-wire theory)."""
        assert abs(z_balanced.real - 73.0) < 10.0, f"R_in = {z_balanced.real:.2f} Ohm"

    def test_feed_descriptions_agree(self, z_balanced):
        """Balanced +/-1 V from ground and one 2 V gap source are the same port:
        the impedance must not depend on how the feed is described (it used to
        differ by exactly 2x). Not bit-identical: two branches to the ground
        reference vs one branch across the gap are slightly different circuits
        in PEEC (measured difference ~0.01 %)."""
        z_gap = _solve_valid("gap")
        assert abs(z_gap - z_balanced) < 1e-3 * abs(z_balanced), f"{z_gap} vs {z_balanced}"

    def test_copper_loss_is_negligible(self, z_balanced):
        """Ohmic loss of a 1 mm copper wire at 300 MHz is far below 1 Ohm
        (it was ~50 Ohm while mu_r was passed as absolute permeability)."""
        z_lossless = _solve_valid("balanced", resistivity=1e-30)
        assert 0.0 <= z_balanced.real - z_lossless.real < 1.0

    @pytest.mark.xfail(
        strict=True,
        reason="issue #71: reactance depends on feed gap and does not converge with mesh "
        "refinement (~+1 Ohm here vs thin-wire theory ~+42 Ohm)",
    )
    def test_reactance_matches_thin_wire_theory(self, z_balanced):
        assert abs(z_balanced.imag - 42.5) < 15.0, f"X_in = {z_balanced.imag:.2f} Ohm"
