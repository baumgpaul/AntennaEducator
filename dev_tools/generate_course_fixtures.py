#!/usr/bin/env python
"""
generate_course_fixtures.py — Dev tool for pre-computing course exercise fixtures.

Runs the PEEC solver directly (no HTTP services required) and writes
design_state.json + simulation_results.json for each course module so that
seed_courses.py can seed fully pre-solved projects.

Usage:
    python dev_tools/generate_course_fixtures.py
    python dev_tools/generate_course_fixtures.py --modules 01 05 07
    python dev_tools/generate_course_fixtures.py --force   # overwrite existing

After running, commit the generated JSON files so the seeder can use them.
"""

import argparse
import json
import logging
import sys
import time
import uuid
from pathlib import Path
from typing import Any

import numpy as np

# Add repo root to path
REPO_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(REPO_ROOT))

from backend.preprocessor.builders import create_dipole, create_loop, dipole_to_mesh, loop_to_mesh
from backend.solver.schemas import AntennaInput, SolverConfiguration, VoltageSourceInput
from backend.solver.solver import solve_multi_antenna

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger("fixtures")

COURSES_DIR = REPO_ROOT / "courses" / "antenna_theory_peec"

# ── Serialization helpers ──────────────────────────────────────────────────────


def c2d(z: complex) -> dict:
    """Convert complex number to {real, imag} dict for JSON serialization."""
    z = complex(z)
    return {"real": z.real, "imag": z.imag}


def arr_c2d(arr) -> list:
    """Convert array of complex numbers to list of {real, imag} dicts."""
    return [c2d(z) for z in arr]


def default_serializer(obj: Any) -> Any:
    """JSON encoder for numpy types and complex numbers."""
    if isinstance(obj, complex):
        return c2d(obj)
    if isinstance(obj, np.complexfloating):
        return c2d(complex(obj))
    if isinstance(obj, np.floating):
        return float(obj)
    if isinstance(obj, np.integer):
        return int(obj)
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")


def save_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, default=default_serializer)
    log.info(f"  Wrote {path.relative_to(REPO_ROOT)}")


# ── Design state builders ──────────────────────────────────────────────────────


def make_dipole_element(
    *,
    element_id: str,
    name: str,
    length: float,
    wire_radius: float = 0.001,
    gap: float = 0.01,
    segments: int = 21,
    position: list = None,
    color: str = "#FF8C00",
) -> tuple[dict, Any, Any]:
    """
    Build a frontend-compatible AntennaElement dict + backend element + mesh.
    Returns (frontend_element_dict, backend_element, backend_mesh).
    """
    if position is None:
        position = [0.0, 0.0, 0.0]

    backend_el = create_dipole(
        length=length,
        center_position=(0.0, 0.0, 0.0),
        orientation=(0.0, 0.0, 1.0),
        wire_radius=wire_radius,
        gap=gap,
        segments=segments,
        source={"type": "voltage", "amplitude": 1.0},
        name=name,
    )
    backend_mesh = dipole_to_mesh(backend_el)

    # Default port: feed gap (node 11 → node 12 for 21-segment gap dipole)
    n_seg = segments // 2
    feed_lower = n_seg + 1
    feed_upper = n_seg + 2

    frontend_sources = [
        {
            "type": s.type,
            "amplitude": c2d(s.amplitude),
            "node_start": s.node_start,
            "node_end": s.node_end,
            "series_R": s.series_R,
            "series_L": s.series_L,
            "series_C_inv": s.series_C_inv,
            "tag": s.tag,
        }
        for s in backend_el.sources
    ]

    frontend_element = {
        "id": element_id,
        "type": "dipole",
        "name": name,
        "config": {
            "length": length,
            "wire_radius": wire_radius,
            "gap": gap,
            "segments": segments,
            "center_position": [0.0, 0.0, 0.0],
            "orientation": [0.0, 0.0, 1.0],
            "balanced_feed": False,
        },
        "position": position,
        "rotation": [0.0, 0.0, 0.0],
        "mesh": {
            "nodes": backend_mesh.nodes,
            "edges": backend_mesh.edges,
            "radii": backend_mesh.radii,
        },
        "sources": frontend_sources,
        "lumped_elements": [],
        "ports": [
            {
                "id": str(uuid.uuid4()),
                "node_start": feed_lower,
                "node_end": 0,
                "z0": 50.0,
                "label": "Port 1",
            }
        ],
        "appended_nodes": [],
        "visible": True,
        "locked": False,
        "color": color,
    }

    return frontend_element, backend_el, backend_mesh


def make_loop_element(
    *,
    element_id: str,
    name: str,
    radius: float = 0.1,
    wire_radius: float = 0.001,
    segments: int = 20,
    position: list = None,
    color: str = "#00AEFF",
) -> tuple[dict, Any, Any]:
    """Build a frontend-compatible circular loop AntennaElement dict."""
    if position is None:
        position = [0.0, 0.0, 0.0]

    backend_el = create_loop(
        radius=radius,
        center_position=(0.0, 0.0, 0.0),
        normal_vector=(0.0, 0.0, 1.0),
        wire_radius=wire_radius,
        segments=segments,
        source={"type": "voltage", "amplitude": {"real": 1.0, "imag": 0.0}},
        name=name,
    )
    backend_mesh = loop_to_mesh(backend_el)

    frontend_sources = [
        {
            "type": s.type,
            "amplitude": c2d(s.amplitude),
            "node_start": s.node_start,
            "node_end": s.node_end,
            "series_R": s.series_R,
            "series_L": s.series_L,
            "series_C_inv": s.series_C_inv,
            "tag": s.tag,
        }
        for s in backend_el.sources
    ]

    frontend_element = {
        "id": element_id,
        "type": "loop",
        "name": name,
        "config": {
            "radius": radius,
            "wire_radius": wire_radius,
            "segments": segments,
            "center_position": [0.0, 0.0, 0.0],
            "normal_vector": [0.0, 0.0, 1.0],
        },
        "position": position,
        "rotation": [0.0, 0.0, 0.0],
        "mesh": {
            "nodes": backend_mesh.nodes,
            "edges": backend_mesh.edges,
            "radii": backend_mesh.radii,
        },
        "sources": frontend_sources,
        "lumped_elements": [],
        "ports": [],
        "appended_nodes": [],
        "visible": True,
        "locked": False,
        "color": color,
    }

    return frontend_element, backend_el, backend_mesh


# ── Solver helpers ─────────────────────────────────────────────────────────────


def make_antenna_input(element_id: str, backend_el: Any, backend_mesh: Any) -> AntennaInput:
    """Convert backend element + mesh to AntennaInput for the multi-antenna solver."""
    vs_inputs = []
    cs_inputs = []

    for s in backend_el.sources:
        if s.type == "voltage":
            vs_inputs.append(
                VoltageSourceInput(
                    node_start=s.node_start,
                    node_end=s.node_end,
                    value=s.amplitude,
                    R=s.series_R,
                    L=s.series_L,
                    C_inv=s.series_C_inv,
                )
            )
        # current sources omitted for standard gap-fed dipoles

    return AntennaInput(
        antenna_id=element_id,
        nodes=backend_mesh.nodes,
        edges=backend_mesh.edges,
        radii=backend_mesh.radii,
        voltage_sources=vs_inputs,
        current_sources=cs_inputs,
        loads=[],
    )


def run_sweep(
    element_id: str,
    backend_el: Any,
    backend_mesh: Any,
    frequencies_hz: list[float],
    config: SolverConfiguration = None,
) -> dict:
    """
    Run a frequency sweep for one element and return simulation_results dict
    compatible with the frontend's frequencySweep format.
    """
    if config is None:
        config = SolverConfiguration()

    antenna_input = make_antenna_input(element_id, backend_el, backend_mesh)
    antennas = [antenna_input]

    results = []
    current_distributions = []

    for i, freq_hz in enumerate(frequencies_hz):
        log.info(f"    [{i+1}/{len(frequencies_hz)}] f = {freq_hz/1e6:.1f} MHz ...")
        t0 = time.time()
        result = solve_multi_antenna(antennas, freq_hz, config)
        dt = time.time() - t0

        # Serialize complex arrays
        sol = result["antenna_solutions"][0]
        serialized_sol = {
            "antenna_id": sol["antenna_id"],
            "branch_currents": arr_c2d(sol["branch_currents"]),
            "voltage_source_currents": arr_c2d(sol.get("voltage_source_currents", [])),
            "load_currents": arr_c2d(sol.get("load_currents", [])),
            "node_voltages": arr_c2d(sol["node_voltages"]),
            "appended_voltages": arr_c2d(sol.get("appended_voltages", [])),
            "input_impedance": c2d(sol.get("input_impedance", 0j)),
        }

        serialized_result = {
            "frequency": float(freq_hz),
            "converged": bool(result["converged"]),
            "antenna_solutions": [serialized_sol],
            "n_total_nodes": int(result["n_total_nodes"]),
            "n_total_edges": int(result["n_total_edges"]),
            "solve_time": float(dt),
        }
        results.append(serialized_result)

        # Current magnitudes for visualization
        currents_mag = [
            abs(complex(c["real"], c["imag"])) for c in serialized_sol["branch_currents"]
        ]
        current_distributions.append(
            {
                "frequency": float(freq_hz),
                "currents": [currents_mag],
            }
        )

    last_freq = frequencies_hz[-1]

    return {
        "solveMode": "sweep",
        "solverState": "solved",
        "currentFrequency": float(last_freq / 1e6),  # MHz
        "selectedFrequencyHz": float(last_freq),
        "frequencySweep": {
            "frequencies": [float(f) for f in frequencies_hz],
            "results": results,
            "completedCount": len(results),
            "totalCount": len(frequencies_hz),
            "isComplete": True,
            "currentDistributions": current_distributions,
        },
        "multiAntennaResults": results[-1],  # last frequency as active result
        "results": None,
        "currentDistribution": current_distributions[-1]["currents"][0],
        "radiationPattern": None,
        "radiationPatterns": None,
        "requestedFields": [],
        "directivityRequested": False,
        "directivitySettings": {"theta_points": 19, "phi_points": 37},
        "fieldResults": None,
        "fieldData": None,
        "resultsStale": False,
        "parameterStudy": None,
        "parameterStudyConfig": None,
    }


# ── Per-module fixture generators ──────────────────────────────────────────────


def generate_module_01(force: bool) -> None:
    """Module 1: Fundamental Parameters — half-wave dipole, frequency sweep."""
    module_dir = COURSES_DIR / "01_fundamental_parameters"
    ds_path = module_dir / "design_state.json"
    sr_path = module_dir / "simulation_results.json"
    sc_path = module_dir / "simulation_config.json"

    if ds_path.exists() and not force:
        log.info("  Module 01: already exists, skipping (use --force to regenerate)")
        return

    log.info("  Module 01: Fundamental Parameters (L=0.47m, 200–400 MHz sweep)")

    element_id = "dipole_module01"
    fe, be, bm = make_dipole_element(
        element_id=element_id,
        name="Half-Wave Dipole",
        length=0.47,
        wire_radius=0.001,
        gap=0.01,
        segments=21,
        color="#FF8C00",
    )

    design_state = {"elements": [fe], "variables": [], "version": 3}

    # Frequency sweep 200–400 MHz, 21 points
    freqs = np.linspace(200e6, 400e6, 21).tolist()
    sim_results = run_sweep(element_id, be, bm, freqs)

    sim_config = {"requested_fields": []}

    save_json(ds_path, design_state)
    save_json(sr_path, sim_results)
    save_json(sc_path, sim_config)


def generate_module_02(force: bool) -> None:
    """Module 2: Current Distribution — dipole at multiple frequencies."""
    module_dir = COURSES_DIR / "02_current_distribution"
    ds_path = module_dir / "design_state.json"
    sr_path = module_dir / "simulation_results.json"
    sc_path = module_dir / "simulation_config.json"

    if ds_path.exists() and not force:
        log.info("  Module 02: already exists, skipping")
        return

    log.info("  Module 02: Current Distribution (L=0.5m, 100–700 MHz sweep)")

    element_id = "dipole_module02"
    fe, be, bm = make_dipole_element(
        element_id=element_id,
        name="Dipole L=0.5m",
        length=0.50,
        wire_radius=0.001,
        gap=0.01,
        segments=21,
        color="#FF8C00",
    )

    design_state = {"elements": [fe], "variables": [], "version": 3}

    # 3 key frequencies + surrounding sweep for context
    freqs = [150e6, 300e6, 600e6]
    sim_results = run_sweep(element_id, be, bm, freqs)

    sim_config = {"requested_fields": []}

    save_json(ds_path, design_state)
    save_json(sr_path, sim_results)
    save_json(sc_path, sim_config)


def generate_module_03(force: bool) -> None:
    """Module 3: Hertz Dipole & Field Theory — short dipole."""
    module_dir = COURSES_DIR / "03_hertz_dipole_field_theory"
    ds_path = module_dir / "design_state.json"
    sr_path = module_dir / "simulation_results.json"
    sc_path = module_dir / "simulation_config.json"

    if ds_path.exists() and not force:
        log.info("  Module 03: already exists, skipping")
        return

    log.info("  Module 03: Hertz Dipole (L=0.05m, 300 MHz)")

    element_id = "dipole_module03"
    fe, be, bm = make_dipole_element(
        element_id=element_id,
        name="Short Dipole (Hertz)",
        length=0.05,
        wire_radius=0.0005,
        gap=0.005,
        segments=11,
        color="#FF8C00",
    )

    design_state = {"elements": [fe], "variables": [], "version": 3}

    freqs = [300e6]
    sim_results = run_sweep(element_id, be, bm, freqs)

    sim_config = {"requested_fields": []}

    save_json(ds_path, design_state)
    save_json(sr_path, sim_results)
    save_json(sc_path, sim_config)


def generate_module_04(force: bool) -> None:
    """Module 4: Wave Polarization — half-wave dipole, single frequency."""
    module_dir = COURSES_DIR / "04_wave_polarization"
    ds_path = module_dir / "design_state.json"
    sr_path = module_dir / "simulation_results.json"
    sc_path = module_dir / "simulation_config.json"

    if ds_path.exists() and not force:
        log.info("  Module 04: already exists, skipping")
        return

    log.info("  Module 04: Polarization (L=0.5m, 300 MHz)")

    element_id = "dipole_module04"
    fe, be, bm = make_dipole_element(
        element_id=element_id,
        name="Dipole (Polarization Study)",
        length=0.50,
        wire_radius=0.001,
        gap=0.01,
        segments=21,
        color="#FF8C00",
    )

    design_state = {"elements": [fe], "variables": [], "version": 3}

    freqs = [300e6]
    sim_results = run_sweep(element_id, be, bm, freqs)

    sim_config = {"requested_fields": []}

    save_json(ds_path, design_state)
    save_json(sr_path, sim_results)
    save_json(sc_path, sim_config)


def generate_module_05(force: bool) -> None:
    """Module 5: Radiation Pattern — half-wave dipole, single frequency."""
    module_dir = COURSES_DIR / "05_radiation_pattern"
    ds_path = module_dir / "design_state.json"
    sr_path = module_dir / "simulation_results.json"
    sc_path = module_dir / "simulation_config.json"

    if ds_path.exists() and not force:
        log.info("  Module 05: already exists, skipping")
        return

    log.info("  Module 05: Radiation Pattern (L=0.5m, 300 MHz)")

    element_id = "dipole_module05"
    fe, be, bm = make_dipole_element(
        element_id=element_id,
        name="Half-Wave Dipole (Pattern)",
        length=0.50,
        wire_radius=0.001,
        gap=0.01,
        segments=21,
        color="#FF8C00",
    )

    design_state = {"elements": [fe], "variables": [], "version": 3}

    freqs = [300e6]
    sim_results = run_sweep(element_id, be, bm, freqs)

    sim_config = {"requested_fields": []}

    save_json(ds_path, design_state)
    save_json(sr_path, sim_results)
    save_json(sc_path, sim_config)


def generate_module_06(force: bool) -> None:
    """Module 6: Loop Antenna — rectangular loop."""
    module_dir = COURSES_DIR / "06_loop_antenna"
    ds_path = module_dir / "design_state.json"
    sr_path = module_dir / "simulation_results.json"
    sc_path = module_dir / "simulation_config.json"

    if ds_path.exists() and not force:
        log.info("  Module 06: already exists, skipping")
        return

    log.info("  Module 06: Loop Antenna (s=0.1m, 100–500 MHz sweep)")

    element_id = "loop_module06"
    # radius = 0.1m perimeter / (2π) ≈ equivalent perimeter to 0.1m-side square loop
    loop_radius = 0.1 / np.pi  # C=2πr → r=C/(2π), use C≈0.63m for equivalent area
    fe, be, bm = make_loop_element(
        element_id=element_id,
        name="Small Circular Loop (r=0.1m)",
        radius=0.1,
        wire_radius=0.001,
        segments=20,
        color="#00AEFF",
    )

    design_state = {"elements": [fe], "variables": [], "version": 3}

    freqs = np.linspace(100e6, 500e6, 21).tolist()
    sim_results = run_sweep(element_id, be, bm, freqs)

    sim_config = {"requested_fields": []}

    save_json(ds_path, design_state)
    save_json(sr_path, sim_results)
    save_json(sc_path, sim_config)


def generate_module_07(force: bool) -> None:
    """Module 7: Linear Arrays — two half-wave dipoles, d=lambda/2."""
    module_dir = COURSES_DIR / "07_linear_arrays"
    ds_path = module_dir / "design_state.json"
    sr_path = module_dir / "simulation_results.json"
    sc_path = module_dir / "simulation_config.json"

    if ds_path.exists() and not force:
        log.info("  Module 07: already exists, skipping")
        return

    log.info("  Module 07: Linear Array (2 dipoles, d=λ/2=0.5m, 300 MHz)")

    element_id_1 = "dipole_module07_a"
    element_id_2 = "dipole_module07_b"

    fe1, be1, bm1 = make_dipole_element(
        element_id=element_id_1,
        name="Dipole Array #1",
        length=0.50,
        wire_radius=0.001,
        gap=0.01,
        segments=21,
        position=[-0.25, 0.0, 0.0],
        color="#FF8C00",
    )
    fe2, be2, bm2 = make_dipole_element(
        element_id=element_id_2,
        name="Dipole Array #2",
        length=0.50,
        wire_radius=0.001,
        gap=0.01,
        segments=21,
        position=[0.25, 0.0, 0.0],
        color="#FF6600",
    )

    design_state = {"elements": [fe1, fe2], "variables": [], "version": 3}

    # For the array, we need to run the multi-antenna solver with both dipoles
    log.info("    Running multi-antenna solver for 2-element array at 300 MHz ...")
    ai1 = make_antenna_input(element_id_1, be1, bm1)
    ai2 = make_antenna_input(element_id_2, be2, bm2)
    config = SolverConfiguration()
    freq_hz = 300e6

    t0 = time.time()
    result = solve_multi_antenna([ai1, ai2], freq_hz, config)
    dt = time.time() - t0

    def serialize_sol(sol):
        return {
            "antenna_id": sol["antenna_id"],
            "branch_currents": arr_c2d(sol["branch_currents"]),
            "voltage_source_currents": arr_c2d(sol.get("voltage_source_currents", [])),
            "load_currents": arr_c2d(sol.get("load_currents", [])),
            "node_voltages": arr_c2d(sol["node_voltages"]),
            "appended_voltages": arr_c2d(sol.get("appended_voltages", [])),
            "input_impedance": c2d(sol.get("input_impedance", 0j)),
        }

    serialized_result = {
        "frequency": float(freq_hz),
        "converged": bool(result["converged"]),
        "antenna_solutions": [serialize_sol(s) for s in result["antenna_solutions"]],
        "n_total_nodes": int(result["n_total_nodes"]),
        "n_total_edges": int(result["n_total_edges"]),
        "solve_time": float(dt),
    }

    # Current magnitudes for both antennas
    current_distributions = []
    for sol_raw, sol_ser in zip(
        result["antenna_solutions"], serialized_result["antenna_solutions"]
    ):
        currents_mag = [abs(complex(c["real"], c["imag"])) for c in sol_ser["branch_currents"]]
        current_distributions.append(currents_mag)

    sim_results = {
        "solveMode": "sweep",
        "solverState": "solved",
        "currentFrequency": float(freq_hz / 1e6),
        "selectedFrequencyHz": float(freq_hz),
        "frequencySweep": {
            "frequencies": [float(freq_hz)],
            "results": [serialized_result],
            "completedCount": 1,
            "totalCount": 1,
            "isComplete": True,
            "currentDistributions": [
                {"frequency": float(freq_hz), "currents": current_distributions}
            ],
        },
        "multiAntennaResults": serialized_result,
        "results": None,
        "currentDistribution": current_distributions[0],
        "radiationPattern": None,
        "radiationPatterns": None,
        "requestedFields": [],
        "directivityRequested": False,
        "directivitySettings": {"theta_points": 19, "phi_points": 37},
        "fieldResults": None,
        "fieldData": None,
        "resultsStale": False,
        "parameterStudy": None,
        "parameterStudyConfig": None,
    }

    sim_config = {"requested_fields": []}

    save_json(ds_path, design_state)
    save_json(sr_path, sim_results)
    save_json(sc_path, sim_config)


# ── Main ───────────────────────────────────────────────────────────────────────

MODULE_GENERATORS = {
    "01": generate_module_01,
    "02": generate_module_02,
    "03": generate_module_03,
    "04": generate_module_04,
    "05": generate_module_05,
    "06": generate_module_06,
    "07": generate_module_07,
}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--modules",
        nargs="*",
        metavar="NN",
        help="Module numbers to generate (e.g. 01 03 07). Defaults to all.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite existing fixture files.",
    )
    args = parser.parse_args()

    modules = args.modules or list(MODULE_GENERATORS.keys())
    invalid = [m for m in modules if m not in MODULE_GENERATORS]
    if invalid:
        log.error(f"Unknown module(s): {invalid}. Valid: {list(MODULE_GENERATORS.keys())}")
        sys.exit(1)

    log.info(f"Generating fixtures for modules: {modules}")
    log.info(f"Output directory: {COURSES_DIR}")

    for mod in modules:
        log.info(f"\nModule {mod}:")
        MODULE_GENERATORS[mod](force=args.force)

    log.info("\nDone. Commit the generated JSON files before running seed_courses.py.")


if __name__ == "__main__":
    main()
