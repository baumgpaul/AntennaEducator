"""Safe arithmetic expressions for geometry dimensions ("2*gap + r")."""

import ast
import math
import operator
from typing import Mapping

import numpy as np

Number = float | int
Expr = Number | str

_BINARY = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Pow: operator.pow,
}
_UNARY = {ast.UAdd: operator.pos, ast.USub: operator.neg}
_FUNCTIONS = {
    "sqrt": math.sqrt,
    "sin": math.sin,
    "cos": math.cos,
    "tan": math.tan,
    "atan2": math.atan2,
    "abs": abs,
    "min": min,
    "max": max,
}
_CONSTANTS = {"pi": math.pi}
# The same functions, element-wise on arrays (fields over many points)
_ARRAY_FUNCTIONS = {
    "sqrt": np.sqrt,
    "sin": np.sin,
    "cos": np.cos,
    "tan": np.tan,
    "atan2": np.arctan2,
    "abs": np.abs,
    "min": np.minimum,
    "max": np.maximum,
}


class ExpressionError(ValueError):
    pass


def evaluate(expr: Expr, names: Mapping[str, float]) -> float:
    """Value of a number or an arithmetic expression over ``names``.

    Only numbers, + - * / **, parentheses, parameter names, ``pi`` and a few
    math functions are allowed: no attribute access, no calls of anything else.
    """
    if isinstance(expr, bool):
        raise ExpressionError(f"Not a number: {expr!r}")
    if isinstance(expr, (int, float)):
        return float(expr)
    try:
        tree = ast.parse(expr.strip(), mode="eval")
    except SyntaxError as e:
        raise ExpressionError(f"Invalid expression {expr!r}: {e.msg}") from None
    return float(_eval(tree.body, names, expr, _FUNCTIONS))


def evaluate_field(
    expr: Expr, names: Mapping[str, float], x: np.ndarray, y: np.ndarray
) -> np.ndarray:
    """Expression evaluated at the points (x, y): parameters plus ``x`` and ``y`` [m].

    E.g. ``"V0*x/w"`` for a potential that varies along a boundary. Returns an
    array shaped like ``x``.
    """
    x = np.asarray(x, dtype=float)
    if isinstance(expr, bool):
        raise ExpressionError(f"Not a number: {expr!r}")
    if isinstance(expr, (int, float)):
        return np.full_like(x, float(expr))
    try:
        tree = ast.parse(expr.strip(), mode="eval")
    except SyntaxError as e:
        raise ExpressionError(f"Invalid expression {expr!r}: {e.msg}") from None
    value = _eval(
        tree.body, {**names, "x": x, "y": np.asarray(y, dtype=float)}, expr, _ARRAY_FUNCTIONS
    )
    return np.broadcast_to(np.asarray(value, dtype=float), x.shape).copy()


def _eval(node: ast.AST, names: Mapping, source: str, functions: Mapping):
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return node.value
    if isinstance(node, ast.BinOp) and type(node.op) in _BINARY:
        return _BINARY[type(node.op)](
            _eval(node.left, names, source, functions), _eval(node.right, names, source, functions)
        )
    if isinstance(node, ast.UnaryOp) and type(node.op) in _UNARY:
        return _UNARY[type(node.op)](_eval(node.operand, names, source, functions))
    if isinstance(node, ast.Name):
        if node.id in names:
            return names[node.id]
        if node.id in _CONSTANTS:
            return _CONSTANTS[node.id]
        raise ExpressionError(f"Unknown parameter {node.id!r} in {source!r}")
    if (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id in functions
        and not node.keywords
    ):
        return functions[node.func.id](*(_eval(a, names, source, functions) for a in node.args))
    raise ExpressionError(f"Not allowed in an expression: {source!r}")


def evaluate_parameters(parameters: Mapping[str, Expr]) -> dict[str, float]:
    """Evaluate parameters in order; each may use the ones defined before it."""
    values: dict[str, float] = {}
    for name, expr in parameters.items():
        if not name.isidentifier() or name in _CONSTANTS or name in _FUNCTIONS:
            raise ExpressionError(f"Invalid parameter name {name!r}")
        values[name] = evaluate(expr, values)
    return values
