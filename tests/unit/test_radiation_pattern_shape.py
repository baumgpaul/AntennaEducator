"""Tests for radiation pattern shape — donut pattern for short antennas.

Validates that electrically short dipoles and loops produce the expected
sin²θ (donut) radiation pattern for both voltage and current excitation.

These are regression tests locking in the fixes for:
- Correct voltage source edge inclusion in far-field (commit 4d45d0e)
- Two-terminal current source on closed loops (commit 5b63838)
- Correct CS gap edge direction [node_end, node_start] (commit 5c5a17d)
"""

import numpy as np
import pytest

from backend.postprocessor.field import compute_directivity_from_pattern, compute_far_field
from backend.preprocessor.builders import create_dipole, create_loop, dipole_to_mesh, loop_to_mesh
from backend.solver.solver import solve_peec_frequency_sweep
from backend.solver.system import CurrentSource, VoltageSource

# --- Constants -----------------------------------------------------------

# Electrically short: antenna dimension << wavelength
# At 30 MHz, λ ≈ 10 m.  Dipole 0.5 m → 0.05λ, loop r=0.05 m → C ≈ 0.031λ.
FREQ = 30e6
THETA_PTS = 37
PHI_PTS = 73

SOURCE_VS = {
    "type": "voltage",
    "amplitude": {"real": 1.0, "imag": 0.0},
    "series_R": 0.0,
    "series_L": 0.0,
    "series_C_inv": 0.0,
}
SOURCE_CS = {
    "type": "current",
    "amplitude": {"real": 1.0, "imag": 0.0},
}


# --- Helpers --------------------------------------------------------------


def _far_field_pattern(
    nodes,
    edges,
    radii,
    freq,
    voltage_sources=None,
    current_sources=None,
    extra_edges=None,
    extra_currents=None,
    extra_radii=None,
):
    """Solve PEEC and compute phi-averaged directivity vs theta.

    Parameters
    ----------
    extra_edges, extra_currents, extra_radii
        Additional edges (and their currents / radii) appended to the
        far-field computation *after* solving.  Used for source gap edges
        (VS or two-terminal CS) that must be included in the radiating mesh
        but are not part of the solver edge list.

    Returns
    -------
    D_dBi : float
        Peak directivity in dBi.
    D_avg : ndarray, shape (n_theta,)
        Phi-averaged directivity pattern.
    theta : ndarray, shape (n_theta,)
        Theta angles [rad].
    """
    result = solve_peec_frequency_sweep(
        nodes=np.array(nodes),
        edges=edges,
        radii=np.array(radii),
        frequencies=np.array([freq]),
        voltage_sources=voltage_sources or [],
        current_sources=current_sources or [],
    )
    sol = result.frequency_solutions[0]

    # Start with wire-edge currents
    all_currents = list(sol.branch_currents[: result.n_edges])
    all_edges = list(edges)
    all_radii = list(radii)

    # Append voltage source gap edges + their branch currents
    if voltage_sources:
        vs_currents = sol.branch_currents[result.n_edges :]
        for idx, vs in enumerate(voltage_sources):
            # Only include non-ground VS edges (both nodes >= 1)
            if vs.node_start >= 1 and vs.node_end >= 1:
                all_edges.append([vs.node_start, vs.node_end])
                all_radii.append(radii[0])
                all_currents.append(vs_currents[idx])

    # Append manually supplied extra edges (e.g. two-terminal CS gap)
    if extra_edges is not None:
        for edge, current, r in zip(extra_edges, extra_currents, extra_radii):
            all_edges.append(edge)
            all_currents.append(current)
            all_radii.append(r)

    bc = np.array(all_currents).reshape(1, -1)
    theta = np.linspace(0, np.pi, THETA_PTS)
    phi = np.linspace(0, 2 * np.pi, PHI_PTS)

    E_field, _ = compute_far_field(
        frequencies=np.array([freq]),
        branch_currents=bc,
        nodes=np.array(nodes),
        edges=np.array(all_edges),
        theta_angles=theta,
        phi_angles=phi,
    )

    E_theta = E_field[0, :, :, 0]
    E_phi = E_field[0, :, :, 1]
    _, D_dBi, D_pattern, _ = compute_directivity_from_pattern(E_theta, E_phi, theta, phi)
    D_avg = np.mean(D_pattern, axis=1)
    return D_dBi, D_avg, theta


def _assert_donut_pattern(D_avg, theta, label, min_ratio=10.0):
    """Assert the pattern has a donut shape: maximum at equator, nulls at poles.

    Allows for imperfection from the feed gap — requires at least *min_ratio*
    between equator and pole directivity.
    """
    equator_idx = len(theta) // 2  # theta ≈ 90°
    equator_val = D_avg[equator_idx]
    pole_val = (D_avg[0] + D_avg[-1]) / 2

    assert equator_val > min_ratio * pole_val, (
        f"{label}: equator D={equator_val:.4f} should be >> pole D={pole_val:.4e} "
        f"(ratio={equator_val / max(pole_val, 1e-30):.1f}, need >{min_ratio})"
    )

    # Maximum should be near equator, not at poles
    max_idx = np.argmax(D_avg)
    max_theta_deg = np.degrees(theta[max_idx])
    assert (
        60 < max_theta_deg < 120
    ), f"{label}: pattern peak at θ={max_theta_deg:.0f}° — expected near 90°"


# --- Dipole tests ----------------------------------------------------------


class TestDipoleRadiationPattern:
    """Short gap-dipole (z-oriented) should produce sin²θ donut for VS and CS."""

    def test_dipole_voltage_source_donut(self):
        """Gap dipole with voltage excitation → donut at θ=90°."""
        el = create_dipole(length=0.5, segments=11, gap=0.001, source=SOURCE_VS)
        mesh = dipole_to_mesh(el)

        vs_list = [
            VoltageSource(
                node_start=s.node_start,
                node_end=s.node_end,
                value=s.amplitude,
                R=s.series_R,
                L=s.series_L,
                C_inv=s.series_C_inv,
            )
            for s in el.sources
        ]

        D_dBi, D_avg, theta = _far_field_pattern(
            mesh.nodes, mesh.edges, mesh.radii, FREQ, voltage_sources=vs_list
        )

        _assert_donut_pattern(D_avg, theta, "Dipole+VS")
        assert 1.0 < D_dBi < 3.0, f"Dipole+VS directivity {D_dBi:.2f} dBi out of range"

    def test_dipole_current_source_donut(self):
        """Gap dipole with current excitation → donut at θ=90°.

        A gap dipole with current sources uses ground-referenced injection
        (no two-terminal node_end), so no extra gap edges are needed for
        far-field — the current flows through the wire segments only.
        """
        el = create_dipole(length=0.5, segments=11, gap=0.001, source=SOURCE_CS)
        mesh = dipole_to_mesh(el)

        cs_list = [
            CurrentSource(node=s.node_start, value=s.amplitude, node_end=s.node_end)
            for s in el.sources
        ]

        D_dBi, D_avg, theta = _far_field_pattern(
            mesh.nodes, mesh.edges, mesh.radii, FREQ, current_sources=cs_list
        )

        _assert_donut_pattern(D_avg, theta, "Dipole+CS")
        assert 1.0 < D_dBi < 3.0, f"Dipole+CS directivity {D_dBi:.2f} dBi out of range"


# --- Loop tests ------------------------------------------------------------


class TestLoopRadiationPattern:
    """Small loop (xy-plane, normal=z) should produce sin²θ donut for VS and CS."""

    def test_loop_voltage_source_donut(self):
        """Closed loop with voltage excitation → donut at θ=90°."""
        el = create_loop(radius=0.05, segments=32, gap=0.0, source=SOURCE_VS)
        mesh = loop_to_mesh(el)

        vs_list = [
            VoltageSource(
                node_start=el.sources[0].node_start,
                node_end=el.sources[0].node_end,
                value=el.sources[0].amplitude,
            )
        ]

        D_dBi, D_avg, theta = _far_field_pattern(
            mesh.nodes, mesh.edges, mesh.radii, FREQ, voltage_sources=vs_list
        )

        _assert_donut_pattern(D_avg, theta, "Loop+VS")
        assert 1.0 < D_dBi < 3.0, f"Loop+VS directivity {D_dBi:.2f} dBi out of range"

    def test_loop_current_source_donut(self):
        """Closed loop with current excitation → donut at θ=90°.

        Two-terminal CS: node_start=1, node_end=segments.
        The wire edge at that pair is removed by loop_to_mesh().
        For far-field, we must add the CS gap edge back as
        [node_end, node_start] with the source amplitude as current.
        This is the exact same logic the frontend applies in solverSlice.
        """
        segments = 32
        el = create_loop(radius=0.05, segments=segments, gap=0.0, source=SOURCE_CS)
        mesh = loop_to_mesh(el)

        src = el.sources[0]
        cs_list = [CurrentSource(node=src.node_start, value=src.amplitude, node_end=src.node_end)]

        # CS gap edge for far-field: direction [node_end, node_start]
        cs_gap_edge = [src.node_end, src.node_start]
        cs_gap_current = src.amplitude
        cs_gap_radius = mesh.radii[0]

        D_dBi, D_avg, theta = _far_field_pattern(
            mesh.nodes,
            mesh.edges,
            mesh.radii,
            FREQ,
            current_sources=cs_list,
            extra_edges=[cs_gap_edge],
            extra_currents=[cs_gap_current],
            extra_radii=[cs_gap_radius],
        )

        _assert_donut_pattern(D_avg, theta, "Loop+CS")
        assert 1.0 < D_dBi < 3.0, f"Loop+CS directivity {D_dBi:.2f} dBi out of range"

    def test_loop_cs_without_gap_edge_is_wrong(self):
        """Omitting the CS gap edge from far-field produces inverted pattern.

        This is the regression guard — if the gap edge is missing, the open arc
        radiates like a partial loop and the pattern flips (poles > equator).
        """
        segments = 32
        el = create_loop(radius=0.05, segments=segments, gap=0.0, source=SOURCE_CS)
        mesh = loop_to_mesh(el)

        src = el.sources[0]
        cs_list = [CurrentSource(node=src.node_start, value=src.amplitude, node_end=src.node_end)]

        # Deliberately omit the CS gap edge
        D_dBi, D_avg, theta = _far_field_pattern(
            mesh.nodes,
            mesh.edges,
            mesh.radii,
            FREQ,
            current_sources=cs_list,
        )

        equator_idx = len(theta) // 2
        pole_val = (D_avg[0] + D_avg[-1]) / 2
        equator_val = D_avg[equator_idx]

        assert pole_val > equator_val, (
            "Without CS gap edge the loop pattern should be inverted "
            f"(pole={pole_val:.4f} should be > equator={equator_val:.4f})"
        )

    def test_loop_cs_reversed_gap_edge_is_wrong(self):
        """CS gap edge in the wrong direction [node_start, node_end] breaks pattern.

        Before the fix (commit 5c5a17d), the gap edge was added as
        [node_start, node_end] which produced a standing-wave donut instead of
        the correct uniform current distribution.  With the wrong direction
        the pattern peak moves away from θ=90° or the equator/pole ratio drops.
        """
        segments = 32
        el = create_loop(radius=0.05, segments=segments, gap=0.0, source=SOURCE_CS)
        mesh = loop_to_mesh(el)

        src = el.sources[0]
        cs_list = [CurrentSource(node=src.node_start, value=src.amplitude, node_end=src.node_end)]

        # Wrong direction: [node_start, node_end] instead of [node_end, node_start]
        wrong_edge = [src.node_start, src.node_end]
        cs_gap_current = src.amplitude
        cs_gap_radius = mesh.radii[0]

        D_dBi_wrong, D_avg_wrong, theta = _far_field_pattern(
            mesh.nodes,
            mesh.edges,
            mesh.radii,
            FREQ,
            current_sources=cs_list,
            extra_edges=[wrong_edge],
            extra_currents=[cs_gap_current],
            extra_radii=[cs_gap_radius],
        )

        # Correct direction for comparison
        correct_edge = [src.node_end, src.node_start]
        D_dBi_correct, D_avg_correct, theta = _far_field_pattern(
            mesh.nodes,
            mesh.edges,
            mesh.radii,
            FREQ,
            current_sources=cs_list,
            extra_edges=[correct_edge],
            extra_currents=[cs_gap_current],
            extra_radii=[cs_gap_radius],
        )

        equator_idx = len(theta) // 2
        correct_ratio = D_avg_correct[equator_idx] / max(
            (D_avg_correct[0] + D_avg_correct[-1]) / 2, 1e-30
        )
        wrong_ratio = D_avg_wrong[equator_idx] / max((D_avg_wrong[0] + D_avg_wrong[-1]) / 2, 1e-30)

        # Correct direction should give a much better (higher) equator/pole ratio
        assert correct_ratio > wrong_ratio, (
            f"Correct edge direction should yield a better donut: "
            f"correct ratio={correct_ratio:.1f}, wrong ratio={wrong_ratio:.1f}"
        )


# --- Cross-check: VS and CS should give similar pattern shapes ---------------


class TestExcitationConsistency:
    """Voltage and current excitation should give similar donut patterns."""

    @pytest.mark.parametrize(
        "antenna_type",
        ["dipole", "loop"],
    )
    def test_vs_and_cs_pattern_shape_consistent(self, antenna_type):
        """Both excitation types should show peak at θ≈90° with similar shape."""
        theta = np.linspace(0, np.pi, THETA_PTS)

        # -- Voltage source pattern --
        if antenna_type == "dipole":
            el_vs = create_dipole(length=0.5, segments=11, gap=0.001, source=SOURCE_VS)
            mesh_vs = dipole_to_mesh(el_vs)
            vs_list = [
                VoltageSource(
                    node_start=s.node_start,
                    node_end=s.node_end,
                    value=s.amplitude,
                    R=s.series_R,
                    L=s.series_L,
                    C_inv=s.series_C_inv,
                )
                for s in el_vs.sources
            ]
            _, D_avg_vs, _ = _far_field_pattern(
                mesh_vs.nodes, mesh_vs.edges, mesh_vs.radii, FREQ, voltage_sources=vs_list
            )
        else:
            el_vs = create_loop(radius=0.05, segments=32, gap=0.0, source=SOURCE_VS)
            mesh_vs = loop_to_mesh(el_vs)
            vs_list = [
                VoltageSource(
                    node_start=el_vs.sources[0].node_start,
                    node_end=el_vs.sources[0].node_end,
                    value=el_vs.sources[0].amplitude,
                )
            ]
            _, D_avg_vs, _ = _far_field_pattern(
                mesh_vs.nodes, mesh_vs.edges, mesh_vs.radii, FREQ, voltage_sources=vs_list
            )

        # -- Current source pattern --
        if antenna_type == "dipole":
            el_cs = create_dipole(length=0.5, segments=11, gap=0.001, source=SOURCE_CS)
            mesh_cs = dipole_to_mesh(el_cs)
            cs_list = [
                CurrentSource(node=s.node_start, value=s.amplitude, node_end=s.node_end)
                for s in el_cs.sources
            ]
            _, D_avg_cs, _ = _far_field_pattern(
                mesh_cs.nodes, mesh_cs.edges, mesh_cs.radii, FREQ, current_sources=cs_list
            )
        else:
            segments = 32
            el_cs = create_loop(radius=0.05, segments=segments, gap=0.0, source=SOURCE_CS)
            mesh_cs = loop_to_mesh(el_cs)
            src = el_cs.sources[0]
            cs_list = [
                CurrentSource(node=src.node_start, value=src.amplitude, node_end=src.node_end)
            ]
            cs_gap_edge = [src.node_end, src.node_start]
            _, D_avg_cs, _ = _far_field_pattern(
                mesh_cs.nodes,
                mesh_cs.edges,
                mesh_cs.radii,
                FREQ,
                current_sources=cs_list,
                extra_edges=[cs_gap_edge],
                extra_currents=[src.amplitude],
                extra_radii=[mesh_cs.radii[0]],
            )

        # Both should peak at equator
        max_idx_vs = np.argmax(D_avg_vs)
        max_idx_cs = np.argmax(D_avg_cs)
        max_theta_vs = np.degrees(theta[max_idx_vs])
        max_theta_cs = np.degrees(theta[max_idx_cs])

        assert 60 < max_theta_vs < 120, f"{antenna_type} VS peak at {max_theta_vs:.0f}°"
        assert 60 < max_theta_cs < 120, f"{antenna_type} CS peak at {max_theta_cs:.0f}°"

        # Normalize and compare shapes (correlation should be high)
        norm_vs = D_avg_vs / np.max(D_avg_vs)
        norm_cs = D_avg_cs / np.max(D_avg_cs)
        correlation = np.corrcoef(norm_vs, norm_cs)[0, 1]
        assert correlation > 0.95, (
            f"{antenna_type}: VS and CS pattern shapes should be similar "
            f"(correlation={correlation:.3f}, need >0.95)"
        )
