"""Tests for far-field radiation pattern orientation.

Validates that loop antennas produce the correct magnetic-dipole pattern
(sin²θ donut around the loop normal axis), not the inverted pattern that
results from omitting the voltage source edge from the far-field computation.
"""

import numpy as np

from backend.postprocessor.field import compute_directivity_from_pattern, compute_far_field
from backend.preprocessor.builders import create_dipole, create_loop, dipole_to_mesh, loop_to_mesh
from backend.solver.solver import solve_peec_frequency_sweep
from backend.solver.system import VoltageSource


def _solve_and_compute_pattern(nodes, edges, radii, vs_list, freq, include_vs_edges=True):
    """Helper: solve PEEC and compute far-field directivity pattern."""
    result = solve_peec_frequency_sweep(
        nodes=np.array(nodes),
        edges=edges,
        radii=np.array(radii),
        frequencies=np.array([freq]),
        voltage_sources=vs_list,
    )
    sol = result.frequency_solutions[0]

    # Combine wire edge + VS currents (matching frontend fix)
    all_currents = list(sol.branch_currents[: result.n_edges])
    all_edges = list(edges)
    all_radii = list(radii)

    if include_vs_edges:
        vs_currents = sol.branch_currents[result.n_edges :]
        all_currents.extend(vs_currents)
        for vs in vs_list:
            all_edges.append([vs.node_start, vs.node_end])
            all_radii.append(radii[0])

    bc = np.array(all_currents).reshape(1, -1)
    theta_angles = np.linspace(0, np.pi, 37)
    phi_angles = np.linspace(0, 2 * np.pi, 73)

    E_field, _ = compute_far_field(
        frequencies=np.array([freq]),
        branch_currents=bc,
        nodes=np.array(nodes),
        edges=np.array(all_edges),
        theta_angles=theta_angles,
        phi_angles=phi_angles,
    )

    E_theta = E_field[0, :, :, 0]
    E_phi = E_field[0, :, :, 1]
    _, D_dBi, D_pattern, max_idx = compute_directivity_from_pattern(
        E_theta, E_phi, theta_angles, phi_angles
    )

    # phi-averaged directivity vs theta
    D_avg = np.mean(D_pattern, axis=1)
    return D_dBi, D_avg, theta_angles


class TestFarFieldOrientation:
    """Verify that far-field patterns have correct orientation."""

    def test_dipole_pattern_max_at_equator(self):
        """Z-dipole should have maximum radiation at theta=90° (equator)."""
        source = {
            "type": "voltage",
            "amplitude": {"real": 1.0, "imag": 0.0},
            "series_R": 0.0,
            "series_L": 0.0,
            "series_C_inv": 0.0,
        }
        el = create_dipole(length=0.5, segments=21, gap=0.001, source=source)
        mesh = dipole_to_mesh(el)
        vs = VoltageSource(
            node_start=el.sources[0].node_start,
            node_end=el.sources[0].node_end,
            value=complex(1, 0),
        )
        D_dBi, D_avg, theta = _solve_and_compute_pattern(
            mesh.nodes, mesh.edges, mesh.radii, [vs], 300e6
        )

        # Equator (theta~90°) should have much higher directivity than poles
        equator_idx = len(theta) // 2  # theta=90°
        pole_val = D_avg[0]
        equator_val = D_avg[equator_idx]

        assert (
            equator_val > 10 * pole_val
        ), f"Dipole equator D={equator_val:.3f} should be >> pole D={pole_val:.3e}"
        assert 1.5 < D_dBi < 2.5, f"Dipole directivity {D_dBi:.2f} dBi not in expected range"

    def test_loop_pattern_max_at_equator(self):
        """XY-plane loop should have maximum radiation at theta=90° (equator).

        A small loop in the XY plane with normal along Z produces a
        sin²θ radiation pattern (magnetic dipole), identical in shape
        to a Z-directed electric dipole. The missing voltage source edge
        would create an open arc with an inverted pattern.
        """
        source = {
            "type": "voltage",
            "amplitude": {"real": 1.0, "imag": 0.0},
            "series_R": 0.0,
            "series_L": 0.0,
            "series_C_inv": 0.0,
        }
        el = create_loop(radius=0.05, segments=32, gap=0.0, source=source)
        mesh = loop_to_mesh(el)
        vs = VoltageSource(
            node_start=el.sources[0].node_start,
            node_end=el.sources[0].node_end,
            value=complex(1, 0),
        )
        D_dBi, D_avg, theta = _solve_and_compute_pattern(
            mesh.nodes, mesh.edges, mesh.radii, [vs], 1e6
        )

        equator_idx = len(theta) // 2
        pole_val = (D_avg[0] + D_avg[-1]) / 2
        equator_val = D_avg[equator_idx]

        # With correct closed-loop pattern: equator >> poles
        assert equator_val > 10 * pole_val, (
            f"Loop equator D={equator_val:.3f} should be >> pole D={pole_val:.3e}. "
            "Pattern appears inverted — voltage source edge may be missing."
        )
        assert 1.5 < D_dBi < 2.5, f"Loop directivity {D_dBi:.2f} dBi not in expected range"

    def test_loop_pattern_without_vs_edge_is_wrong(self):
        """Confirm that omitting the VS edge produces the wrong pattern."""
        source = {
            "type": "voltage",
            "amplitude": {"real": 1.0, "imag": 0.0},
            "series_R": 0.0,
            "series_L": 0.0,
            "series_C_inv": 0.0,
        }
        el = create_loop(radius=0.05, segments=32, gap=0.0, source=source)
        mesh = loop_to_mesh(el)
        vs = VoltageSource(
            node_start=el.sources[0].node_start,
            node_end=el.sources[0].node_end,
            value=complex(1, 0),
        )
        D_dBi, D_avg, theta = _solve_and_compute_pattern(
            mesh.nodes,
            mesh.edges,
            mesh.radii,
            [vs],
            1e6,
            include_vs_edges=False,
        )

        equator_idx = len(theta) // 2
        pole_val = (D_avg[0] + D_avg[-1]) / 2
        equator_val = D_avg[equator_idx]

        # Without VS edge: poles are STRONGER than equator (inverted pattern)
        assert (
            pole_val > equator_val
        ), "Without VS edge, loop pattern should be inverted (pole > equator)"
