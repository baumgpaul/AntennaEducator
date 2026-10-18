"""Course fixtures (courses/antenna_theory_peec) are complete and still physical."""

import importlib.util
import json
from pathlib import Path

import pytest

from backend.solver.schemas import AntennaInput, SolverConfiguration, VoltageSourceInput
from backend.solver.solver import solve_multi_antenna

REPO = Path(__file__).resolve().parents[2]
COURSE = REPO / "courses" / "antenna_theory_peec"
FILES = (
    "design_state.json",
    "simulation_results.json",
    "simulation_config.json",
    "documentation.md",
)
MODULES = json.loads((COURSE / "course_metadata.json").read_text(encoding="utf-8"))["modules"]


def _load(module: str, name: str):
    return json.loads((COURSE / module / name).read_text(encoding="utf-8"))


def _seeder_dirs() -> list[str]:
    spec = importlib.util.spec_from_file_location(
        "seed_courses", REPO / "dev_tools" / "seed_courses.py"
    )
    seeder = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(seeder)
    return [m["dir"] for m in seeder.MODULES]


def test_every_module_is_complete_and_seeded():
    assert _seeder_dirs() == MODULES
    for module in MODULES:
        for name in FILES:
            assert (COURSE / module / name).is_file(), f"{module}/{name}"


@pytest.mark.parametrize("module", MODULES)
def test_results_match_the_design(module):
    elements = _load(module, "design_state.json")["elements"]
    sweep = _load(module, "simulation_results.json")["frequencySweep"]
    assert sweep["isComplete"] and len(sweep["results"]) == len(sweep["frequencies"])
    for result in sweep["results"]:
        solutions = result["antenna_solutions"]
        assert [s["antenna_id"] for s in solutions] == [e["id"] for e in elements]
        for element, solution in zip(elements, solutions):
            assert len(solution["branch_currents"]) == len(element["mesh"]["edges"])


def test_monopole_stands_on_the_ground_plane():
    design = _load("08_monopole_ground_plane", "design_state.json")
    assert design["ground_plane"] is True
    (rod,) = design["elements"]
    assert min(z for _, _, z in rod["mesh"]["nodes"]) == 0.0
    assert [(s["node_start"], s["node_end"]) for s in rod["sources"]] == [(0, 1)]


def test_yagi_has_one_fed_element():
    elements = _load("09_yagi_uda", "design_state.json")["elements"]
    assert [bool(e["sources"]) for e in elements] == [
        False,
        True,
        False,
    ]  # reflector, driven, director


def test_monopole_fixture_matches_the_solver():
    """Regenerate the fixtures (dev_tools/generate_course_fixtures.py) if the physics changes."""
    (rod,) = _load("08_monopole_ground_plane", "design_state.json")["elements"]
    stored = next(
        r
        for r in _load("08_monopole_ground_plane", "simulation_results.json")["frequencySweep"][
            "results"
        ]
        if r["frequency"] == 300e6
    )["antenna_solutions"][0]["input_impedance"]
    antenna = AntennaInput(
        antenna_id=rod["id"],
        nodes=rod["mesh"]["nodes"],
        edges=rod["mesh"]["edges"],
        radii=rod["mesh"]["radii"],
        voltage_sources=[VoltageSourceInput(node_start=0, node_end=1, value=1.0)],
    )
    result = solve_multi_antenna([antenna], 300e6, SolverConfiguration(ground_plane=True))
    z = complex(result["antenna_solutions"][0]["input_impedance"])
    assert z == pytest.approx(complex(stored["real"], stored["imag"]), rel=1e-6)
    assert 30 < z.real < 50  # ~ half of the dipole's 73 Ohm near resonance
