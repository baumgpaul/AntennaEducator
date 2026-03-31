"""
Variable and parameter context models for parametric antenna definitions.

Variables are evaluated in order — each variable can reference
previously defined variables and built-in constants.
"""

from pydantic import BaseModel, ConfigDict, field_validator

from backend.common.utils.expressions import (
    BUILTIN_CONSTANTS,
    CircularDependencyError,
    ExpressionError,
    detect_circular_dependencies,
    evaluate_expression,
)


class Variable(BaseModel):
    """A named variable with an expression that evaluates to a number."""

    model_config = ConfigDict(from_attributes=True)

    name: str
    expression: str
    unit: str | None = None
    description: str | None = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Variable name cannot be empty")
        if not v.isidentifier():
            raise ValueError(
                f"Variable name '{v}' is not a valid identifier "
                "(use letters, digits, underscores; cannot start with digit)"
            )
        if v in BUILTIN_CONSTANTS:
            raise ValueError(
                f"'{v}' is a built-in constant and cannot be used " "as a variable name"
            )
        return v

    @field_validator("expression")
    @classmethod
    def validate_expression_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Expression cannot be empty")
        return v.strip()


class VariableContext(BaseModel):
    """
    Ordered collection of variables.

    Variables are evaluated top-down: variable N can reference
    variables 1..N-1 and all built-in constants.
    """

    model_config = ConfigDict(from_attributes=True)

    variables: list[Variable] = []

    @field_validator("variables")
    @classmethod
    def validate_no_duplicate_names(cls, v: list[Variable]) -> list[Variable]:
        names: set[str] = set()
        for var in v:
            if var.name in names:
                raise ValueError(f"Duplicate variable name: '{var.name}'")
            names.add(var.name)
        return v

    def evaluate(self, extra_constants: dict[str, float] | None = None) -> dict[str, float]:
        """
        Evaluate all variables in order.

        Args:
            extra_constants: Additional name→value pairs available
                during evaluation (e.g., runtime parameters).

        Returns:
            Dict mapping variable name → evaluated numeric value.

        Raises:
            CircularDependencyError: If variables form a cycle.
            ExpressionError: If any expression fails to evaluate.
        """
        # Check for circular dependencies first
        var_pairs = [(v.name, v.expression) for v in self.variables]
        cycle = detect_circular_dependencies(var_pairs)
        if cycle is not None:
            raise CircularDependencyError(cycle)

        # Build evaluation context: built-in constants + extra
        context: dict[str, float] = dict(BUILTIN_CONSTANTS)
        if extra_constants:
            context.update(extra_constants)

        # Evaluate in order
        results: dict[str, float] = {}
        for var in self.variables:
            try:
                value = evaluate_expression(var.expression, context)
            except ExpressionError:
                raise
            except Exception as exc:
                raise ExpressionError(
                    var.expression,
                    f"Failed to evaluate variable '{var.name}': {exc}",
                )
            context[var.name] = value
            results[var.name] = value

        return results

    def evaluate_safe(
        self, extra_constants: dict[str, float] | None = None
    ) -> dict[str, float | str]:
        """
        Like evaluate(), but returns error messages instead of raising.

        Returns:
            Dict mapping variable name → numeric value or error string.
        """
        context: dict[str, float] = dict(BUILTIN_CONSTANTS)
        if extra_constants:
            context.update(extra_constants)

        results: dict[str, float | str] = {}
        for var in self.variables:
            try:
                value = evaluate_expression(var.expression, context)
                context[var.name] = value
                results[var.name] = value
            except ExpressionError as exc:
                results[var.name] = str(exc)

        return results


def default_variable_context() -> VariableContext:
    """
    Create a default VariableContext with a frequency variable.

    Returns:
        VariableContext with freq = 300e6 (300 MHz).
    """
    return VariableContext(
        variables=[
            Variable(
                name="freq",
                expression="300e6",
                unit="Hz",
                description="Operating frequency (300 MHz default)",
            ),
            Variable(
                name="wavelength",
                expression="C_0 / freq",
                unit="m",
                description="Wavelength at operating frequency",
            ),
        ]
    )
