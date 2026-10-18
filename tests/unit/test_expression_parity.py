"""B22: backend half of the shared expression parity cases (frontend has the other)."""

import json
import math
from pathlib import Path

import pytest

from backend.common.utils.expressions import ExpressionError, evaluate_expression

CASES = json.loads(
    (Path(__file__).parents[1] / "fixtures" / "expression_parity.json").read_text(encoding="utf-8")
)["cases"]


@pytest.mark.parametrize("case", CASES, ids=[c["expr"] for c in CASES])
def test_expression_parity(case):
    if case.get("error"):
        with pytest.raises(ExpressionError):
            evaluate_expression(case["expr"], case.get("vars"))
    else:
        result = evaluate_expression(case["expr"], case.get("vars"))
        assert math.isclose(result, case["value"], rel_tol=1e-12, abs_tol=1e-12)
