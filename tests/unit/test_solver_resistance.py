"""
Tests for resistance calculation functions.

These tests verify the PEEC resistance calculations for:
1. DC resistance formula
2. Skin effect at high frequencies
3. Resistance matrix assembly
"""

import numpy as np
import pytest

from backend.solver.geometry import EdgeGeometry, build_edge_geometries
from backend.solver.resistance import (
    ALUMINUM_RESISTIVITY,
    COPPER_RESISTIVITY,
    MU_0,
    assemble_resistance_matrix,
    compute_ac_resistance,
    compute_dc_resistance,
    compute_skin_depth,
)


class TestDCResistance:
    """Test DC resistance calculation."""

    def test_typical_copper_wire(self):
        """Test DC resistance of a 1m copper wire with 1mm radius."""
        R = compute_dc_resistance(length=1.0, radius=0.001, resistivity=COPPER_RESISTIVITY)

        # R = ρ × L / (π × r²)
        # R = 1.68e-8 × 1.0 / (π × 0.001²)
        # R ≈ 0.00535 Ω
        assert R > 0
        assert 0.005 < R < 0.006

    def test_longer_wire_higher_resistance(self):
        """Test that longer wires have higher resistance."""
        R1 = compute_dc_resistance(1.0, 0.001)
        R2 = compute_dc_resistance(2.0, 0.001)

        # Resistance proportional to length
        assert R2 > R1
        assert np.isclose(R2, 2 * R1)

    def test_thicker_wire_lower_resistance(self):
        """Test that thicker wires have lower resistance."""
        R1 = compute_dc_resistance(1.0, 0.001)
        R2 = compute_dc_resistance(1.0, 0.002)

        # Resistance inversely proportional to area (r²)
        assert R2 < R1
        assert np.isclose(R2, R1 / 4, rtol=1e-10)

    def test_different_materials(self):
        """Test resistance with different material resistivities."""
        length, radius = 1.0, 0.001

        R_copper = compute_dc_resistance(length, radius, COPPER_RESISTIVITY)
        R_aluminum = compute_dc_resistance(length, radius, ALUMINUM_RESISTIVITY)

        # Aluminum has higher resistivity than copper
        assert R_aluminum > R_copper
        assert np.isclose(R_aluminum / R_copper, ALUMINUM_RESISTIVITY / COPPER_RESISTIVITY)

    def test_zero_length_raises_error(self):
        """Test that zero length raises ValueError."""
        with pytest.raises(ValueError, match="Length must be positive"):
            compute_dc_resistance(0.0, 0.001)

    def test_negative_length_raises_error(self):
        """Test that negative length raises ValueError."""
        with pytest.raises(ValueError, match="Length must be positive"):
            compute_dc_resistance(-1.0, 0.001)

    def test_zero_radius_raises_error(self):
        """Test that zero radius raises ValueError."""
        with pytest.raises(ValueError, match="Radius must be positive"):
            compute_dc_resistance(1.0, 0.0)

    def test_negative_resistivity_raises_error(self):
        """Test that negative resistivity raises ValueError."""
        with pytest.raises(ValueError, match="Resistivity must be positive"):
            compute_dc_resistance(1.0, 0.001, -1e-8)


class TestSkinDepth:
    """Test skin depth calculation."""

    def test_copper_at_1mhz(self):
        """Test skin depth for copper at 1 MHz."""
        delta = compute_skin_depth(1e6, COPPER_RESISTIVITY)

        # δ = √(ρ / (π × μ₀ × f))
        # For copper at 1 MHz: δ ≈ 65 μm
        assert delta > 0
        assert 60e-6 < delta < 70e-6

    def test_higher_frequency_smaller_skin_depth(self):
        """Test that skin depth decreases with frequency."""
        delta_1khz = compute_skin_depth(1e3, COPPER_RESISTIVITY)
        delta_1mhz = compute_skin_depth(1e6, COPPER_RESISTIVITY)
        delta_1ghz = compute_skin_depth(1e9, COPPER_RESISTIVITY)

        # Skin depth ∝ 1/√f
        assert delta_1mhz < delta_1khz
        assert delta_1ghz < delta_1mhz

        # Check scaling
        assert np.isclose(delta_1mhz, delta_1khz / np.sqrt(1000), rtol=1e-10)

    def test_different_materials(self):
        """Test skin depth varies with material resistivity."""
        freq = 1e6

        delta_copper = compute_skin_depth(freq, COPPER_RESISTIVITY)
        delta_aluminum = compute_skin_depth(freq, ALUMINUM_RESISTIVITY)

        # Higher resistivity → larger skin depth
        assert delta_aluminum > delta_copper
        assert np.isclose(
            delta_aluminum / delta_copper, np.sqrt(ALUMINUM_RESISTIVITY / COPPER_RESISTIVITY)
        )

    def test_zero_frequency_raises_error(self):
        """Test that zero frequency raises ValueError."""
        with pytest.raises(ValueError, match="Frequency must be positive"):
            compute_skin_depth(0.0, COPPER_RESISTIVITY)

    def test_negative_frequency_raises_error(self):
        """Test that negative frequency raises ValueError."""
        with pytest.raises(ValueError, match="Frequency must be positive"):
            compute_skin_depth(-1e6, COPPER_RESISTIVITY)

    def test_negative_resistivity_raises_error(self):
        """Test that negative resistivity raises ValueError."""
        with pytest.raises(ValueError, match="Resistivity must be positive"):
            compute_skin_depth(1e6, -COPPER_RESISTIVITY)

    def test_negative_permeability_raises_error(self):
        """Test that negative permeability raises ValueError."""
        with pytest.raises(ValueError, match="Permeability must be positive"):
            compute_skin_depth(1e6, COPPER_RESISTIVITY, -MU_0)


class TestACResistance:
    """Test AC resistance with skin effect."""

    def test_dc_case(self):
        """Test that AC resistance equals DC resistance at frequency = 0."""
        length, radius = 1.0, 0.001

        R_dc = compute_dc_resistance(length, radius)
        R_ac_0hz = compute_ac_resistance(length, radius, frequency=0.0)

        assert np.isclose(R_ac_0hz, R_dc)

    def test_low_frequency_approximately_dc(self):
        """Test that AC resistance ≈ DC at low frequencies (large skin depth)."""
        length, radius = 1.0, 0.001

        R_dc = compute_dc_resistance(length, radius)
        R_ac_100hz = compute_ac_resistance(length, radius, frequency=100)

        # At 100 Hz, skin depth >> radius, so R_ac ≈ R_dc
        assert np.isclose(R_ac_100hz, R_dc, rtol=0.01)

    def test_high_frequency_skin_effect(self):
        """Test that AC resistance >> DC at high frequencies."""
        length, radius = 1.0, 0.001

        R_dc = compute_dc_resistance(length, radius)
        R_ac_1mhz = compute_ac_resistance(length, radius, frequency=1e6)

        # At 1 MHz, significant skin effect (factor of ~7-8)
        assert R_ac_1mhz > R_dc
        assert R_ac_1mhz > 5 * R_dc  # Expect significant increase

    def test_resistance_increases_with_frequency(self):
        """Test that AC resistance increases with frequency (mostly)."""
        length, radius = 1.0, 0.001

        R_dc = compute_ac_resistance(length, radius, 0)
        R_100khz = compute_ac_resistance(length, radius, 1e5)
        R_1mhz = compute_ac_resistance(length, radius, 1e6)
        R_10mhz = compute_ac_resistance(length, radius, 1e7)

        # General trend: resistance increases with frequency
        assert R_100khz > R_dc
        assert R_1mhz > R_100khz
        assert R_10mhz > R_1mhz

    def test_skin_effect_exists(self):
        """Test that skin effect increases resistance at high frequencies."""
        length = 1.0
        freq = 1e6

        # Test wire with radius comparable to skin depth
        R_dc = compute_dc_resistance(length, 0.001)
        R_ac = compute_ac_resistance(length, 0.001, freq)

        # AC resistance should be higher
        assert R_ac > R_dc
        assert R_ac > 5 * R_dc  # Significant increase

    def test_negative_frequency_raises_error(self):
        """Test that negative frequency raises ValueError."""
        with pytest.raises(ValueError, match="Frequency must be non-negative"):
            compute_ac_resistance(1.0, 0.001, -1e6)

    def test_negative_resistivity_raises_error(self):
        """Test that negative resistivity raises ValueError."""
        with pytest.raises(ValueError, match="Resistivity must be positive"):
            compute_ac_resistance(1.0, 0.001, 1e6, resistivity=-COPPER_RESISTIVITY)

    def test_negative_permeability_raises_error(self):
        """Test that negative permeability raises ValueError."""
        with pytest.raises(ValueError, match="Permeability must be positive"):
            compute_ac_resistance(1.0, 0.001, 1e6, permeability=-MU_0)


class TestExactSkinEffect:
    """R_ac/R_dc of a round wire = Re{(ka/2) J0(ka)/J1(ka)}, k = (1-j)/delta (exact Bessel solution).

    The previous piecewise fit jumped from 1.25 to 0.5 at a/delta = 1 (R_ac < R_dc) and was
    10-50 % off between a/delta 0.3 and 10.
    """

    @staticmethod
    def ratio(x, radius=1e-4):
        """R_ac/R_dc at a/delta = x (copper)."""
        delta = radius / x
        f = COPPER_RESISTIVITY / (np.pi * MU_0 * delta**2)
        return compute_ac_resistance(1.0, radius, f) / compute_dc_resistance(1.0, radius)

    @pytest.mark.parametrize("x", [0.05, 0.1, 0.3, 0.5])
    def test_low_frequency_series(self, x):
        """R_ac/R_dc = 1 + x^4/48 - x^8/2880 + ... for a/delta = x << 1."""
        assert self.ratio(x) == pytest.approx(1 + x**4 / 48 - x**8 / 2880, rel=1e-6)

    @pytest.mark.parametrize("x", [20.0, 50.0, 200.0, 1000.0])
    def test_high_frequency_asymptote(self, x):
        """R_ac/R_dc = x/2 + 1/4 + 3/(32 x) + O(x^-2) for a/delta = x >> 1."""
        assert self.ratio(x) == pytest.approx(x / 2 + 0.25 + 3 / (32 * x), rel=1e-5)

    @pytest.mark.parametrize("x", [0.7, 1.0, 1.5, 2.0, 3.0, 5.0, 10.0])
    def test_transition_matches_the_kelvin_function_form(self, x):
        """Independent classical form with Kelvin functions, q = sqrt(2) a/delta:
        R_ac/R_dc = (q/2) (ber q bei'q - bei q ber'q) / (ber'q^2 + bei'q^2)."""
        from scipy.special import bei, beip, ber, berp

        q = np.sqrt(2) * x
        ref = (q / 2) * (ber(q) * beip(q) - bei(q) * berp(q)) / (berp(q) ** 2 + beip(q) ** 2)
        assert self.ratio(x) == pytest.approx(ref, rel=1e-10)

    def test_old_jump_at_one_skin_depth_is_gone(self):
        """The fit gave 1.245 just below and 0.500 at a/delta = 1; exact: 1.0205 on both sides."""
        assert self.ratio(0.999) == pytest.approx(self.ratio(1.0), rel=1e-3)
        assert self.ratio(1.0) == pytest.approx(1.0205, abs=1e-4)

    def test_continuous_and_monotone_over_the_whole_range(self):
        xs = np.logspace(-2, 3, 400)
        r = np.array([self.ratio(x) for x in xs])
        assert np.all(r >= 1.0 - 1e-12)  # never below DC
        assert np.all(np.diff(r) > -1e-12)  # monotone
        assert np.max(np.abs(np.diff(r)) / r[:-1]) < 0.05  # no jumps

    def test_thick_wire_at_vhf_unchanged_in_practice(self):
        """1 mm copper at 300 MHz (a/delta = 263): within 0.2 % of the high-frequency formula."""
        length, radius, f = 1.0, 1e-3, 300e6
        delta = np.sqrt(COPPER_RESISTIVITY / (np.pi * MU_0 * f))
        hf = COPPER_RESISTIVITY * length / (2 * np.pi * radius * delta)
        assert compute_ac_resistance(length, radius, f) == pytest.approx(hf, rel=2e-3)

    def test_relative_permeability_thins_the_skin(self):
        """Magnetic wire (mu_r = 100): delta shrinks by 10, R_ac grows ~10x at high frequency."""
        r1 = compute_ac_resistance(1.0, 1e-3, 100e6, permeability=MU_0)
        r100 = compute_ac_resistance(1.0, 1e-3, 100e6, permeability=100 * MU_0)
        assert r100 / r1 == pytest.approx(10.0, rel=0.01)


class TestResistanceMatrixAssembly:
    """Test resistance matrix assembly."""

    def test_simple_dipole_dc(self):
        """Test resistance matrix for simple two-segment dipole at DC."""
        edges = [
            EdgeGeometry([0.0, 0.0, 0.0], [0.0, 0.0, 0.5]),
            EdgeGeometry([0.0, 0.0, 0.5], [0.0, 0.0, 1.0]),
        ]
        radii = np.array([0.001, 0.001])

        R = assemble_resistance_matrix(edges, radii, frequency=0.0)

        # Check shape
        assert R.shape == (2, 2)

        # Check diagonal elements are positive
        assert R[0, 0] > 0
        assert R[1, 1] > 0

        # Check off-diagonal elements are zero (no resistive coupling)
        assert R[0, 1] == 0
        assert R[1, 0] == 0

        # Both segments equal length and radius → equal resistance
        assert np.isclose(R[0, 0], R[1, 1])

    def test_matrix_is_diagonal(self):
        """Test that resistance matrix is diagonal."""
        edges = [
            EdgeGeometry([0.0, 0.0, 0.0], [1.0, 0.0, 0.0]),
            EdgeGeometry([1.0, 0.0, 0.0], [2.0, 0.0, 0.0]),
            EdgeGeometry([2.0, 0.0, 0.0], [3.0, 0.0, 0.0]),
        ]
        radii = np.full(3, 0.001)

        R = assemble_resistance_matrix(edges, radii)

        # Off-diagonal elements should be zero
        assert R[0, 1] == 0
        assert R[0, 2] == 0
        assert R[1, 0] == 0
        assert R[1, 2] == 0
        assert R[2, 0] == 0
        assert R[2, 1] == 0

    def test_different_segment_lengths(self):
        """Test that longer segments have higher resistance."""
        edges = [
            EdgeGeometry([0.0, 0.0, 0.0], [1.0, 0.0, 0.0]),  # 1 m
            EdgeGeometry([2.0, 0.0, 0.0], [4.0, 0.0, 0.0]),  # 2 m
        ]
        radii = np.array([0.001, 0.001])

        R = assemble_resistance_matrix(edges, radii)

        # Second segment is twice as long → twice the resistance
        assert R[1, 1] > R[0, 0]
        assert np.isclose(R[1, 1], 2 * R[0, 0], rtol=1e-10)

    def test_different_radii(self):
        """Test that thicker segments have lower resistance."""
        edges = [
            EdgeGeometry([0.0, 0.0, 0.0], [1.0, 0.0, 0.0]),
            EdgeGeometry([2.0, 0.0, 0.0], [3.0, 0.0, 0.0]),
        ]
        radii = np.array([0.001, 0.002])  # Second is twice as thick

        R = assemble_resistance_matrix(edges, radii)

        # Second segment has 2× radius → 4× area → 1/4 resistance
        assert R[1, 1] < R[0, 0]
        assert np.isclose(R[1, 1], R[0, 0] / 4, rtol=1e-10)

    def test_ac_resistance_higher_than_dc(self):
        """Test that AC resistance matrix has higher values than DC."""
        edges = [
            EdgeGeometry([0.0, 0.0, 0.0], [1.0, 0.0, 0.0]),
            EdgeGeometry([1.0, 0.0, 0.0], [2.0, 0.0, 0.0]),
        ]
        radii = np.array([0.001, 0.001])

        R_dc = assemble_resistance_matrix(edges, radii, frequency=0.0, include_skin_effect=True)
        R_ac = assemble_resistance_matrix(edges, radii, frequency=1e6, include_skin_effect=True)

        # AC resistance should be higher due to skin effect
        assert R_ac[0, 0] > R_dc[0, 0]
        assert R_ac[1, 1] > R_dc[1, 1]

    def test_disable_skin_effect(self):
        """Test that skin effect can be disabled."""
        edges = [EdgeGeometry([0.0, 0.0, 0.0], [1.0, 0.0, 0.0])]
        radii = np.array([0.001])

        R_dc = assemble_resistance_matrix(edges, radii, frequency=0.0)
        R_no_skin = assemble_resistance_matrix(
            edges, radii, frequency=1e6, include_skin_effect=False
        )

        # Should be equal when skin effect is disabled
        assert np.isclose(R_no_skin[0, 0], R_dc[0, 0])

    def test_radii_wrong_shape_raises_error(self):
        """Test that wrong radii array shape raises ValueError."""
        edges = [
            EdgeGeometry([0.0, 0.0, 0.0], [1.0, 0.0, 0.0]),
            EdgeGeometry([1.0, 0.0, 0.0], [2.0, 0.0, 0.0]),
        ]
        radii = np.array([0.001])  # Wrong length

        with pytest.raises(ValueError, match="Radii array has length"):
            assemble_resistance_matrix(edges, radii)

    def test_negative_radii_raises_error(self):
        """Test that negative radii raise ValueError."""
        edges = [EdgeGeometry([0.0, 0.0, 0.0], [1.0, 0.0, 0.0])]
        radii = np.array([-0.001])

        with pytest.raises(ValueError, match="All radii must be positive"):
            assemble_resistance_matrix(edges, radii)

    def test_negative_frequency_raises_error(self):
        """Test that negative frequency raises ValueError."""
        edges = [EdgeGeometry([0.0, 0.0, 0.0], [1.0, 0.0, 0.0])]
        radii = np.array([0.001])

        with pytest.raises(ValueError, match="Frequency must be non-negative"):
            assemble_resistance_matrix(edges, radii, frequency=-1e6)


class TestIntegration:
    """Integration tests for resistance calculations."""

    def test_realistic_dipole_dc(self):
        """Test resistance matrix for realistic dipole antenna at DC."""
        # 1-meter dipole divided into 10 segments
        nodes = [[0.0, 0.0, i * 0.1] for i in range(11)]
        edges_list = [[i, i + 1] for i in range(10)]

        edges = build_edge_geometries(nodes, edges_list)
        radii = np.full(10, 0.001)

        R = assemble_resistance_matrix(edges, radii, resistivity=COPPER_RESISTIVITY)

        # All segments equal → all diagonal elements equal
        for i in range(10):
            assert np.isclose(R[i, i], R[0, 0])

        # Total series resistance
        R_total = np.sum(np.diag(R))

        # Should be equal to single 1m wire
        R_single = compute_dc_resistance(1.0, 0.001, COPPER_RESISTIVITY)
        assert np.isclose(R_total, R_single)

    def test_realistic_dipole_ac(self):
        """Test resistance matrix for realistic dipole at 100 MHz."""
        nodes = [[0.0, 0.0, i * 0.1] for i in range(11)]
        edges_list = [[i, i + 1] for i in range(10)]

        edges = build_edge_geometries(nodes, edges_list)
        radii = np.full(10, 0.001)

        R_dc = assemble_resistance_matrix(edges, radii, frequency=0.0, include_skin_effect=True)
        R_ac = assemble_resistance_matrix(edges, radii, frequency=100e6, include_skin_effect=True)

        # AC resistance should be significantly higher
        assert np.all(np.diag(R_ac) > np.diag(R_dc))

        # At 100 MHz, expect substantial skin effect
        assert np.all(np.diag(R_ac) > 10 * np.diag(R_dc))

    def test_frequency_sweep(self):
        """Test resistance across frequency range."""
        edges = [EdgeGeometry([0.0, 0.0, 0.0], [1.0, 0.0, 0.0])]
        radii = np.array([0.001])

        frequencies = [0, 1e5, 1e6, 10e6, 100e6]
        resistances = []

        for freq in frequencies:
            R = assemble_resistance_matrix(edges, radii, frequency=freq, include_skin_effect=True)
            resistances.append(R[0, 0])

        # Resistance should generally increase with frequency
        assert resistances[1] > resistances[0]  # 100 kHz > DC
        assert resistances[2] > resistances[1]  # 1 MHz > 100 kHz
        assert resistances[3] > resistances[2]  # 10 MHz > 1 MHz
        assert resistances[4] > resistances[3]  # 100 MHz > 10 MHz

    def test_compare_materials(self):
        """Test resistance with different conductor materials."""
        edges = [EdgeGeometry([0.0, 0.0, 0.0], [1.0, 0.0, 0.0])]
        radii = np.array([0.001])

        R_copper = assemble_resistance_matrix(edges, radii, resistivity=COPPER_RESISTIVITY)
        R_aluminum = assemble_resistance_matrix(edges, radii, resistivity=ALUMINUM_RESISTIVITY)

        # Aluminum has higher resistance
        assert R_aluminum[0, 0] > R_copper[0, 0]
        assert np.isclose(
            R_aluminum[0, 0] / R_copper[0, 0], ALUMINUM_RESISTIVITY / COPPER_RESISTIVITY
        )
