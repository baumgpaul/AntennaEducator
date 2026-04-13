"""
Integration test: Half-Wave Dipole via Preprocessor Path
==========================================================
Verifies that `create_dipole` + `dipole_to_mesh` produce a mesh that, when
solved using the preprocessor's balanced-source convention, reproduces the
GOLD STANDARD impedance (~73 Ω) from `test_halfwave_dipole_complete.py`.

Frontend parameters that reproduce the gold standard:
  length=0.5 m, gap=0.05 m, segments=10, wire_radius=0.001 m
  frequency=299.792458 MHz, voltage source amplitude=1 V, feed=gap

The preprocessor generates two ±1 V sources from ground (balanced feed).
The frontend's multiAntennaBuilder passes them unchanged to the solver.
The solver computes Z = V_src1 / I_branch1 = ~73 Ω, matching the gold standard.

PEEC FACTOR-OF-2 NOTE
----------------------
A single 1 V gap source (node_gap_lower → node_gap_upper) yields Z ≈ 146 Ω
because the solver formula (Z = V_source / I_source) gives double the answer
when the balanced ±1 V sources span an effective 2 V differential.
The balanced convention is the physically correct one for this PEEC formulation
and matches standard dipole theory (Z ≈ 73 Ω).
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
# Solver tests — balanced source convention (= gold standard)
# ===========================================================================


@pytest.mark.solver
class TestPreprocessorDipoleImpedance:
    """Verify solver results for the preprocessor path match the gold standard."""

    @pytest.fixture(scope="class")
    def result_balanced(self):
        """Solve using the balanced ±1 V sources that the preprocessor generates."""
        element, mesh = _build_mesh()
        nodes = np.array(mesh.nodes)
        vs = [
            VoltageSource(node_start=s.node_start, node_end=s.node_end, value=complex(s.amplitude))
            for s in element.sources
        ]
        return solve_peec_frequency_sweep(
            nodes=nodes,
            edges=mesh.edges,
            radii=np.array(mesh.radii),
            frequencies=np.array([FREQUENCY]),
            voltage_sources=vs,
            reference_impedance=REFERENCE_IMPEDANCE,
        )

    @pytest.fixture(scope="class")
    def result_gap_source(self):
        """Solve using the 1 V gap source produced by multiAntennaBuilder's conversion."""
        element, mesh = _build_mesh()
        nodes = np.array(mesh.nodes)
        s1, s2 = element.sources
        gap_vs = VoltageSource(
            node_start=s1.node_end, node_end=s2.node_end, value=complex(s1.amplitude)
        )
        return solve_peec_frequency_sweep(
            nodes=nodes,
            edges=mesh.edges,
            radii=np.array(mesh.radii),
            frequencies=np.array([FREQUENCY]),
            voltage_sources=[gap_vs],
            reference_impedance=REFERENCE_IMPEDANCE,
        )

    # --- Balanced source path (same convention as gold standard) ---

    def test_balanced_resistance_matches_gold_standard(self, result_balanced):
        """Balanced ±1 V path: resistance ≈ 73 Ω (gold standard tolerance ±20 Ω)."""
        z = result_balanced.frequency_solutions[0].input_impedance
        assert (
            abs(z.real - 73.0) < 20.0
        ), f"Resistance {z.real:.2f} Ω deviates from 73 Ω by more than 20 Ω"

    def test_balanced_resistance_precise(self, result_balanced):
        """Balanced ±1 V path: resistance is within 5 Ω of gold standard value (73.07 Ω)."""
        z = result_balanced.frequency_solutions[0].input_impedance
        # Gold standard measured value: 73.07 Ω
        assert (
            abs(z.real - 73.07) < 5.0
        ), f"Preprocessor path resistance {z.real:.2f} Ω diverges from gold standard 73.07 Ω"

    def test_balanced_reactance_within_tolerance(self, result_balanced):
        """Balanced ±1 V path: reactance < 120 Ω (coarse-mesh tolerance from gold standard)."""
        z = result_balanced.frequency_solutions[0].input_impedance
        assert abs(z.imag) < 120.0, f"Reactance {z.imag:.2f} Ω exceeds 120 Ω tolerance"

    # --- PEEC factor-of-2 property: gap source gives 2× the balanced-source Z ---

    def test_peec_gap_source_resistance_is_double_balanced(
        self, result_balanced, result_gap_source
    ):
        """PEEC property: a single 1 V gap source gives ~2× the resistance of balanced ±1 V sources.

        This is NOT the frontend path (multiAntennaBuilder passes balanced sources unchanged).
        It documents a PEEC formulation characteristic so any change in that behavior is caught.
        """
        z_bal = result_balanced.frequency_solutions[0].input_impedance
        z_gap = result_gap_source.frequency_solutions[0].input_impedance
        ratio = z_gap.real / z_bal.real
        assert abs(ratio - 2.0) < 0.1, (
            f"Expected gap/balanced resistance ratio ≈ 2.0, got {ratio:.3f} "
            f"(Z_gap={z_gap.real:.1f} Ω, Z_bal={z_bal.real:.1f} Ω)"
        )

    def test_peec_gap_source_resistance_approx_146_ohm(self, result_gap_source):
        """PEEC property: single 1 V gap source gives ≈ 146 Ω (2× gold-standard 73 Ω).

        The frontend passes balanced ±1 V sources (not this gap convention), so the
        displayed impedance is ~73 Ω, not 146 Ω.
        """
        z = result_gap_source.frequency_solutions[0].input_impedance
        assert (
            abs(z.real - 146.0) < 20.0
        ), f"Single gap source resistance {z.real:.2f} Ω not ≈ 146 Ω (PEEC factor-of-2 property)"
