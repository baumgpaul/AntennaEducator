"""
Safe expression evaluator for parametric antenna definitions.

Uses Python's ast module to whitelist safe operations — no eval().
Supports arithmetic, math functions, and variable references.
"""

import ast
import math
import operator
from typing import Any

from backend.common.constants import C_0, EPSILON_0, MU_0, Z_0

# Allowed binary operators
_BINARY_OPS: dict[type, Any] = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Pow: operator.pow,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
}

# Allowed unary operators
_UNARY_OPS: dict[type, Any] = {
    ast.UAdd: operator.pos,
    ast.USub: operator.neg,
}

# Allowed math functions (safe subset)
ALLOWED_FUNCTIONS: dict[str, Any] = {
    "sin": math.sin,
    "cos": math.cos,
    "tan": math.tan,
    "asin": math.asin,
    "acos": math.acos,
    "atan": math.atan,
    "atan2": math.atan2,
    "sqrt": math.sqrt,
    "log": math.log,
    "log10": math.log10,
    "log2": math.log2,
    "exp": math.exp,
    "abs": abs,
    "min": min,
    "max": max,
    "pow": pow,
    "round": round,
    "degrees": math.degrees,
    "radians": math.radians,
}

# Built-in physical constants available in all expressions
BUILTIN_CONSTANTS: dict[str, float] = {
    "C_0": C_0,
    "MU_0": MU_0,
    "EPSILON_0": EPSILON_0,
    "Z_0": Z_0,
    "pi": math.pi,
    "e": math.e,
    "inf": math.inf,
}


class ExpressionError(Exception):
    """Raised when an expression cannot be parsed or evaluated."""

    def __init__(self, expression: str, message: str):
        self.expression = expression
        super().__init__(f"Expression '{expression}': {message}")


class CircularDependencyError(ExpressionError):
    """Raised when variables form a circular dependency."""

    def __init__(self, cycle: list[str]):
        self.cycle = cycle
        cycle_str = " -> ".join(cycle)
        super().__init__(cycle_str, f"Circular dependency detected: {cycle_str}")


def _safe_eval_node(node: ast.AST, variables: dict[str, float], expression: str) -> float:
    """Recursively evaluate a single AST node against allowed operations."""
    # Numeric literal
    if isinstance(node, ast.Constant):
        if isinstance(node.value, (int, float)):
            return float(node.value)
        raise ExpressionError(
            expression,
            f"Unsupported constant type: {type(node.value).__name__}",
        )

    # Variable / constant reference
    if isinstance(node, ast.Name):
        name = node.id
        if name in variables:
            return variables[name]
        if name in BUILTIN_CONSTANTS:
            return BUILTIN_CONSTANTS[name]
        if name in ALLOWED_FUNCTIONS:
            raise ExpressionError(
                expression,
                f"'{name}' is a function, not a variable — use {name}(...)",
            )
        raise ExpressionError(expression, f"Unknown variable '{name}'")

    # Binary operation: a + b, a * b, etc.
    if isinstance(node, ast.BinOp):
        op_type = type(node.op)
        if op_type not in _BINARY_OPS:
            raise ExpressionError(
                expression,
                f"Unsupported operator: {op_type.__name__}",
            )
        left = _safe_eval_node(node.left, variables, expression)
        right = _safe_eval_node(node.right, variables, expression)
        try:
            return _BINARY_OPS[op_type](left, right)
        except ZeroDivisionError:
            raise ExpressionError(expression, "Division by zero")
        except OverflowError:
            raise ExpressionError(expression, "Numeric overflow")

    # Unary operation: -x, +x
    if isinstance(node, ast.UnaryOp):
        op_type = type(node.op)
        if op_type not in _UNARY_OPS:
            raise ExpressionError(
                expression,
                f"Unsupported unary operator: {op_type.__name__}",
            )
        operand = _safe_eval_node(node.operand, variables, expression)
        return _UNARY_OPS[op_type](operand)

    # Function call: sin(x), sqrt(x), etc.
    if isinstance(node, ast.Call):
        if not isinstance(node.func, ast.Name):
            raise ExpressionError(expression, "Only simple function calls are allowed")
        func_name = node.func.id
        if func_name not in ALLOWED_FUNCTIONS:
            raise ExpressionError(expression, f"Unknown function '{func_name}'")
        args = [_safe_eval_node(arg, variables, expression) for arg in node.args]
        if node.keywords:
            raise ExpressionError(expression, "Keyword arguments are not allowed")
        try:
            return float(ALLOWED_FUNCTIONS[func_name](*args))
        except (ValueError, TypeError) as exc:
            raise ExpressionError(
                expression,
                f"Error calling {func_name}: {exc}",
            )

    # Expression wrapper (top-level)
    if isinstance(node, ast.Expression):
        return _safe_eval_node(node.body, variables, expression)

    raise ExpressionError(
        expression,
        f"Unsupported syntax: {type(node).__name__}",
    )


def evaluate_expression(expression: str, variables: dict[str, float] | None = None) -> float:
    """
    Safely evaluate a mathematical expression string.

    Supports arithmetic, math functions, and variable/constant references.
    Uses AST whitelisting — no eval().

    Args:
        expression: Mathematical expression string (e.g., "C_0 / freq / 4")
        variables: Optional dict of variable name → numeric value

    Returns:
        Evaluated numeric result

    Raises:
        ExpressionError: If the expression is invalid or cannot be evaluated
    """
    if variables is None:
        variables = {}

    expr_str = expression.strip()
    if not expr_str:
        raise ExpressionError(expression, "Empty expression")

    try:
        tree = ast.parse(expr_str, mode="eval")
    except SyntaxError as exc:
        raise ExpressionError(expression, f"Syntax error: {exc.msg}")

    result = _safe_eval_node(tree, variables, expression)

    if math.isnan(result):
        raise ExpressionError(expression, "Result is NaN")

    return result


def parse_numeric_or_expression(
    value: float | str, variables: dict[str, float] | None = None
) -> float:
    """
    Parse a value that can be either a numeric literal or an expression string.

    Args:
        value: Either a float/int or a string expression
        variables: Variable context for expression evaluation

    Returns:
        Numeric result
    """
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        return evaluate_expression(value, variables)
    raise ExpressionError(str(value), f"Expected number or string, got {type(value).__name__}")


def get_expression_variables(expression: str) -> set[str]:
    """
    Extract all variable names referenced in an expression.

    Args:
        expression: Mathematical expression string

    Returns:
        Set of variable names (excludes built-in constants and functions)
    """
    expr_str = expression.strip()
    if not expr_str:
        return set()

    try:
        tree = ast.parse(expr_str, mode="eval")
    except SyntaxError:
        return set()

    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Name):
            name = node.id
            if name not in BUILTIN_CONSTANTS and name not in ALLOWED_FUNCTIONS:
                names.add(name)
    return names


def detect_circular_dependencies(
    variables: list[tuple[str, str]],
) -> list[str] | None:
    """
    Check for circular dependencies in a list of (name, expression) pairs.

    Uses depth-first search to detect cycles.

    Args:
        variables: Ordered list of (variable_name, expression_string) tuples

    Returns:
        List of variable names forming a cycle, or None if no cycle exists
    """
    # Build adjacency list: var → set of vars it depends on
    var_names = {name for name, _ in variables}
    deps: dict[str, set[str]] = {}
    for name, expr in variables:
        referenced = get_expression_variables(expr)
        deps[name] = referenced & var_names

    # DFS cycle detection
    WHITE, GRAY, BLACK = 0, 1, 2
    color: dict[str, int] = {name: WHITE for name in var_names}
    path: list[str] = []

    def dfs(node: str) -> list[str] | None:
        color[node] = GRAY
        path.append(node)
        for dep in deps.get(node, set()):
            if color[dep] == GRAY:
                cycle_start = path.index(dep)
                return path[cycle_start:] + [dep]
            if color[dep] == WHITE:
                result = dfs(dep)
                if result is not None:
                    return result
        path.pop()
        color[node] = BLACK
        return None

    for name in var_names:
        if color[name] == WHITE:
            cycle = dfs(name)
            if cycle is not None:
                return cycle

    return None
