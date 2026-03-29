"""
Unit tests for multi-antenna solver functions.

Tests merge_antennas(), distribute_solution(), and solve_multi_antenna()
with various antenna configurations.
"""

import numpy as np
import pytest

from backend.solver.schemas import AntennaInput, CurrentSourceInput, VoltageSourceInput
from backend.solver.solver import SolverConfiguration, merge_antennas, solve_multi_antenna


class TestMergeAntennas:
    """Test antenna merging and node renumbering."""

    def test_single_antenna_merge(self):
        """Test merging single antenna preserves geometry."""
        antenna = AntennaInput(
            antenna_id="dipole_1",
            nodes=[[0.0, 0.0, 0.0], [0.0, 0.0, 0.5]],
            edges=[[1, 2]],
            radii=[0.001],
            voltage_sources=[VoltageSourceInput(node_start=1, node_end=2, value=1.0)],
        )

        config = SolverConfiguration()
        merged = merge_antennas([antenna], config)

        # Check dimensions
        assert merged.n_total_sticks == 1
        assert merged.n_total_points == 2
        assert merged.n_total_voltage_sources == 1
        assert len(merged.nodes) == 2
        assert len(merged.edges) == 1
        assert len(merged.radii) == 1

        # Check node coordinates unchanged
        np.testing.assert_array_almost_equal(merged.nodes[0], [0.0, 0.0, 0.0])
        np.testing.assert_array_almost_equal(merged.nodes[1], [0.0, 0.0, 0.5])

        # Check edges unchanged (1-based)
        assert merged.edges[0] == [1, 2]

        # Check voltage source unchanged
        assert merged.voltage_sources[0].node_start == 1
        assert merged.voltage_sources[0].node_end == 2

        # Check offsets
        assert len(merged.antenna_offsets) == 1
        offset = merged.antenna_offsets[0]
        assert offset["antenna_id"] == "dipole_1"
        assert offset["start_stick"] == 1
        assert offset["n_sticks"] == 1
        assert offset["start_point"] == 1
        assert offset["n_points"] == 2

    def test_two_antenna_merge_node_renumbering(self):
        """Test merging two antennas renumbers nodes correctly."""
        antenna1 = AntennaInput(
            antenna_id="dipole_1",
            nodes=[[0.0, 0.0, 0.0], [0.0, 0.0, 0.5]],
            edges=[[1, 2]],
            radii=[0.001],
            voltage_sources=[VoltageSourceInput(node_start=1, node_end=2, value=1.0)],
        )

        antenna2 = AntennaInput(
            antenna_id="dipole_2",
            nodes=[[1.0, 0.0, 0.0], [1.0, 0.0, 0.5]],
            edges=[[1, 2]],
            radii=[0.001],
            voltage_sources=[VoltageSourceInput(node_start=1, node_end=2, value=1.0)],
        )

        config = SolverConfiguration()
        merged = merge_antennas([antenna1, antenna2], config)

        # Check dimensions
        assert merged.n_total_sticks == 2
        assert merged.n_total_points == 4
        assert merged.n_total_voltage_sources == 2

        # Check node coordinates combined
        assert len(merged.nodes) == 4
        np.testing.assert_array_almost_equal(merged.nodes[0], [0.0, 0.0, 0.0])
        np.testing.assert_array_almost_equal(merged.nodes[2], [1.0, 0.0, 0.0])

        # Check edges renumbered
        # First antenna: nodes 1,2 unchanged
        # Second antenna: nodes 1,2 -> 3,4
        assert merged.edges[0] == [1, 2]
        assert merged.edges[1] == [3, 4]

        # Check voltage sources renumbered
        assert merged.voltage_sources[0].node_start == 1
        assert merged.voltage_sources[0].node_end == 2
        assert merged.voltage_sources[1].node_start == 3
        assert merged.voltage_sources[1].node_end == 4

        # Check offsets
        assert len(merged.antenna_offsets) == 2

        offset1 = merged.antenna_offsets[0]
        assert offset1["antenna_id"] == "dipole_1"
        assert offset1["start_stick"] == 1
        assert offset1["n_sticks"] == 1
        assert offset1["start_point"] == 1
        assert offset1["n_points"] == 2

        offset2 = merged.antenna_offsets[1]
        assert offset2["antenna_id"] == "dipole_2"
        assert offset2["start_stick"] == 2
        assert offset2["n_sticks"] == 1
        assert offset2["start_point"] == 3
        assert offset2["n_points"] == 2

    def test_negative_node_indices_renumbering(self):
        """Test renumbering of negative (appended) nodes."""
        antenna = AntennaInput(
            antenna_id="dipole_1",
            nodes=[[0.0, 0.0, 0.0]],
            edges=[[1, -1]],  # Edge to ground
            radii=[0.001],
            voltage_sources=[VoltageSourceInput(node_start=1, node_end=-1, value=1.0)],
        )

        config = SolverConfiguration()
        merged = merge_antennas([antenna], config)

        # Check negative indices unchanged for first antenna
        assert merged.edges[0] == [1, -1]
        assert merged.voltage_sources[0].node_start == 1
        assert merged.voltage_sources[0].node_end == -1

        # Check appended node count
        assert merged.n_total_appended == 1


class TestSolveMultiAntenna:
    """Integration tests for complete multi-antenna solving."""

    def test_single_dipole_solve(self):
        """Test solving single dipole matches expected impedance."""
        # Simple dipole at 100 MHz
        wavelength = 3e8 / 100e6  # 3 meters
        dipole_length = wavelength / 2  # Half-wave dipole

        antenna = AntennaInput(
            antenna_id="dipole_1",
            nodes=[
                [0.0, 0.0, -dipole_length / 2],
                [0.0, 0.0, -0.01],
                [0.0, 0.0, 0.01],
                [0.0, 0.0, dipole_length / 2],
            ],
            edges=[[1, 2], [3, 4]],
            radii=[0.001, 0.001],
            voltage_sources=[VoltageSourceInput(node_start=2, node_end=3, value=1.0)],
        )

        config = SolverConfiguration(gauss_order=2)
        result = solve_multi_antenna([antenna], 100e6, config)

        # Check response structure
        assert result["frequency"] == 100e6
        assert result["converged"] is True
        assert len(result["antenna_solutions"]) == 1

        # Check antenna solution
        sol = result["antenna_solutions"][0]
        assert sol["antenna_id"] == "dipole_1"
        assert len(sol["branch_currents"]) == 2
        assert len(sol["node_voltages"]) == 4
        assert sol["input_impedance"] is not None

        # Check impedance is in reasonable range for dipole
        Z = sol["input_impedance"]
        Z_real = Z.real if isinstance(Z, complex) else Z
        assert 20 < Z_real < 1000, f"Expected reasonable resistance 20-1000Ω, got {Z_real}Ω"

    def test_two_dipole_array_solve(self):
        """Test solving two-dipole array."""
        # Two identical dipoles spaced 0.5m apart
        wavelength = 3e8 / 100e6
        dipole_length = wavelength / 4  # Quarter-wave for faster solve

        antenna1 = AntennaInput(
            antenna_id="dipole_1",
            nodes=[[0.0, 0.0, 0.0], [0.0, 0.0, dipole_length]],
            edges=[[1, 2]],
            radii=[0.001],
            voltage_sources=[VoltageSourceInput(node_start=1, node_end=2, value=1.0)],
        )

        antenna2 = AntennaInput(
            antenna_id="dipole_2",
            nodes=[[0.5, 0.0, 0.0], [0.5, 0.0, dipole_length]],
            edges=[[1, 2]],
            radii=[0.001],
            voltage_sources=[VoltageSourceInput(node_start=1, node_end=2, value=1.0)],
        )

        config = SolverConfiguration(gauss_order=2)
        result = solve_multi_antenna([antenna1, antenna2], 100e6, config)

        # Check response structure
        assert len(result["antenna_solutions"]) == 2

        # Check both antennas have solutions
        sol1 = result["antenna_solutions"][0]
        sol2 = result["antenna_solutions"][1]

        assert sol1["antenna_id"] == "dipole_1"
        assert sol2["antenna_id"] == "dipole_2"

        assert len(sol1["branch_currents"]) == 1
        assert len(sol2["branch_currents"]) == 1

        assert sol1["input_impedance"] is not None
        assert sol2["input_impedance"] is not None

        # Antennas should have similar (but not identical due to coupling) impedances
        Z1 = sol1["input_impedance"]
        Z2 = sol2["input_impedance"]
        Z1_mag = abs(Z1) if isinstance(Z1, complex) else abs(complex(Z1))
        Z2_mag = abs(Z2) if isinstance(Z2, complex) else abs(complex(Z2))

        # Should be within 50% of each other (loose tolerance for coupled system)
        ratio = Z1_mag / Z2_mag if Z2_mag > 0 else 1.0
        assert 0.5 < ratio < 2.0, f"Impedance ratio {ratio} suggests incorrect coupling"


class TestMergeAntennasCurrentSource:
    """Test merging antennas with current sources."""

    def test_single_antenna_with_current_source(self):
        """Test merging antenna with current source correctly counts appended nodes."""
        antenna = AntennaInput(
            antenna_id="dipole_cs",
            nodes=[[0.0, 0.0, 0.0], [0.0, 0.0, 0.5]],
            edges=[[1, 2]],
            radii=[0.001],
            current_sources=[CurrentSourceInput(node=1, value=0.001)],
        )

        config = SolverConfiguration()
        merged = merge_antennas([antenna], config)

        assert merged.n_total_sticks == 1
        assert merged.n_total_points == 2
        assert merged.n_total_current_sources == 1
        assert merged.current_sources[0].node == 1

    def test_two_antennas_with_current_sources_renumbering(self):
        """Test merging two antennas with current sources renumbers nodes."""
        antenna1 = AntennaInput(
            antenna_id="dipole_1",
            nodes=[[0.0, 0.0, 0.0], [0.0, 0.0, 0.5]],
            edges=[[1, 2]],
            radii=[0.001],
            current_sources=[CurrentSourceInput(node=1, value=0.001)],
        )

        antenna2 = AntennaInput(
            antenna_id="dipole_2",
            nodes=[[1.0, 0.0, 0.0], [1.0, 0.0, 0.5]],
            edges=[[1, 2]],
            radii=[0.001],
            current_sources=[CurrentSourceInput(node=2, value=0.002)],
        )

        config = SolverConfiguration()
        merged = merge_antennas([antenna1, antenna2], config)

        assert merged.n_total_current_sources == 2
        # First antenna's current source node unchanged
        assert merged.current_sources[0].node == 1
        # Second antenna's current source node renumbered: 2 + 2 (offset) = 4
        assert merged.current_sources[1].node == 4

    def test_current_source_solve(self):
        """Test solving with current source excitation produces valid result."""
        antenna = AntennaInput(
            antenna_id="dipole_cs",
            nodes=[
                [0.0, 0.0, 0.0],
                [0.0, 0.0, 0.25],
                [0.0, 0.0, 0.5],
            ],
            edges=[[1, 2], [2, 3]],
            radii=[0.001, 0.001],
            current_sources=[CurrentSourceInput(node=2, value=0.001)],
        )

        config = SolverConfiguration(gauss_order=2)
        result = solve_multi_antenna([antenna], 300e6, config)

        assert result["converged"] is True
        assert len(result["antenna_solutions"]) == 1
        sol = result["antenna_solutions"][0]
        assert sol["antenna_id"] == "dipole_cs"
        assert len(sol["node_voltages"]) == 3


class TestParasiticElements:
    """Test multi-antenna solving with parasitic (sourceless) elements."""

    def test_merge_parasitic_element(self):
        """Parasitic element (no sources) merges without error."""
        driven = AntennaInput(
            antenna_id="driven",
            nodes=[[0.0, 0.0, -0.25], [0.0, 0.0, 0.25]],
            edges=[[1, 2]],
            radii=[0.001],
            voltage_sources=[VoltageSourceInput(node_start=1, node_end=2, value=1.0)],
        )
        parasitic = AntennaInput(
            antenna_id="reflector",
            nodes=[[0.5, 0.0, -0.25], [0.5, 0.0, 0.25]],
            edges=[[1, 2]],
            radii=[0.001],
        )

        config = SolverConfiguration()
        merged = merge_antennas([driven, parasitic], config)

        assert merged.n_total_sticks == 2
        assert merged.n_total_points == 4
        assert merged.n_total_voltage_sources == 1
        assert len(merged.voltage_sources) == 1

    def test_yagi_three_element_solve(self):
        """Three-element Yagi (reflector + driven + director) solves correctly.

        Only the driven element has a voltage source; the reflector and
        director are parasitic and receive induced currents via mutual coupling.
        """
        freq = 144e6
        wavelength = 3e8 / freq  # ~2.08 m

        # Element lengths (typical Yagi design)
        L_reflector = 0.52 * wavelength
        L_driven = 0.50 * wavelength
        L_director = 0.47 * wavelength

        # X-axis spacing
        x_reflector = -0.20 * wavelength
        x_driven = 0.0
        x_director = 0.20 * wavelength

        n_seg = 5  # Keep low for fast test

        def make_rod(antenna_id, x_pos, length, n_segments):
            half = length / 2
            nodes = []
            for i in range(n_segments + 1):
                z = -half + i * length / n_segments
                nodes.append([x_pos, 0.0, z])
            edges = [[i + 1, i + 2] for i in range(n_segments)]
            radii = [0.001] * n_segments
            return antenna_id, nodes, edges, radii

        _, r_nodes, r_edges, r_radii = make_rod("reflector", x_reflector, L_reflector, n_seg)
        _, d_nodes, d_edges, d_radii = make_rod("driven", x_driven, L_driven, n_seg)
        _, dir_nodes, dir_edges, dir_radii = make_rod("director", x_director, L_director, n_seg)

        # Source at center of driven element
        center = n_seg // 2
        vs = VoltageSourceInput(node_start=center + 1, node_end=center + 2, value=1.0)

        reflector = AntennaInput(
            antenna_id="reflector", nodes=r_nodes, edges=r_edges, radii=r_radii
        )
        driven = AntennaInput(
            antenna_id="driven",
            nodes=d_nodes,
            edges=d_edges,
            radii=d_radii,
            voltage_sources=[vs],
        )
        director = AntennaInput(
            antenna_id="director", nodes=dir_nodes, edges=dir_edges, radii=dir_radii
        )

        config = SolverConfiguration(gauss_order=2)
        result = solve_multi_antenna([reflector, driven, director], freq, config)

        assert result["converged"] is True
        assert len(result["antenna_solutions"]) == 3

        sol_r = result["antenna_solutions"][0]
        sol_d = result["antenna_solutions"][1]
        sol_dir = result["antenna_solutions"][2]

        # Parasitic elements should have induced currents (non-zero)
        assert any(
            abs(c) > 1e-15 for c in sol_r["branch_currents"]
        ), "Reflector should have induced currents"
        assert any(
            abs(c) > 1e-15 for c in sol_dir["branch_currents"]
        ), "Director should have induced currents"

        # Driven element should have input impedance; parasitic elements should not
        assert sol_d["input_impedance"] is not None
        assert sol_r["input_impedance"] is None
        assert sol_dir["input_impedance"] is None


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
