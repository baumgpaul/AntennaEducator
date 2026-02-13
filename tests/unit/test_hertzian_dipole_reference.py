"""Reference tests: Hertzian dipole E, H, and S fields.

Validates the PEEC field computation against closed-form analytical solutions
for a z-directed Hertzian (infinitesimal) dipole.  This is the canonical
benchmark for any electromagnetic field solver.

Exact analytical expressions (Balanis, *Antenna Theory*, 4th ed., Ch. 4):

    E_r   = (η I₀ ℓ cosθ / 2πr²) e^{-jkr} [1 + 1/(jkr)]
    E_θ   = (jkη I₀ ℓ sinθ / 4πr) e^{-jkr} [1 + 1/(jkr) − 1/(kr)²]
    H_φ   = (jk I₀ ℓ sinθ / 4πr)  e^{-jkr} [1 + 1/(jkr)]
    E_φ = H_r = H_θ = 0

Far-field (kr ≫ 1):
    E_θ → (jkη I₀ ℓ sinθ / 4πr) e^{-jkr}
    H_φ → E_θ / η

Radiated power:   P_rad = η k² (I₀ℓ)² / (12π)
Directivity:      D = 1.5  (1.76 dBi)
"""

import numpy as np
import pytest

from backend.common.constants import C_0, EPSILON_0, MU_0
from backend.postprocessor.field import (
    compute_directivity_from_pattern,
    compute_far_field,
    compute_near_field,
    compute_poynting_magnitude_spherical,
    compute_poynting_vector,
)

# =====================================================================
# Physical setup: very short z-directed dipole centered at origin
# =====================================================================

FREQ = 300e6  # 300 MHz
WAVELENGTH = C_0 / FREQ  # ≈ 1.0 m
K = 2 * np.pi / WAVELENGTH  # ≈ 6.283 rad/m
OMEGA = 2 * np.pi * FREQ
ETA = np.sqrt(MU_0 / EPSILON_0)  # ≈ 376.73 Ω

# Dipole parameters
I0 = 1.0 + 0j  # Current [A]
DL = 0.01  # Length [m] — ℓ/λ = 0.01, well within Hertzian regime

# PEEC mesh: single edge along z, centered at origin (1-based node IDs)
NODES = np.array([[0.0, 0.0, -DL / 2], [0.0, 0.0, DL / 2]])
EDGES = np.array([[1, 2]])
FREQS = np.array([FREQ])
CURRENTS = np.array([[I0]])


# =====================================================================
# Analytical helpers
# =====================================================================


def _hertzian_fields(r, theta):
    """Exact spherical-coordinate fields (E_r, E_theta, H_phi)."""
    kr = K * r
    g = np.exp(-1j * kr)

    E_r = (ETA * I0 * DL * np.cos(theta) / (2 * np.pi * r**2)) * g * (1 + 1 / (1j * kr))
    E_theta = (
        (1j * K * ETA * I0 * DL * np.sin(theta) / (4 * np.pi * r))
        * g
        * (1 + 1 / (1j * kr) - 1 / (kr) ** 2)
    )
    H_phi = (1j * K * I0 * DL * np.sin(theta) / (4 * np.pi * r)) * g * (1 + 1 / (1j * kr))
    return E_r, E_theta, H_phi


def _sph_to_cart_fields(E_r, E_theta, H_phi, theta, phi):
    """Convert (E_r, E_θ, 0) and (0, 0, H_φ) → Cartesian E and H."""
    st, ct = np.sin(theta), np.cos(theta)
    sp, cp = np.sin(phi), np.cos(phi)

    Ex = E_r * st * cp + E_theta * ct * cp
    Ey = E_r * st * sp + E_theta * ct * sp
    Ez = E_r * ct - E_theta * st

    Hx = -H_phi * sp
    Hy = H_phi * cp
    Hz = 0.0 + 0j

    return np.array([Ex, Ey, Ez], dtype=complex), np.array([Hx, Hy, Hz], dtype=complex)


def _sph_to_cart_point(r, theta, phi):
    """Spherical (r, θ, φ) → Cartesian (x, y, z)."""
    return np.array(
        [
            r * np.sin(theta) * np.cos(phi),
            r * np.sin(theta) * np.sin(phi),
            r * np.cos(theta),
        ]
    )


# =====================================================================
# Far-field tests
# =====================================================================


class TestHertzianDipoleFarField:
    """Validate far-field E, H, S against analytical Hertzian dipole."""

    @pytest.fixture()
    def far_field_data(self):
        """Compute far-field pattern on a (θ, φ) grid."""
        n_theta, n_phi = 37, 72
        theta = np.linspace(0, np.pi, n_theta)
        phi = np.linspace(0, 2 * np.pi, n_phi)
        E, H = compute_far_field(FREQS, CURRENTS, NODES, EDGES, theta, phi)
        return E, H, theta, phi

    def test_pattern_proportional_to_sin_theta(self, far_field_data):
        """E_theta pattern must follow sin(θ) for a z-directed dipole."""
        E, _, theta, phi = far_field_data
        E_theta_mag = np.abs(E[0, :, :, 0])

        # Normalize to maximum at θ = π/2
        pattern = E_theta_mag / np.max(E_theta_mag)
        expected = np.abs(np.sin(theta))[:, np.newaxis] * np.ones((1, len(phi)))

        # Exclude polar regions where both pattern and reference ≈ 0
        mask = np.sin(theta) > 0.15
        np.testing.assert_allclose(
            pattern[mask],
            expected[mask],
            atol=0.02,
            err_msg="Far-field E_theta deviates from sin(θ) pattern",
        )

    def test_E_phi_is_negligible(self, far_field_data):
        """E_phi ≈ 0 for a z-directed dipole (azimuthal symmetry)."""
        E, _, _, _ = far_field_data
        E_theta_max = np.max(np.abs(E[0, :, :, 0]))
        E_phi_max = np.max(np.abs(E[0, :, :, 1]))
        assert E_phi_max / E_theta_max < 0.01

    def test_azimuthal_symmetry(self, far_field_data):
        """Pattern must be independent of φ."""
        E, _, theta, phi = far_field_data
        E_theta_mag = np.abs(E[0, :, :, 0])

        # For each θ (away from poles), the std across φ should be ≪ mean
        mask = np.sin(theta) > 0.15
        for i_theta in np.where(mask)[0]:
            row = E_theta_mag[i_theta, :]
            assert (
                np.std(row) / np.mean(row) < 0.01
            ), f"Azimuthal variation too large at θ = {np.degrees(theta[i_theta]):.0f}°"

    def test_impedance_relation(self, far_field_data):
        """Far-field: H_theta = −E_phi/η₀, H_phi = E_theta/η₀."""
        E, H, theta, _ = far_field_data
        mask = np.sin(theta) > 0.1
        np.testing.assert_allclose(
            H[0, mask, :, 1],
            E[0, mask, :, 0] / ETA,
            rtol=1e-10,
        )

    def test_absolute_E_theta_at_broadside(self, far_field_data):
        """Verify |E_theta(θ=π/2)| matches analytical value at r_far = 1000 m."""
        E, _, theta, _ = far_field_data
        i90 = np.argmin(np.abs(theta - np.pi / 2))

        # Analytical: |E_θ| = k η I₀ ℓ / (4π r)  at θ = π/2
        r_far = 1000.0
        E_analytical = K * ETA * np.abs(I0) * DL / (4 * np.pi * r_far)
        E_numerical = np.abs(E[0, i90, 0, 0])

        np.testing.assert_allclose(E_numerical, E_analytical, rtol=0.01)

    def test_poynting_vector_at_broadside(self, far_field_data):
        """S_r(θ=π/2) = k²η(I₀ℓ)²/(32π²r²)."""
        E, H, theta, _ = far_field_data
        i90 = np.argmin(np.abs(theta - np.pi / 2))

        S_r = compute_poynting_magnitude_spherical(
            E[0, i90, 0, 0],
            E[0, i90, 0, 1],
            H[0, i90, 0, 0],
            H[0, i90, 0, 1],
        )

        r_far = 1000.0
        S_analytical = K**2 * ETA * np.abs(I0) ** 2 * DL**2 / (32 * np.pi**2 * r_far**2)
        np.testing.assert_allclose(S_r, S_analytical, rtol=0.02)

    def test_poynting_sin_squared_pattern(self, far_field_data):
        """S_r ∝ sin²θ at all angles (not just broadside)."""
        E, H, theta, _ = far_field_data
        S_r = compute_poynting_magnitude_spherical(
            E[0, :, 0, 0],
            E[0, :, 0, 1],
            H[0, :, 0, 0],
            H[0, :, 0, 1],
        )

        # Normalize
        S_norm = S_r / np.max(S_r)
        expected = np.sin(theta) ** 2

        mask = np.sin(theta) > 0.15
        np.testing.assert_allclose(
            S_norm[mask],
            expected[mask],
            atol=0.02,
            err_msg="Poynting vector doesn't follow sin²θ",
        )

    def test_total_radiated_power(self, far_field_data):
        """P_rad = η k²(I₀ℓ)² / (12π)."""
        E, H, theta, phi = far_field_data
        S_r = compute_poynting_magnitude_spherical(
            E[0, :, :, 0],
            E[0, :, :, 1],
            H[0, :, :, 0],
            H[0, :, :, 1],
        )

        # Integrate over sphere: P = ∫∫ S_r r² sinθ dθ dφ
        r_far = 1000.0
        dtheta = theta[1] - theta[0]
        dphi = phi[1] - phi[0]
        sin_theta = np.sin(theta)[:, np.newaxis]
        P_rad = np.sum(S_r * r_far**2 * sin_theta * dtheta * dphi)

        P_analytical = ETA * K**2 * np.abs(I0) ** 2 * DL**2 / (12 * np.pi)
        np.testing.assert_allclose(P_rad, P_analytical, rtol=0.05)

    def test_directivity_equals_1_5(self, far_field_data):
        """Hertzian dipole directivity = 1.5 (1.76 dBi)."""
        E, _, theta, phi = far_field_data
        D_max, D_dBi, _, _ = compute_directivity_from_pattern(
            E[0, :, :, 0],
            E[0, :, :, 1],
            theta,
            phi,
        )
        np.testing.assert_allclose(D_max, 1.5, rtol=0.05)
        np.testing.assert_allclose(D_dBi, 10 * np.log10(1.5), atol=0.3)

    def test_null_on_axis(self, far_field_data):
        """E_theta should vanish at θ = 0 and θ = π (along dipole axis)."""
        E, _, theta, _ = far_field_data
        E_theta_max = np.max(np.abs(E[0, :, :, 0]))

        # θ = 0
        assert np.abs(E[0, 0, 0, 0]) / E_theta_max < 0.01
        # θ = π
        assert np.abs(E[0, -1, 0, 0]) / E_theta_max < 0.01


# =====================================================================
# Near-field tests
# =====================================================================


class TestHertzianDipoleNearField:
    """Validate near-field E, H, S at several distances / angles."""

    # Observation points: (r [m], θ [rad], φ [rad])
    # Tolerances are distance-dependent: at r < 1λ the finite-difference
    # computation of ∇(∇·A) has ~20 % error; at r ≥ 1λ it tightens.
    OBS_POINTS = [
        (0.5, np.pi / 2, 0.0),  # broadside, φ = 0
        (0.5, np.pi / 4, 0.0),  # 45° off axis, φ = 0
        (0.5, np.pi / 2, np.pi / 4),  # broadside, φ = 45°
        (1.0, np.pi / 3, 0.0),  # one wavelength, 60° elevation
        (2.0, np.pi / 4, np.pi / 6),  # two wavelengths, mixed angles
    ]

    @staticmethod
    def _rtol_E(r):
        """E-field tolerance: FD error decreases with distance."""
        kr = K * r
        return max(0.03, 0.3 / kr)

    @pytest.fixture()
    def near_field_data(self):
        """Compute near-field at all observation points in one batch."""
        pts = np.array([_sph_to_cart_point(r, t, p) for r, t, p in self.OBS_POINTS])
        E, H = compute_near_field(FREQS, CURRENTS, NODES, EDGES, pts)
        return E[0], H[0]  # drop frequency axis (single frequency)

    def test_E_field_magnitude(self, near_field_data):
        """E-field magnitude matches analytical (tolerance scales with 1/kr)."""
        E_num, _ = near_field_data

        for i, (r, theta, phi) in enumerate(self.OBS_POINTS):
            Er, Et, Hp = _hertzian_fields(r, theta)
            E_ref, _ = _sph_to_cart_fields(Er, Et, Hp, theta, phi)

            E_ref_norm = np.linalg.norm(E_ref)
            E_num_norm = np.linalg.norm(E_num[i])

            np.testing.assert_allclose(
                E_num_norm,
                E_ref_norm,
                rtol=self._rtol_E(r),
                err_msg=(
                    f"E magnitude mismatch at r={r} m, "
                    f"θ={np.degrees(theta):.0f}°, φ={np.degrees(phi):.0f}°"
                ),
            )

    def test_E_field_components(self, near_field_data):
        """Individual E-field component magnitudes match analytical."""
        E_num, _ = near_field_data

        for i, (r, theta, phi) in enumerate(self.OBS_POINTS):
            Er, Et, Hp = _hertzian_fields(r, theta)
            E_ref, _ = _sph_to_cart_fields(Er, Et, Hp, theta, phi)
            E_ref_norm = np.linalg.norm(E_ref)
            tol = self._rtol_E(r)

            np.testing.assert_allclose(
                np.abs(E_num[i]),
                np.abs(E_ref),
                rtol=tol,
                atol=tol * E_ref_norm,
                err_msg=(
                    f"E component mismatch at r={r} m, "
                    f"θ={np.degrees(theta):.0f}°, φ={np.degrees(phi):.0f}°"
                ),
            )

    def test_H_field_magnitude(self, near_field_data):
        """H-field magnitude matches analytical within 8 %."""
        _, H_num = near_field_data

        for i, (r, theta, phi) in enumerate(self.OBS_POINTS):
            Er, Et, Hp = _hertzian_fields(r, theta)
            _, H_ref = _sph_to_cart_fields(Er, Et, Hp, theta, phi)

            H_ref_norm = np.linalg.norm(H_ref)
            H_num_norm = np.linalg.norm(H_num[i])

            np.testing.assert_allclose(
                H_num_norm,
                H_ref_norm,
                rtol=0.08,
                err_msg=(
                    f"H magnitude mismatch at r={r} m, "
                    f"θ={np.degrees(theta):.0f}°, φ={np.degrees(phi):.0f}°"
                ),
            )

    def test_H_field_components(self, near_field_data):
        """Individual H-field component magnitudes match analytical."""
        _, H_num = near_field_data

        for i, (r, theta, phi) in enumerate(self.OBS_POINTS):
            Er, Et, Hp = _hertzian_fields(r, theta)
            _, H_ref = _sph_to_cart_fields(Er, Et, Hp, theta, phi)
            H_ref_norm = np.linalg.norm(H_ref)

            np.testing.assert_allclose(
                np.abs(H_num[i]),
                np.abs(H_ref),
                rtol=0.08,
                atol=0.05 * H_ref_norm,
                err_msg=(
                    f"H component mismatch at r={r} m, "
                    f"θ={np.degrees(theta):.0f}°, φ={np.degrees(phi):.0f}°"
                ),
            )

    def test_poynting_radial_component(self, near_field_data):
        """Time-averaged S must have a radial component matching S_r = k²η(I₀ℓ)²sin²θ / (32π²r²).

        Note: the analytical radial Poynting flux is the same at *all*
        distances — the near-field reactive terms carry no real power.
        """
        E_num, H_num = near_field_data
        S_num = compute_poynting_vector(E_num, H_num)

        for i, (r, theta, phi) in enumerate(self.OBS_POINTS):
            S_r_analytical = (
                K**2 * ETA * np.abs(I0) ** 2 * DL**2 * np.sin(theta) ** 2 / (32 * np.pi**2 * r**2)
            )

            # Unit radial vector at this point
            st, ct = np.sin(theta), np.cos(theta)
            sp, cp = np.sin(phi), np.cos(phi)
            r_hat = np.array([st * cp, st * sp, ct])

            S_r_num = np.dot(S_num[i], r_hat)

            # Tolerance scales with 1/kr (FD error compounds for S = E × H)
            tol_S = max(0.10, 0.8 / (K * r))
            np.testing.assert_allclose(
                S_r_num,
                S_r_analytical,
                rtol=tol_S,
                err_msg=(
                    f"Poynting S_r mismatch at r={r} m, "
                    f"θ={np.degrees(theta):.0f}°, φ={np.degrees(phi):.0f}°"
                ),
            )

    def test_poynting_tangential_is_small(self, near_field_data):
        """Tangential S should be negligible (real power flow is purely radial)."""
        E_num, H_num = near_field_data
        S_num = compute_poynting_vector(E_num, H_num)

        for i, (r, theta, phi) in enumerate(self.OBS_POINTS):
            S_mag = np.linalg.norm(S_num[i])
            if S_mag < 1e-30:
                continue

            st, ct = np.sin(theta), np.cos(theta)
            sp, cp = np.sin(phi), np.cos(phi)
            r_hat = np.array([st * cp, st * sp, ct])

            S_radial = np.dot(S_num[i], r_hat)
            S_tangential = np.sqrt(max(0, S_mag**2 - S_radial**2))

            # At r < 1λ, FD artifacts create ~20 % tangential leakage
            threshold = 0.10 if K * r > 2 * np.pi else 0.25
            assert S_tangential / S_mag < threshold, (
                f"Tangential Poynting too large at r={r} m, "
                f"θ={np.degrees(theta):.0f}°: S_t/|S| = {S_tangential / S_mag:.3f}"
            )

    def test_E_r_vanishes_at_broadside(self, near_field_data):
        """At θ = π/2 the radial E-field should vanish (cos θ = 0)."""
        E_num, _ = near_field_data

        # Use the first observation point: (0.5, π/2, 0)
        r, theta, phi = self.OBS_POINTS[0]
        assert theta == np.pi / 2

        # Radial unit vector
        r_hat = np.array(
            [
                np.sin(theta) * np.cos(phi),
                np.sin(theta) * np.sin(phi),
                np.cos(theta),
            ]
        )

        E_r_num = np.abs(np.dot(E_num[0], r_hat))
        E_total = np.linalg.norm(E_num[0])

        assert (
            E_r_num / E_total < 0.02
        ), f"E_r not vanishing at broadside: |E_r|/|E| = {E_r_num / E_total:.4f}"

    def test_near_to_far_transition(self):
        """As r grows, near-field E converges to the far-field expression.

        At θ = π/2: E_θ = E_θ^ff · [1 + 1/(jkr) − 1/(kr)²]
        The correction factor → 1 as kr → ∞.
        """
        distances = [0.5, 1.0, 2.0, 5.0]  # in metres (= 0.5λ, 1λ, 2λ, 5λ)
        theta_obs, phi_obs = np.pi / 2, 0.0

        ratios = []
        for r in distances:
            pt = _sph_to_cart_point(r, theta_obs, phi_obs).reshape(1, 3)
            E, _ = compute_near_field(FREQS, CURRENTS, NODES, EDGES, pt)

            # At broadside φ = 0: E_z = −E_θ (dominant component)
            Ez_num = np.abs(E[0, 0, 2])

            # Far-field-only approximation: |E_θ^ff| = kη I₀ℓ / (4πr)
            Ez_ff = K * ETA * np.abs(I0) * DL / (4 * np.pi * r)

            ratios.append(Ez_num / Ez_ff)

        # At r = 5λ (kr ≈ 31), correction factor magnitude ≈ 1.0005 — inside 2 %
        assert (
            np.abs(ratios[-1] - 1.0) < 0.05
        ), f"Near-field not converging to far-field at r = 5λ: ratio = {ratios[-1]:.4f}"

        # The near-field E_θ includes |1 + 1/(jkr) − 1/(kr)²| ≥ 1 for short
        # dipole broadside, so the ratio should decrease toward 1 with distance
        deviations = [abs(ratio - 1.0) for ratio in ratios]
        for j in range(len(deviations) - 1):
            assert deviations[j + 1] <= deviations[j] + 0.01, (
                f"Near-to-far convergence not monotonic: "
                f"Δ[r={distances[j]}] = {deviations[j]:.4f}, "
                f"Δ[r={distances[j+1]}] = {deviations[j+1]:.4f}"
            )


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
