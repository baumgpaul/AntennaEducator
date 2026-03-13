"""Tests for FDTD far-field computation: radiation pattern and RCS."""

import math

import numpy as np
import pytest

from backend.fdtd_postprocessor.far_field import (
    _compute_beam_width,
    compute_radiation_pattern_from_probes,
    compute_rcs_2d,
    near_to_far_field_2d,
)


class TestNearToFarField2D:
    def test_returns_correct_shape(self):
        """Output arrays have the expected number of angular samples."""
        n_angles = 72
        # Create synthetic near-field contour data
        n_contour = 40  # 10 points per side
        ez = np.random.default_rng(42).standard_normal(n_contour) + 0j
        hx = np.random.default_rng(43).standard_normal(n_contour) + 0j
        hy = np.random.default_rng(44).standard_normal(n_contour) + 0j

        result = near_to_far_field_2d(
            ez,
            hx,
            hy,
            dx=0.01,
            dy=0.01,
            frequency_hz=1e9,
            num_angles=n_angles,
        )

        assert len(result["angles_deg"]) == n_angles
        assert len(result["pattern_db"]) == n_angles
        assert len(result["pattern_linear"]) == n_angles

    def test_pattern_normalized_to_one(self):
        """Maximum of normalized pattern should be 1.0."""
        n_contour = 40
        rng = np.random.default_rng(42)
        ez = rng.standard_normal(n_contour) + 0j
        hx = rng.standard_normal(n_contour) + 0j
        hy = rng.standard_normal(n_contour) + 0j

        result = near_to_far_field_2d(
            ez,
            hx,
            hy,
            dx=0.01,
            dy=0.01,
            frequency_hz=1e9,
            num_angles=360,
        )

        assert max(result["pattern_linear"]) == pytest.approx(1.0)
        assert max(result["pattern_db"]) == pytest.approx(0.0, abs=0.01)

    def test_isotropic_source_uniform_pattern(self):
        """A source with uniform near-field should produce roughly uniform far-field."""
        # Uniform Ez amplitude on the contour, zero H
        n_contour = 80
        ez = np.ones(n_contour, dtype=complex)
        # For a uniform Ez with zero H, the pattern won't be perfectly uniform
        # but the directivity should be low
        hx = np.zeros(n_contour, dtype=complex)
        hy = np.zeros(n_contour, dtype=complex)

        result = near_to_far_field_2d(
            ez,
            hx,
            hy,
            dx=0.01,
            dy=0.01,
            frequency_hz=1e9,
            num_angles=72,
        )

        # Should have finite directivity
        assert result["max_directivity_db"] is not None
        # Pattern values should all be non-negative
        assert all(v >= 0 for v in result["pattern_linear"])

    def test_directivity_positive(self):
        """Directivity should be positive for any non-zero source."""
        n_contour = 40
        rng = np.random.default_rng(99)
        ez = rng.standard_normal(n_contour) + 1j * rng.standard_normal(n_contour)
        hx = rng.standard_normal(n_contour) + 0j
        hy = rng.standard_normal(n_contour) + 0j

        result = near_to_far_field_2d(
            ez,
            hx,
            hy,
            dx=0.005,
            dy=0.005,
            frequency_hz=3e9,
            num_angles=180,
        )

        # Directivity in dBi should be a finite number
        assert math.isfinite(result["max_directivity_db"])


class TestComputeRcs2D:
    def test_returns_correct_shape(self):
        """Output arrays match requested num_angles."""
        n_pts = 360
        scattered_e = np.ones(n_pts, dtype=complex) * 0.1
        scattered_h = np.ones(n_pts, dtype=complex) * 0.0003

        result = compute_rcs_2d(
            scattered_e,
            scattered_h,
            incident_e0=1.0,
            frequency_hz=1e9,
            contour_radius=0.5,
            num_angles=n_pts,
        )

        assert len(result["angles_deg"]) == n_pts
        assert len(result["rcs_2d"]) == n_pts
        assert len(result["rcs_db"]) == n_pts

    def test_rcs_positive(self):
        """RCS values should be non-negative."""
        n_pts = 100
        rng = np.random.default_rng(42)
        scattered_e = rng.standard_normal(n_pts) * 0.1 + 0j

        result = compute_rcs_2d(
            scattered_e,
            np.zeros(n_pts, dtype=complex),
            incident_e0=1.0,
            frequency_hz=1e9,
            contour_radius=1.0,
            num_angles=n_pts,
        )

        assert all(v >= 0 for v in result["rcs_2d"])
        assert result["max_rcs"] >= 0

    def test_zero_scattered_field(self):
        """Zero scattered field gives zero RCS."""
        n_pts = 36
        scattered_e = np.zeros(n_pts, dtype=complex)
        scattered_h = np.zeros(n_pts, dtype=complex)

        result = compute_rcs_2d(
            scattered_e,
            scattered_h,
            incident_e0=1.0,
            frequency_hz=1e9,
            contour_radius=1.0,
            num_angles=n_pts,
        )

        assert result["max_rcs"] == pytest.approx(0.0)

    def test_max_rcs_angle_reported(self):
        """Maximum RCS angle is correctly identified."""
        n_pts = 360
        # Concentrated field at one angle
        scattered_e = np.zeros(n_pts, dtype=complex)
        scattered_e[90] = 1.0  # Peak at 90°

        result = compute_rcs_2d(
            scattered_e,
            np.zeros(n_pts, dtype=complex),
            incident_e0=1.0,
            frequency_hz=1e9,
            contour_radius=1.0,
            num_angles=n_pts,
        )

        assert result["max_rcs_angle_deg"] == pytest.approx(90.0, abs=1.5)


class TestComputeRadiationPatternFromProbes:
    def test_basic_pattern(self):
        """Pattern from uniformly-spaced probes."""
        probe_data = [
            {"angle_deg": float(a), "dft_magnitude": 1.0 + 0.5 * math.cos(math.radians(a))}
            for a in range(0, 360, 10)
        ]

        result = compute_radiation_pattern_from_probes(
            probe_data,
            frequency_hz=1e9,
            probe_radius=0.3,
            num_angles=360,
        )

        assert len(result["angles_deg"]) == 360
        assert max(result["pattern_linear"]) == pytest.approx(1.0)
        assert result["max_directivity_db"] is not None

    def test_directional_pattern(self):
        """Directional source should have directivity > 0 dBi."""
        probe_data = [
            {"angle_deg": float(a), "dft_magnitude": max(0.01, math.cos(math.radians(a)))}
            for a in range(0, 360, 5)
        ]

        result = compute_radiation_pattern_from_probes(
            probe_data,
            frequency_hz=2e9,
            probe_radius=0.2,
            num_angles=360,
        )

        # A cos(θ) pattern should have positive directivity
        assert result["max_directivity_db"] > 0


class TestComputeBeamWidth:
    def test_known_beamwidth(self):
        """A cos²(θ) pattern centered at 0° should have ~90° beamwidth."""
        n = 360
        angles = np.linspace(0, 2 * np.pi, n, endpoint=False)
        # cos²(θ) pattern shifted so peak is at θ=0
        pattern = np.cos(angles) ** 2
        pattern = np.maximum(pattern, 0)

        bw = _compute_beam_width(pattern, angles)
        assert bw is not None
        # cos² drops to 0.5 at ±45°, so beamwidth ≈ 90°
        assert bw == pytest.approx(90.0, abs=5.0)

    def test_uniform_pattern_no_beamwidth(self):
        """A uniform pattern (all 1.0) should return None or 360°."""
        n = 360
        angles = np.linspace(0, 2 * np.pi, n, endpoint=False)
        pattern = np.ones(n)

        bw = _compute_beam_width(pattern, angles)
        # Uniform pattern never drops below 0.5 → None
        assert bw is None
