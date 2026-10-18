"""Deploy only what a change touches (dev_tools/ci_changed_targets.py)."""

import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "ci_changed_targets", Path(__file__).parents[2] / "dev_tools" / "ci_changed_targets.py"
)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
ALL = ["preprocessor", "solver", "postprocessor", "projects"]


def test_service_change_builds_only_that_service():
    assert mod.targets(["backend/solver/solver.py"]) == (["solver"], False)


def test_shared_code_builds_everything():
    assert mod.targets(["backend/common/auth/activity.py"]) == (ALL, False)
    assert mod.targets(["requirements-lambda.txt"]) == (ALL, False)


def test_auth_goes_to_projects():
    assert mod.targets(["backend/auth/schemas.py"]) == (["projects"], False)


def test_frontend_and_docs():
    assert mod.targets(["frontend/src/App.tsx", "README.md", "tests/unit/x.py"]) == ([], True)
    assert mod.targets(["terraform/modules/cicd/iam.tf", ""]) == ([], False)
