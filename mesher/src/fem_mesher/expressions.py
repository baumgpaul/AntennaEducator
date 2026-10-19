"""Safe arithmetic expressions for geometry dimensions ("2*gap + r")."""

import ast
import math
import operator
from typing import Mapping

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
    return float(_eval(tree.body, names, expr))


def _eval(node: ast.AST, names: Mapping[str, float], source: str) -> float:
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return node.value
    if isinstance(node, ast.BinOp) and type(node.op) in _BINARY:
        return _BINARY[type(node.op)](
            _eval(node.left, names, source), _eval(node.right, names, source)
        )
    if isinstance(node, ast.UnaryOp) and type(node.op) in _UNARY:
        return _UNARY[type(node.op)](_eval(node.operand, names, source))
    if isinstance(node, ast.Name):
        if node.id in names:
            return names[node.id]
        if node.id in _CONSTANTS:
            return _CONSTANTS[node.id]
        raise ExpressionError(f"Unknown parameter {node.id!r} in {source!r}")
    if (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id in _FUNCTIONS
        and not node.keywords
    ):
        return _FUNCTIONS[node.func.id](*(_eval(a, names, source) for a in node.args))
    raise ExpressionError(f"Not allowed in an expression: {source!r}")


def evaluate_parameters(parameters: Mapping[str, Expr]) -> dict[str, float]:
    """Evaluate parameters in order; each may use the ones defined before it."""
    values: dict[str, float] = {}
    for name, expr in parameters.items():
        if not name.isidentifier() or name in _CONSTANTS or name in _FUNCTIONS:
            raise ExpressionError(f"Invalid parameter name {name!r}")
        values[name] = evaluate(expr, values)
    return values
